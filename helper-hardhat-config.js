const networkConfig = {
  5: {
    name: 'goerli'
  }
}

const developmentChains = ["hardhat", "localhost"]
const INTEREST_RATE = ethers.utils.parseUnits("10", 16) // 2.5%

module.exports = {
  networkConfig,
  developmentChains,
  INTEREST_RATE
}
