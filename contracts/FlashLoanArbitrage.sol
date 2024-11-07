// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FlashLoanArbitrage is FlashLoanSimpleReceiverBase, ReentrancyGuard, Ownable {
    IUniswapV2Router02 private uniswapRouter;
    IUniswapV2Router02 private sushiswapRouter;

    // Add events for monitoring
    event ArbitrageExecuted(address asset, uint256 amount, uint256 profit);
    event FlashLoanFailed(address asset, uint256 amount, string reason);

    // Add new state variables at the top of contract
    uint256 public constant MAX_BORROW_AMOUNT = 100 ether; // Increased to 100 tokens
    uint256 public constant MIN_BORROW_AMOUNT = 5 ether;   // Minimum 5 tokens
    uint256 public constant MAX_PRICE_IMPACT = 3; // 3% max price impact

    // Add Base-specific constants
    uint256 public constant GAS_PRICE_LIMIT = 1 gwei; // Adjust based on Base's typical gas prices
    uint256 public constant MAX_GAS_LIMIT = 2000000;  // Conservative gas limit for Base

    // Add new constant at the top with other constants
    uint256 public constant MIN_PROFIT_USD = 0.0005 ether; // Approximately $1 worth of ETH at ~$2000/ETH

    constructor(
        address _addressProvider,
        address _uniswapRouter,
        address _sushiswapRouter
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        require(_uniswapRouter != address(0), "Invalid Uniswap router");
        require(_sushiswapRouter != address(0), "Invalid Sushiswap router");
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        sushiswapRouter = IUniswapV2Router02(_sushiswapRouter);
    }

    function executeArbitrage(
        address asset,
        uint256 amount,
        address[] calldata path
    ) external nonReentrant onlyOwner {
        require(amount >= MIN_BORROW_AMOUNT, "Amount below minimum threshold");
        require(amount <= MAX_BORROW_AMOUNT, "Amount exceeds maximum borrow limit");
        require(path.length >= 2, "Invalid path length");
        require(path[0] == asset && path[path.length - 1] == asset, "Invalid path");

        // Check price impact before executing
        uint256 priceImpact = calculatePriceImpact(asset, amount, path);
        require(priceImpact <= MAX_PRICE_IMPACT, "Price impact too high");

        // Add Base-specific checks
        require(tx.gasprice <= GAS_PRICE_LIMIT, "Gas price too high");
        require(gasleft() >= MAX_GAS_LIMIT, "Insufficient gas");

        bytes memory params = abi.encode(path);
        try POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0  // referralCode (0 for no referral)
        ) {
            // Flash loan initiated successfully
        } catch Error(string memory reason) {
            emit FlashLoanFailed(asset, amount, reason);
            revert(reason);
        }
    }

    function executeOperation(
        address _asset,
        uint256 amount,
        uint256 premium,
        address _initiator,
        bytes calldata params
    ) external override returns (bool) {
        (address[] memory path) = abi.decode(params, (address[]));
        
        // Get expected output from both DEXes
        uint256 uniswapOutput = getAmountOutMin(uniswapRouter, path, amount);
        uint256 sushiswapOutput = getAmountOutMin(sushiswapRouter, path, amount);
        
        // Calculate required amount to repay flash loan
        uint256 requiredAmount = amount + premium;
        
        // Determine which DEX offers better price
        (IUniswapV2Router02 sourceRouter, uint256 expectedOutput) = 
            uniswapOutput > sushiswapOutput 
                ? (uniswapRouter, uniswapOutput) 
                : (sushiswapRouter, sushiswapOutput);
        
        // Adjust profit calculation to account for L2 gas costs
        uint256 estimatedGasCost = tx.gasprice * MAX_GAS_LIMIT;
        uint256 minProfitMargin = requiredAmount + estimatedGasCost + MIN_PROFIT_USD;
        require(expectedOutput > minProfitMargin, "Insufficient profit after gas");

        // Execute the swap on the more profitable DEX
        IERC20(_asset).approve(address(sourceRouter), amount);
        sourceRouter.swapExactTokensForTokens(
            amount,
            expectedOutput,
            path,
            address(this),
            block.timestamp
        );

        uint256 profit = IERC20(_asset).balanceOf(address(this)) - requiredAmount;
        require(profit > 0, "No profit generated");
        
        // Transfer profit and approve repayment
        IERC20(_asset).transfer(owner(), profit);
        IERC20(_asset).approve(address(POOL), requiredAmount);

        emit ArbitrageExecuted(_asset, amount, profit);
        return true;
    }

    function getAmountOutMin(
        IUniswapV2Router02 router,
        address[] memory path,
        uint256 amountIn
    ) internal view returns (uint256) {
        uint256[] memory amountsOut = router.getAmountsOut(
            amountIn,
            path
        );
        return amountsOut[amountsOut.length - 1];
    }

    // Add new helper function
    function calculatePriceImpact(
        address asset,
        uint256 amount,
        address[] memory path
    ) internal view returns (uint256) {
        // Get price for small amount (0.1% of intended swap)
        uint256 smallAmount = amount / 1000;
        uint256 smallSwapPrice = getAmountOutMin(uniswapRouter, path, smallAmount);
        
        // Get price for actual amount
        uint256 largeSwapPrice = getAmountOutMin(uniswapRouter, path, amount);
        
        // Calculate price impact
        uint256 expectedPrice = (smallSwapPrice * 1000);
        uint256 priceImpact = ((expectedPrice - largeSwapPrice) * 10000) / expectedPrice;
        
        return priceImpact; // Returns basis points (e.g., 100 = 1%)
    }
} 
