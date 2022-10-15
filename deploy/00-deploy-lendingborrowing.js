const { networkConfig, developmentChains, INTEREST_RATE } = require("../helper-hardhat-config")
const { network } = require("hardhat")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async (hre) => {
  const { getNamedAccounts, deployments } = hre
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId = network.config.chainId

  const contract = await deploy("LendingBorrowing", {
    contract: "LendingBorrowing",
    from: deployer,
    args: [INTEREST_RATE], // constructor args
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1
  })

  if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) { // if deploy not on local
    console.log(
      "Etherscan :",
      `https://goerli.etherscan.io/address/${contract.address}`
    )
    await verify(contract.address, [INTEREST_RATE])
  }
}

module.exports.tags = ["all"]
