# Flash Loan Arbitrage Bot for Base Network

This project implements a flash loan arbitrage bot that monitors and executes trading opportunities between Uniswap and SushiSwap on the Base network.

## Overview

The system consists of two main components:
1. A smart contract (`FlashLoanArbitrage.sol`) that executes flash loans and arbitrage trades
2. A monitoring script (`monitor.js`) that watches for profitable opportunities

### Smart Contract Features

- Flash loan integration with Aave V3
- Arbitrage execution between Uniswap and SushiSwap
- Safety features:
  - Price impact checks (max 3%)
  - Minimum/maximum borrow limits
  - Gas price limits optimized for Base
  - Reentrancy protection
  - Owner-only execution
  - Profit verification

### Monitoring System Features

- Real-time price monitoring across DEXes
- Detailed logging system with:
  - Price differences
  - Gas costs
  - Execution results
  - Profit tracking
- Configurable parameters:
  - Profit thresholds
  - Token pairs
  - Retry delays
- Error handling and recovery

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

2. Update the following in `deploy.js`:
- AAVE_LENDING_POOL_ADDRESS_PROVIDER
- Router addresses (if deploying to mainnet)

3. Update token pairs in `monitor.js` if needed

## Deployment

For Base Testnet:
```bash
npx hardhat run scripts/deploy.js --network base-testnet
```

For Base Mainnet:
```bash
npx hardhat run scripts/deploy.js --network base
```

## Monitoring

The monitoring system (`monitor.js`) includes comprehensive logging:

- All activities are logged to daily files (`arbitrage_log_YYYY-MM-DD.txt`)
- Logs include:
  - Price checks
  - Profitable opportunities
  - Trade execution results
  - Gas prices
  - Errors and issues

To start monitoring:
```bash
node monitor.js
```

## Logging System

The monitoring script implements detailed logging through the `logToFile` method:

- Timestamp for every log entry
- Price comparisons between DEXes
- Gas price monitoring
- Trade execution details
- Profit/loss tracking
- Error logging

Logs are stored in the `logs` directory with daily rotation.

## Security Considerations

- Never commit your private keys or `.env` file
- Test thoroughly on testnet first
- Monitor gas prices and adjust limits accordingly
- Start with small trade amounts
- Review price impact before execution

## Networks

The system is configured for:
- Base Mainnet (`https://mainnet.base.org`)
- Base Testnet (`https://goerli.base.org`)

To switch networks, update the provider URL in `monitor.js` and deployment configurations.

## License

MIT

## Disclaimer

This is experimental software. Use at your own risk. Always test with small amounts first.