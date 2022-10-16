require('dotenv').config()
require("hardhat-deploy")
require("@nomiclabs/hardhat-ethers");
require("ethereum-waffle")
require("@nomicfoundation/hardhat-chai-matchers")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-gas-reporter")
require("solidity-coverage")

const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL || "http://goerli.example"
const PRIV_KEY = process.env.PRIV_KEY || "key"
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "key"
const COIN_API_KEY = process.env.COIN_MARKET_CAP_API_KEY || "key" // for hardhat-gas-reporter


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.9",
  defaultNetwork : "hardhat",
  networks: {
    goerli: {
      chainId: 5,
      url: GOERLI_RPC_URL,
      accounts: [PRIV_KEY],
      blockConfirmations: 6
    },
    localhost:{
      chainId: 31337,
      url : "http://127.0.0.1:8545/"
    }
  },
  namedAccounts: {
    deployer: {
      default: 0,
      5: 0
    },
    user01: {
      default: 1,
      5: 1
    },
    user02: {
      default: 2,
      5: 2
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
