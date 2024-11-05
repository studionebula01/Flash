require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_TESTNET_URL,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 1000000000,
      chainId: 84532
    }
  }
}; 