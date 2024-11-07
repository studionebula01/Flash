require('dotenv').config();  // Load environment variables from .env
const hre = require("hardhat");
const { getAddress } = require("ethers");

async function main() {
    const [deployer] = await ethers.getSigners();

    // Get and log the balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");

    // Enable viaIR in the hardhat config first
    await hre.run('compile', {
        viaIR: true
    });

    // Ensure the environment variable is set
    if (!process.env.AAVE_LENDING_POOL_ADDRESS_PROVIDER) {
        throw new Error("AAVE_LENDING_POOL_ADDRESS_PROVIDER is not defined in the environment variables");
    }

    // Contract addresses for Optimism
    const AAVE_LENDING_POOL_ADDRESS_PROVIDER = getAddress(process.env.AAVE_LENDING_POOL_ADDRESS_PROVIDER);
    const UNISWAP_ROUTER = getAddress(process.env.UNISWAP_ROUTER);
    const SUSHISWAP_ROUTER = getAddress(process.env.SUSHISWAP_ROUTER);

    // Token addresses for Optimism mainnet
    const WETH = "0x4200000000000000000000000000000000000006";
    const USDC = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

    console.log("Deploying FlashLoanArbitrage...");

    console.log("AAVE_LENDING_POOL_ADDRESS_PROVIDER:", process.env.AAVE_LENDING_POOL_ADDRESS_PROVIDER);
    console.log("UNISWAP_ROUTER:", process.env.UNISWAP_ROUTER);
    console.log("SUSHISWAP_ROUTER:", process.env.SUSHISWAP_ROUTER);


    const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
    const flashLoanArbitrage = await FlashLoanArbitrage.deploy(
        AAVE_LENDING_POOL_ADDRESS_PROVIDER,
        UNISWAP_ROUTER,
        SUSHISWAP_ROUTER,
        { gasLimit: 3000000 } // Manually set gas limit to test
    );

    await flashLoanArbitrage.waitForDeployment();

    const deployedAddress = await flashLoanArbitrage.getAddress();
    console.log("FlashLoanArbitrage deployed to:", deployedAddress);

    // Wait for confirmations
    console.log("Waiting for confirmations...");
    await ethers.provider.waitForTransaction(flashLoanArbitrage.deploymentTransaction().hash, 5);

    // Verify contract first
    console.log("\nVerifying contract...");
    try {
        await hre.run("verify:verify", {
            address: deployedAddress,
            constructorArguments: [
                AAVE_LENDING_POOL_ADDRESS_PROVIDER,
                UNISWAP_ROUTER,
                SUSHISWAP_ROUTER
            ],
        });
    } catch (error) {
        console.log("Verification failed:", error.message);
    }

    // Execute the arbitrage after verification
    console.log("\nExecuting initial arbitrage...");
    const amount = ethers.parseEther("10"); // 10 WETH
    const arbitragePath = [WETH, USDC, WETH];
    
    try {
        const arbitrageTx = await flashLoanArbitrage.executeArbitrage(
            WETH,
            amount,
            arbitragePath
        );
        await arbitrageTx.wait();
        console.log("Arbitrage execution completed. Transaction:", arbitrageTx.hash);
    } catch (error) {
        console.log("Arbitrage execution failed:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
