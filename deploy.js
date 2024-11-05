const { ethers } = require("ethers");
require('dotenv').config();

async function main() {
    // Connect to Base network
    const provider = new ethers.providers.JsonRpcProvider(
        process.env.BASE_MAINNET_URL  // Changed to use env variable
    );

    // Setup wallet using private key
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log("Deploying from address:", wallet.address);

    // Contract addresses for Base
    const AAVE_LENDING_POOL_ADDRESS_PROVIDER = process.env.AAVE_LENDING_POOL_ADDRESS_PROVIDER;
    const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
    const SUSHISWAP_ROUTER = "0x8d0A41961D9D80e00B665cB754174c5D4D736B6F";

    // Deploy contract
    const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage", wallet);
    const flashLoanArbitrage = await FlashLoanArbitrage.deploy(
        AAVE_LENDING_POOL_ADDRESS_PROVIDER,
        UNISWAP_ROUTER,
        SUSHISWAP_ROUTER
    );

    await flashLoanArbitrage.deployed();
    console.log("FlashLoanArbitrage deployed to:", flashLoanArbitrage.address);

    // Initialize monitor
    const monitor = new ArbitrageMonitor(
        provider,
        flashLoanArbitrage.address,
        FlashLoanArbitrage.interface
    );

    // Start monitoring
    await monitor.monitorOpportunities();
} 