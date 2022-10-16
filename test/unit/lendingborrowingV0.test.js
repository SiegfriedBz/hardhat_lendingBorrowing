const { deployments, getNamedAccounts, ethers } = require("hardhat")
const { INTEREST_RATE } = require("../../helper-hardhat-config")
const { expect } = require("chai")
const { solidity } = require("ethereum-waffle")
// require("hardhat-gas-reporter") // check gasReporter in Config

describe("LendingBorrowing", function () {
  let contract
  let deployer, user01, user02
  let amountToFund = ethers.utils.parseEther("1")
  let amountToBorrow = ethers.utils.parseEther("0.5")

  beforeEach(async function () {
    ;[deployer, user01, user02] = await ethers.getSigners()
    await deployments.fixture(["all"])
    contract = await ethers.getContract('LendingBorrowing', deployer)
  })

  describe("Constructor", async function () {
    it("Should set the correct interest rate", async function () {
      console.log(`Contract deployed to : ${contract.address}`)
      let interestRate = await contract.i_interestRate()
      expect(interestRate.toString()).to.equal(INTEREST_RATE.toString())
    })

    it("Should set the right owner", async function () {
      expect(await contract.i_owner()).to.equal(deployer.address)
    })
  })

  describe("lend", async function () {
    describe('happy path', async function () {
      it("should allow to deposit funds", async function () {
        let contract_InitialBalance = await ethers.provider.getBalance(
          contract.address
        )
        let transactionResponse = await contract.lend({ value: amountToFund })
        await transactionResponse.wait(1)
        let deployer_ContractBalance = await contract.lenderToBalance(
          deployer.address
        )
        let contract_Balance = await ethers.provider.getBalance(contract.address)
        // assert
        expect(contract_InitialBalance.toString()).to.equal("0")
        expect(deployer_ContractBalance.toString())
        .to.equal(contract_Balance.toString())
      })

      it("should add the funder to the lenders array", async function () {
        // initial : lenders array is expected to be empty
        await expect(contract.lenders(0)).to.be.reverted

        // act : deployer lends ETH
        await contract.lend({ value: amountToFund })
        // assert
        expect(await contract.lenders(0)).to.equal(deployer.address)
      })

    })
    describe('unhappy path', async function () {
      it("should not allow to send 0 Ether", async function () {
        await expect(contract.lend({ value: 0 }))
        .to.be.revertedWithCustomError(contract, "AmountCanNotBeNull")})
    })
  })

  describe('borrow', async function() {
    beforeEach(async function() {
      await contract.lend({value: amountToFund})
    })

    describe('happy path', async function() {
      describe('with an amount to borrow < contract balance', async function() {
        it ('sets correctly the borrower debt', async function() {
          // act
          await contract.connect(user01).borrow(amountToBorrow)
          // assert
          let user01Debt = await contract.getBorrowerLoanDueDebt(user01.address, 0) // function getBorrowerLoanDueDebt(address _borrower, uint256 _loanId)
          let expectedUser01Debt = amountToBorrow
          .add(amountToBorrow
            .mul(INTEREST_RATE)
            .div(ethers.utils.parseEther("1")))
          expect(user01Debt).to.equal(expectedUser01Debt)
        })

        it ('updates all lenders balances', async function() {
          // set up : deployer lending 1ETH + user01 lending 2ETH
          await contract.connect(user01).lend({value: amountToFund.mul(2)})
          let numberOfLenders = await contract.getNumberOfLenders()
          let contract_InitBalance = await ethers.provider.getBalance(contract.address)
          let deployer_InitContractBalance = await contract.lenderToBalance(
            deployer.address
          )
          let user01_InitContractBalance = await contract.lenderToBalance(
            user01.address
          )
          // assert set up
          expect(numberOfLenders.toString()).to.equal("2")
          expect(contract_InitBalance).to.equal(amountToFund.mul(3))
          expect(deployer_InitContractBalance).to.equal(amountToFund)
          expect(user01_InitContractBalance).to.equal(amountToFund.mul(2))

          // act : user02 borrowing
          await contract.connect(user02).borrow(amountToBorrow)
          let user02Debt = await contract.getBorrowerLoanDueDebt(user02.address, 0)

          // calculate each lender expected amount borrowed
          let deployerExpectedAmountBorrowed = amountToBorrow
          .mul(deployer_InitContractBalance)
          .div(contract_InitBalance)
          let user01ExpectedAmountBorrowed = amountToBorrow
          .mul(user01_InitContractBalance)
          .div(contract_InitBalance)

          // assert lenders amount borrowed
          let deployer_ContractBalance = await contract.lenderToBalance(
            deployer.address
          )
          let user01_ContractBalance = await contract.lenderToBalance(
            user01.address
          )
          expect(deployer_ContractBalance).to.equal(deployer_InitContractBalance
            .sub(deployerExpectedAmountBorrowed))
          expect(user01_ContractBalance).to.equal(user01_InitContractBalance
            .sub(user01ExpectedAmountBorrowed))

          // calculate each lender expected due debt (with interest)
          let deployerExpectedDebtWithInterest = user02Debt
          .mul(deployer_InitContractBalance)
          .div(contract_InitBalance)
          let user01ExpectedDebtWithInterest = user02Debt
          .mul(user01_InitContractBalance)
          .div(contract_InitBalance)

          // assert each lender due debt
          let deployerDebtWithInterest = await contract.getBorrowerLoanDueDebtToLender(
            user02.address, // borrower
            0, // loanId
            deployer.address) // lender
          let user01DebtWithInterest = await contract.getBorrowerLoanDueDebtToLender(
            user02.address, // borrower
            0, // loanId
            user01.address) // lender
          expect(deployerDebtWithInterest).to.equal(deployerExpectedDebtWithInterest)
          expect(user01DebtWithInterest).to.equal(user01ExpectedDebtWithInterest)
        })

        it ('sends the correct value to the borrower', async function() {
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
      describe("with an amount to borrow = 0", async function() {
        it('reverts with the correct custom code', async function() {
          await expect(contract.connect(user01).borrow(0))
          .to.be.revertedWithCustomError(contract,'AmountCanNotBeNull')
        })
      })

      describe("with an amount to borrow > contract balance", async function() {
        it('reverts with the correct custom code', async function() {
          await expect(contract.connect(user01).borrow(amountToFund.mul(2)))
          .to.be.revertedWithCustomError(contract,'NotEnoughFundsInContract')
        })
      })

      describe("with a user having already 2 active loans", async function() {
        let amountToBorrow = amountToFund.div(10)
        it('prevents to create a 3rd loan and reverts with the correct custom code', async function() {
          await contract.connect(user01).borrow(amountToBorrow)
          await contract.connect(user01).borrow(amountToBorrow)
          await expect(contract.connect(user01).borrow(amountToBorrow))
          .to.be.revertedWithCustomError(contract,'Max2LoansAllowed')
        })

      })
    })

  })

  describe("payLoan", async function() {})

  describe("withdraw", async function() {})

})
