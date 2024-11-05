const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    // Get the contract factory using hardhat-ethers
    const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");

    // Contract addresses for Base Sepolia
    const AAVE_LENDING_POOL_ADDRESS_PROVIDER = process.env.AAVE_LENDING_POOL_ADDRESS_PROVIDER;
    const UNISWAP_ROUTER = "0x4E0dF688350806f7A9B6F8E0B5FF3c588BC7624f";
    const SUSHISWAP_ROUTER = "0x0BE808376Ecb75a5CF9bB6D237d16cd37893d904";

    console.log("Deploying FlashLoanArbitrage...");
    
    const flashLoanArbitrage = await FlashLoanArbitrage.deploy(
        AAVE_LENDING_POOL_ADDRESS_PROVIDER,
        UNISWAP_ROUTER,
        SUSHISWAP_ROUTER
    );

    await flashLoanArbitrage.waitForDeployment();

    const deployedAddress = await flashLoanArbitrage.getAddress();
    console.log("FlashLoanArbitrage deployed to:", deployedAddress);

    // Wait for a few block confirmations
    console.log("Waiting for confirmations...");
    await flashLoanArbitrage.deployTransaction.wait(5);

    // Verify the contract
    console.log("Verifying contract...");
    await hre.run("verify:verify", {
        address: deployedAddress,
        constructorArguments: [
            AAVE_LENDING_POOL_ADDRESS_PROVIDER,
            UNISWAP_ROUTER,
            SUSHISWAP_ROUTER
        ],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 