const { ethers } = require("ethers");
const { setTimeout } = require("timers/promises");

class ArbitrageMonitor {
    constructor(provider, contractAddress, abi) {
        // Base network configuration
        this.provider = new ethers.providers.JsonRpcProvider(
            "https://mainnet.base.org"  // Base mainnet
            // "https://goerli.base.org" // Base testnet
        );
        
        // Base DEX router addresses
        this.UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"; // Base Uniswap v3
        this.SUSHISWAP_ROUTER = "0x8d0A41961D9D80e00B665cB754174c5D4D736B6F"; // Base SushiSwap
        
        // Adjusted for Base's typical block times
        this.RETRY_DELAY = 2000; // 2 seconds (Base has faster block times)
        this.PROFIT_THRESHOLD = 0.005; // 0.5% minimum profit (can be lower due to Base's lower gas fees)
        
        this.contract = new ethers.Contract(contractAddress, abi, this.provider);
        
        // Add fs for file logging
        this.fs = require('fs').promises;
        this.logFile = `arbitrage_log_${new Date().toISOString().split('T')[0]}.txt`;
        
        // Add profit tracking
        this.totalProfits = 0;
        this.successfulTrades = 0;
        this.failedTrades = 0;
        
        // Add router contract instances
        this.uniswapRouter = new ethers.Contract(
            this.UNISWAP_ROUTER,
            ['function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)'],
            this.provider
        );
        
        this.sushiswapRouter = new ethers.Contract(
            this.SUSHISWAP_ROUTER,
            ['function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)'],
            this.provider
        );
    }

    // Add new logging method
    async logToFile(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        try {
            await this.fs.appendFile(this.logFile, logMessage);
        } catch (error) {
            console.error('Error writing to log file:', error);
        }
    }

    async getPrices({ tokenAddress, baseTokenAddress, amount, decimals }) {
        try {
            // Example path for price checking
            const path = [tokenAddress, baseTokenAddress];
            
            // Get prices from both DEXes
            const uniPrice = await this.uniswapRouter.getAmountsOut(amount, path);
            const sushiPrice = await this.sushiswapRouter.getAmountsOut(amount, path);
            
            // Convert to human readable numbers
            const gasPrice = await this.provider.getGasPrice();
            const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
            
            await this.logToFile(`
Gas Price: ${gasPriceGwei} Gwei
Token Pair: ${tokenAddress} -> ${baseTokenAddress}
Amount In: ${ethers.utils.formatUnits(amount, decimals)}
Uni Price: ${uniPrice[1]}
Sushi Price: ${sushiPrice[1]}
            `);

            return {
                uniPrice: Number(ethers.utils.formatUnits(uniPrice[1], decimals)),
                sushiPrice: Number(ethers.utils.formatUnits(sushiPrice[1], decimals)),
                rawAmount: amount,
                path: path,
                gasPrice: gasPriceGwei
            };
        } catch (error) {
            await this.logToFile(`ERROR: Price fetch failed for ${tokenAddress}:\n${error.message}`);
            return null;
        }
    }

    // Common Base network addresses
    const BASE_ADDRESSES = {
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        WETH: "0x4200000000000000000000000000000000000006",
        DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
        cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
        USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
    };

    async executeArbitrage(prices, pair, token0Symbol, token1Symbol) {
        try {
            await this.logToFile(`
=== EXECUTING ARBITRAGE TRADE ===
Pair: ${token0Symbol}/${token1Symbol}
Input Amount: ${ethers.utils.formatUnits(pair.amount, pair.decimals)} ${token0Symbol}
Expected Profit: $${this.calculateExpectedProfit(prices, pair)}
Gas Cost: ${prices.gasPrice} Gwei
            `);

            // Execute the trade (implement your trade logic here)
            const tx = await this.contract.executeArbitrage(
                prices.path,
                prices.rawAmount,
                { gasPrice: ethers.utils.parseUnits(prices.gasPrice, 'gwei') }
            );

            const receipt = await tx.wait();
            const profitMade = this.calculateActualProfit(receipt); // Implement this based on your contract events
            this.totalProfits += profitMade;
            this.successfulTrades++;

            await this.logToFile(`
✅ TRADE SUCCESSFUL
Transaction Hash: ${receipt.transactionHash}
Gas Used: ${receipt.gasUsed.toString()}
Actual Profit: $${profitMade.toFixed(2)}
Total Profits: $${this.totalProfits.toFixed(2)}
Total Successful Trades: ${this.successfulTrades}
            `);

            return true;
        } catch (error) {
            this.failedTrades++;
            await this.logToFile(`
❌ TRADE FAILED
Error: ${error.message}
Total Failed Trades: ${this.failedTrades}
            `);
            return false;
        }
    }

    async monitorOpportunities() {
        await this.logToFile(`
=== Starting Arbitrage Monitoring ===
Total Profits: $${this.totalProfits.toFixed(2)}
Successful Trades: ${this.successfulTrades}
Failed Trades: ${this.failedTrades}
        `);

        while (true) {
            try {
                const blockNumber = await this.provider.getBlockNumber();
                await this.logToFile(`\nChecking Block #${blockNumber}`);

                // Define tokens and amounts to monitor on Base
                const tokenPairs = [
                    {
                        token: BASE_ADDRESSES.WETH,
                        baseToken: BASE_ADDRESSES.USDC,
                        amount: ethers.utils.parseEther("0.1"), // 0.1 ETH
                        decimals: 18,
                        minProfitUsd: 5 // Minimum $5 profit
                    },
                    {
                        token: BASE_ADDRESSES.cbETH,
                        baseToken: BASE_ADDRESSES.WETH,
                        amount: ethers.utils.parseEther("0.1"), // 0.1 cbETH
                        decimals: 18,
                        minProfitUsd: 3 // Minimum $3 profit
                    },
                    {
                        token: BASE_ADDRESSES.DAI,
                        baseToken: BASE_ADDRESSES.USDbC,
                        amount: ethers.utils.parseEther("1000"), // 1000 DAI
                        decimals: 18,
                        minProfitUsd: 10 // Minimum $10 profit
                    }
                ];

                for (const pair of tokenPairs) {
                    const prices = await this.getPrices({
                        tokenAddress: pair.token,
                        baseTokenAddress: pair.baseToken,
                        amount: pair.amount,
                        decimals: pair.decimals,
                        minProfitUsd: pair.minProfitUsd
                    });

                    if (!prices) continue;

                    const priceDifference = ((Math.abs(prices.uniPrice - prices.sushiPrice) / prices.uniPrice) * 100);
                    const token0Symbol = await this.getTokenSymbol(pair.token);
                    const token1Symbol = await this.getTokenSymbol(pair.baseToken);

                    await this.logToFile(`
Opportunity Details:
    Pair: ${token0Symbol}/${token1Symbol}
    Input Amount: ${ethers.utils.formatUnits(pair.amount, pair.decimals)} ${token0Symbol}
    Uniswap Price: ${prices.uniPrice} ${token1Symbol}
    SushiSwap Price: ${prices.sushiPrice} ${token1Symbol}
    Price Difference: ${priceDifference.toFixed(2)}%
    Gas Price: ${prices.gasPrice} Gwei
    Minimum Profit Required: $${pair.minProfitUsd}
                    `);

                    if (priceDifference > this.PROFIT_THRESHOLD) {
                        const expectedProfit = this.calculateExpectedProfit(prices, pair);
                        
                        if (expectedProfit >= pair.minProfitUsd) {
                            await this.logToFile(`
!!! PROFITABLE OPPORTUNITY FOUND !!!
Expected Profit: $${expectedProfit.toFixed(2)}
                            `);
                            
                            await this.executeArbitrage(prices, pair, token0Symbol, token1Symbol);
                        }
                    }
                }
                
                await setTimeout(this.RETRY_DELAY);
            } catch (error) {
                await this.logToFile(`MONITOR ERROR: ${error.message}\n${error.stack}`);
                await setTimeout(this.RETRY_DELAY);
            }
        }
    }

    calculateExpectedProfit(prices, pair) {
        // Implement your profit calculation logic
        const priceGap = Math.abs(prices.uniPrice - prices.sushiPrice);
        const estimatedGasCost = this.estimateGasCost(prices.gasPrice);
        return (priceGap * Number(ethers.utils.formatUnits(pair.amount, pair.decimals))) - estimatedGasCost;
    }

    estimateGasCost(gasPriceGwei) {
        // Estimate gas cost in USD
        const estimatedGasUnits = 200000; // Adjust based on your contract
        const gasCostETH = (Number(gasPriceGwei) * estimatedGasUnits) / 1e9;
        const ETH_PRICE_USD = 3000; // You should get this dynamically
        return gasCostETH * ETH_PRICE_USD;
    }

    // Helper function to get token symbols
    async getTokenSymbol(tokenAddress) {
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ["function symbol() view returns (string)"],
                this.provider
            );
            return await tokenContract.symbol();
        } catch (error) {
            return tokenAddress.slice(0, 6) + "...";
        }
    }

    // Add missing calculateActualProfit method
    async calculateActualProfit(receipt) {
        // Extract profit from event logs
        const iface = new ethers.utils.Interface([
            "event ArbitrageExecuted(address asset, uint256 amount, uint256 profit)"
        ]);
        
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed.name === "ArbitrageExecuted") {
                    return Number(ethers.utils.formatEther(parsed.args.profit));
                }
            } catch (e) {
                continue;
            }
        }
        return 0;
    }
} 