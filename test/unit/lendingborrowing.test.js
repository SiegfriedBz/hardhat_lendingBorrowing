const { deployments, ethers } = require("hardhat")
const { INTEREST_RATE } = require("../../helper-hardhat-config")
const { expect } = require("chai")
const { solidity } = require("ethereum-waffle")
require("hardhat-gas-reporter")

describe("LendingBorrowing", function () {
  let contract
  let deployer, user01, user02, user03
  let amountToFund = ethers.utils.parseEther("1")
  let amountToBorrow = ethers.utils.parseEther("0.5")

  beforeEach(async function () {
    ;[deployer, user01, user02, user03] = await ethers.getSigners()
    await deployments.fixture(["all"])
    contract = await ethers.getContract('LendingBorrowing', deployer)
  })

  describe("constructor", async function () {
    it("allows to set the correct interest rate", async function () {
      console.log(`Contract deployed to : ${contract.address}`)
      let interestRate = await contract.i_interestRate()
      expect(interestRate.toString()).to.equal(INTEREST_RATE.toString())
    })

    it("allows to set the right owner", async function () {
      expect(await contract.i_owner()).to.equal(deployer.address)
    })
  })

  describe("lend", async function () {
    describe('happy path', async function () {
      it("allows to deposit funds", async function () {
        let contract_InitialBalance = await ethers.provider.getBalance(
          contract.address
        )
        let transactionResponse = await contract.lend({ value: amountToFund })
        await transactionResponse.wait(1)
        let deployer_ContractBalance = await contract.lenderToBalance(
          deployer.address
        )
        let contract_Balance_Init = await ethers.provider.getBalance(contract.address)
        // assert
        expect(contract_InitialBalance.toString()).to.equal("0")
        expect(deployer_ContractBalance.toString())
        .to.equal(contract_Balance_Init.toString())
      })

      it("allows to add the funder to the lenders array", async function () {
        // initial : lenders array is expected to be empty
        await expect(contract.lenders(0)).to.be.reverted

        // act : deployer lends ETH
        await contract.lend({ value: amountToFund })
        // assert
        expect(await contract.lenders(0)).to.equal(deployer.address)
      })

    })
    describe('unhappy path', async function () {
      it("prevents to send 0 ETH and reverts with the correct custom code", async function () {
        await expect(contract.lend({ value: 0 }))
        .to.be.revertedWithCustomError(contract, "AmountCanNotBeNull")})
    })
  })

  describe('borrow', async function() {
    let activeLoanCounter_Init

    beforeEach(async function() {
      await contract.lend({value: amountToFund})
      activeLoanCounter_Init = await contract.totalActiveLoanCounter()
    })

    describe('happy path', async function() {
      describe('with an amount to borrow < contract balance', async function() {

        it("allows to track correctly the number of total active Loans", async function() {
          // act : user01 borrowing
          await contract.connect(user01).borrow(amountToBorrow)
          // assert
          let activeLoanCounter_Final = await contract.totalActiveLoanCounter()
          expect(activeLoanCounter_Final).to.equal(activeLoanCounter_Init.add(1))
        })

        it ('allows to set correctly the borrower debt', async function() {
          // act : user01 borrowing
          await contract.connect(user01).borrow(amountToBorrow)
          // assert
          let user01_Debt = await contract.getBorrowerLoanDueDebt(user01.address, 0) // function getBorrowerLoanDueDebt(address _borrower, uint256 _loanId)
          let expectedUser01Debt = amountToBorrow
          .add(amountToBorrow
            .mul(INTEREST_RATE)
            .div(ethers.utils.parseEther("1")))
          expect(user01_Debt).to.equal(expectedUser01Debt)
        })

        it ('allows to update all (lenders and borrower) balances', async function() {
          // set up : deployer lending 1ETH + user01 lending 2ETH
          await contract.connect(user01).lend({value: amountToFund.mul(2)})
          let numberOfLenders = await contract.getNumberOfLenders()
          let contract_Balance_Init = await ethers.provider.getBalance(contract.address)
          let deployer_ContractBalance_Init = await contract.lenderToBalance(
            deployer.address
          )
          let user01_ContractBalance_Init = await contract.lenderToBalance(
            user01.address
          )
          // assert set up
          expect(numberOfLenders.toString()).to.equal("2")
          expect(contract_Balance_Init).to.equal(amountToFund.mul(3))
          expect(deployer_ContractBalance_Init).to.equal(amountToFund)
          expect(user01_ContractBalance_Init).to.equal(amountToFund.mul(2))

          // act : user02 borrowing
          await contract.connect(user02).borrow(amountToBorrow)
          let user02_Debt = await contract.getBorrowerLoanDueDebt(user02.address, 0)

          // calculate each lender expected amount borrowed
          let deployer_ExpectedAmountBorrowed = amountToBorrow
          .mul(deployer_ContractBalance_Init)
          .div(contract_Balance_Init)
          let user01_ExpectedAmountBorrowed = amountToBorrow
          .mul(user01_ContractBalance_Init)
          .div(contract_Balance_Init)

          // assert lenders amount borrowed
          let deployer_ContractBalance = await contract.lenderToBalance(
            deployer.address
          )
          let user01_ContractBalance = await contract.lenderToBalance(
            user01.address
          )
          expect(deployer_ContractBalance).to.equal(deployer_ContractBalance_Init
            .sub(deployer_ExpectedAmountBorrowed))
          expect(user01_ContractBalance).to.equal(user01_ContractBalance_Init
            .sub(user01_ExpectedAmountBorrowed))

          // calculate each lender expected due debt (with interest)
          let deployer_Expected_DebtWithInterest = user02_Debt
          .mul(deployer_ContractBalance_Init)
          .div(contract_Balance_Init)
          let user01_Expected_DebtWithInterest = user02_Debt
          .mul(user01_ContractBalance_Init)
          .div(contract_Balance_Init)

          // assert each lender due debt
          let deployer_DebtWithInterest = await contract.getBorrowerLoanDueDebtToLender(
            user02.address, // borrower
            0, // loanId
            deployer.address) // lender
          let user01_DebtWithInterest = await contract.getBorrowerLoanDueDebtToLender(
            user02.address, // borrower
            0, // loanId
            user01.address) // lender
          expect(deployer_DebtWithInterest).to.equal(deployer_Expected_DebtWithInterest)
          expect(user01_DebtWithInterest).to.equal(user01_Expected_DebtWithInterest)
        })

        it ('allows to send the correct value to the borrower', async function() {
          let user01_InitialBalance = await ethers.provider.getBalance(user01.address)
          let user01ConnectedContract = await contract.connect(user01)
          let transactionResponse = await user01ConnectedContract.borrow(amountToBorrow)
          let transactionReceipt = await transactionResponse.wait(1)
          let { gasUsed, effectiveGasPrice } = transactionReceipt
          let gasCost = gasUsed.mul(effectiveGasPrice)
          let user01_Balance = await ethers.provider.getBalance(user01.address)
          expect(user01_Balance).to.equal(user01_InitialBalance.add(amountToBorrow).sub(gasCost))
        })
      })
    })

    describe('unhappy path', async function() {
      it('prevents to borrow 0 ETH and reverts with the correct custom code', async function() {
        await expect(contract.connect(user01).borrow(0))
        .to.be.revertedWithCustomError(contract,'AmountCanNotBeNull')
      })

      it('prevents to borrow an amout > contract balance and reverts with the correct custom code', async function() {
        await expect(contract.connect(user01).borrow(amountToFund.mul(2)))
        .to.be.revertedWithCustomError(contract,'NotEnoughFundsInContract')
      })

      it('prevents to create a 3rd loan and reverts with the correct custom code', async function() {
        let amountToBorrow = amountToFund.div(10)
        await contract.connect(user01).borrow(amountToBorrow)
        await contract.connect(user01).borrow(amountToBorrow)
        await expect(contract.connect(user01).borrow(amountToBorrow))
        .to.be.revertedWithCustomError(contract,'Max2LoansAllowed')
      })
    })
  })

  describe("payLoan", async function() {
    let amountToBorrow
    let user02_Debt
    let activeLoanCounter_Init

    beforeEach(async function() {
      // deployer sends 1ETH to contract
      await contract.lend({value: amountToFund})
      // user01 sends 2ETH to contract
      await contract.connect(user01).lend({value: amountToFund.mul(2)})
      // user02 borrows 0.1ETH
      amountToBorrow = amountToFund.div(10)
      await contract.connect(user02).borrow(amountToBorrow)
      user02_Debt = await contract.getBorrowerLoanDueDebt(user02.address, 0)
      activeLoanCounter_Init = await contract.totalActiveLoanCounter()
    })

    describe("happy path", async function() {
      describe('when paying the loan with the correct amount', async function() {

        it("allows to track correctly the number of total active Loans", async function() {
          // user02 pays the loan with the correct amount
          contract.connect(user02).payloan(0, {value: user02_Debt})
          // assert
          let activeLoanCounter_Final = await contract.totalActiveLoanCounter()
          expect(activeLoanCounter_Final).to.equal(activeLoanCounter_Init.sub(1))
        })

        it("allows to set the debt to 0", async function() {
          expect(await contract.connect(user02).getBorrowerLoanDueDebt(user02.address, 0)).to.equal(user02_Debt)
          // user02 pays the loan with the correct amount
          contract.connect(user02).payloan(0, {value: user02_Debt})
          expect(await contract.connect(user02).getBorrowerLoanDueDebt(user02.address, 0)).to.equal(0)
        })

        it("allows to send to each lender the correct due amount", async function() {
          // get initial balances for contract, deployer and user01 (lenders) and user03(not a lender)
          /// initial balances in contract used to calculate expected debt
          let contract_Balance_Init = await ethers.provider.getBalance(contract.address)
          let deployer_ContractBalance_Init = await contract.lenderToBalance(deployer.address) // lender 1ETH
          let user01_ContractBalance_Init = await contract.lenderToBalance(user01.address) // lender 2ETH
          /// users initial balances used to assert final balances
          let deployer_Balance_Init = await ethers.provider.getBalance(deployer.address) // lender
          let user01_Balance_Init = await ethers.provider.getBalance(user01.address) // lender
          let user02_Balance_Init = await ethers.provider.getBalance(user02.address) // borrower
          let user03_Balance_Init = await ethers.provider.getBalance(user03.address) // not a lender

          // calculate each lender expected due debt (with interest)
          let deployer_Expected_DebtWithInterest = user02_Debt
          .mul(deployer_ContractBalance_Init)
          .div(contract_Balance_Init)
          let user01_Expected_DebtWithInterest = user02_Debt
          .mul(user01_ContractBalance_Init)
          .div(contract_Balance_Init)

          // user02 pays the loan with the correct amount
          let transactionResponse = await contract.connect(user02).payloan(0, {value: user02_Debt})
          let transactionReceipt = await transactionResponse.wait(1)
          let { gasUsed, effectiveGasPrice } = transactionReceipt
          let gasCost = gasUsed.mul(effectiveGasPrice)

          // get balances after loan is paid back
          let deployer_Balance = await ethers.provider.getBalance(deployer.address)
          let user01_Balance = await ethers.provider.getBalance(user01.address)
          let user02_Balance = await ethers.provider.getBalance(user02.address)
          let user03_Balance = await ethers.provider.getBalance(user03.address)

          // assert final balances
          expect(deployer_Balance).to.equal(deployer_Balance_Init.add(deployer_Expected_DebtWithInterest))
          expect(user01_Balance).to.equal(user01_Balance_Init.add(user01_Expected_DebtWithInterest))
          expect(user02_Balance).to.equal(user02_Balance_Init.sub(user02_Debt).sub(gasCost))
          expect(user03_Balance).to.equal(user03_Balance_Init)
        })
      })
  })

    describe("unhappy path", async function() {
      it('prevents to pay a loan that does not exist, and reverts with the correct custom code', async function() {
        await expect(contract.connect(user02).payloan(1), {value: user02_Debt})
        .to.be.revertedWithCustomError(contract,'LoanMustExist')
      })

      it('prevents to send an incorrect amount to pay the loan, and reverts with the correct custom code', async function() {
        let wrongDebtAmountA = user02_Debt.div(10)
        let wrongDebtAmountB = user02_Debt.mul(10)
        await expect(contract.connect(user02).payloan(0, {value: wrongDebtAmountA}))
        .to.be.revertedWithCustomError(contract,'ExactDebtMustBePaid')
        await expect(contract.connect(user02).payloan(0, {value: wrongDebtAmountB}))
        .to.be.revertedWithCustomError(contract,'ExactDebtMustBePaid')
      })

    })
  })

  describe("withdraw", async function() {
    let deployer_ContractBalance_Init, user01_ContractBalance_Init
    let deployer_Balance_Init, user01_Balance_Init
    beforeEach(async function() {
      // deployer sends 1ETH to contract
      await contract.lend({value: amountToFund})
      // user01 sends 2ETH to contract
      await contract.connect(user01).lend({value: amountToFund.mul(2)})
      // get initial balances for contract, deployer and user01 (lenders)
      /// initial balances in contract
      deployer_ContractBalance_Init = await contract.lenderToBalance(deployer.address) // lender 1ETH
      user01_ContractBalance_Init = await contract.lenderToBalance(user01.address) // lender 2ETH
      /// initial balances
      deployer_Balance_Init = await ethers.provider.getBalance(deployer.address) // lender
      user01_Balance_Init = await ethers.provider.getBalance(user01.address) // lender
    })

    describe("happy path", async function() {
        it("allows a lender to withdraw funds", async function() {
          // user01 calls the withdraw function
          let transactionResponse = await contract.connect(user01).withdraw()
          let transactionReceipt = await transactionResponse.wait(1)
          let { gasUsed, effectiveGasPrice } = transactionReceipt
          let gasCost = gasUsed.mul(effectiveGasPrice)
          // get contract balance after withdraw
          let contract_Balance = await ethers.provider.getBalance(contract.address)
          // get users balances after withdraw
          let deployer_Balance = await ethers.provider.getBalance(deployer.address)
          let user01_Balance = await ethers.provider.getBalance(user01.address)

          // assert final balances
          expect(contract_Balance).to.equal(0)
          expect(deployer_Balance).to.equal(deployer_Balance_Init.add(deployer_ContractBalance_Init))
          expect(user01_Balance).to.equal(user01_Balance_Init.add(user01_ContractBalance_Init).sub(gasCost))
        })

        it("allows to initialize the lenders array", async function() {
          // 2 lenders lend 1ETH and 2ETH respectively
          expect(await contract.getNumberOfLenders()).to.equal(2)
          // user01 calls the withdraw function
          await contract.connect(user01).withdraw()
          expect(await contract.getNumberOfLenders()).to.equal(0)
        })
      })

    describe("unhappy path", async function() {
      it("prevents to withdraw when the contract balance is 0", async function() {
        // set up : withdraw all funds
        await contract.withdraw()
        expect(await ethers.provider.getBalance(contract.address)).to.equal(0)
        // act and assert
        await expect(contract.withdraw()).to.be.revertedWithCustomError(contract,'Unauthorized')
      })
    })
  })
})
