const ethers = require("ethers");
const { getRandomNumber, sleep } = require("./utils");
const settings = require("../config/config");

const networkConfig = {
  name: "Pharos Testnet",
  chainId: 688688,
  rpcUrl: "https://testnet.dplabs-internal.com",
  expoler: "https://testnet.pharosscan.xyz/tx/",
};

const LP_ROUTER_ADDRESS = "0xf8a1d4ff0f9b9af7ce58e1fc1833688f3bfd6115";
const USDC_POOL_ADDRESS = "0x0373a059321219745aee4fad8a942cf088be3d0e";
const USDT_POOL_ADDRESS = "0x70118b6eec45329e0534d849bc3e588bb6752527";
const WPHRS_ADDRESS = "0x76aaada469d23216be5f7c596fa25f282ff9b364";
const USDC_ADDRESS = "0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37";
const USDT_ADDRESS = "0xed59de2d7ad9c043442e381231ee3646fc3c2939";

const SWAP_ROUTER_ABI = [
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)",
  "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)",
  "function exactOutput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum)) external payable returns (uint256 amountIn)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) external payable",
  "function refundETH() external payable",
  "function WETH9() external view returns (address)",
];

const LP_ROUTER_ABI = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX96, uint256 feeGrowthInside1LastX96, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
];

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const AMOUNT_IN = ethers.parseEther("0.001");
const AMOUNT_OUT_MINIMUM = 0n;
const FEE = 500;
const MAX_RETRIES = 1;
const SWAP_ROUNDS = 20;
const FINAL_SWAP_PERCENTAGE = 40;
const LP_ROUNDS = 10;

async function getTokenDecimals(tokenAddress, provider) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    return decimals;
  } catch (error) {
    return 18;
  }
}

async function getTokenBalance(tokenAddress, walletAddress, provider) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(walletAddress);
    return balance;
  } catch (error) {
    return 0n;
  }
}

async function approveToken(tokenAddress, spenderAddress, amount, wallet) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
    if (currentAllowance >= amount) {
      return true;
    }
    const tx = await tokenContract.approve(spenderAddress, amount);
    await tx.wait();
    return true;
  } catch (error) {
    return false;
  }
}

async function findExistingPosition({ token0, token1, fee, positionManager, wallet }) {
  try {
    // Get balance of NFT positions
    const balance = await positionManager.balanceOf(wallet.address);

    if (balance == 0n) {
      console.log("No balance");
      return null;
    }

    // Normalize addresses for comparison
    token0 = token0.toLowerCase();
    token1 = token1.toLowerCase();

    // Check each position
    for (let i = 0; i < ethers.toNumber(balance); i++) {
      try {
        // Get token ID
        const tokenId = await positionManager.tokenOfOwnerByIndex(wallet.address, i);

        // Get position details
        const position = await positionManager.positions(tokenId);

        // Check if this position matches our token pair and fee
        const positionToken0 = position.token0.toLowerCase();
        const positionToken1 = position.token1.toLowerCase();

        if (((positionToken0 === token0 && positionToken1 === token1) || (positionToken0 === token1 && positionToken1 === token0)) && position.fee === fee) {
          return {
            tokenId,
            token0: position.token0,
            token1: position.token1,
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
          };
        }
      } catch (err) {
        console.log(err.message);
        continue;
      }
    }

    return null; // No matching position found
  } catch (error) {
    console.log(error.message);
    return null;
  }
}
async function addLiquidity(provider, wallet, token0, token1, poolAddress, amount0, amount1) {
  try {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const actualToken0 = await pool.token0();
    const actualToken1 = await pool.token1();
    const actualFee = Number(await pool.fee());
    let errMess = "Unknow";
    let sortedAmount0, sortedAmount1;
    if (token0.toLowerCase() === actualToken0.toLowerCase()) {
      sortedAmount0 = amount0;
      sortedAmount1 = amount1;
    } else {
      sortedAmount0 = amount1;
      sortedAmount1 = amount0;
    }

    const slot0 = await pool.slot0();
    const currentTick = Number(slot0.tick);

    const tickLower = -887270;
    const tickUpper = 887270;

    const approved0 = await approveToken(actualToken0, LP_ROUTER_ADDRESS, sortedAmount0, wallet);
    if (!approved0) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `${wallet.address}: Approve failed`,
      };
    }

    const approved1 = await approveToken(actualToken1, LP_ROUTER_ADDRESS, sortedAmount1, wallet);
    if (!approved1) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `${wallet.address}: Approve failed`,
      };
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const amount0Min = 0n;
    const amount1Min = 0n;

    const lpRouter = new ethers.Contract(LP_ROUTER_ADDRESS, LP_ROUTER_ABI, wallet);

    const positionManager = lpRouter;
    const existingPosition = await findExistingPosition({ token0, token1, fee: actualFee, wallet, positionManager });

    let tx;

    if (existingPosition) {
      const params = {
        tokenId: existingPosition.tokenId,
        amount0Desired: sortedAmount0,
        amount1Desired: sortedAmount1,
        amount0Min,
        amount1Min,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      };
      let gasLimit;
      try {
        gasLimit = await lpRouter.mint.estimateGas(params);
        gasLimit = (gasLimit * 200n) / 100n;
      } catch (gasError) {
        gasLimit = 5000000n;
      }
      tx = await positionManager.increaseLiquidity(
        params,
        { gasLimit } // Increased gas limit
      );
    } else {
      const mintParams = {
        token0,
        token1,
        fee: actualFee,
        tickLower,
        tickUpper,
        amount0Desired: sortedAmount0,
        amount1Desired: sortedAmount1,
        amount0Min,
        amount1Min,
        recipient: wallet.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      };
      let gasLimit;
      try {
        gasLimit = await lpRouter.mint.estimateGas(mintParams);
        gasLimit = (gasLimit * 200n) / 100n;
      } catch (gasError) {
        gasLimit = 5000000n;
      }
      tx = await positionManager.mint(
        mintParams,
        { gasLimit } // Increased gas limit
      );
    }

    return {
      tx: tx.hash,
      success: true,
      stop: false,
      message: `[${wallet.address}] Add liquidity success: ${networkConfig.expoler}${tx.hash}`,
    };
  } catch (error) {
    console.log(error.message);
    return {
      tx: null,
      success: false,
      stop: false,
      message: `Error add lp: ${error.message}`,
    };
  }
}

async function performMultipleLPs(prams) {
  let { provider, wallet } = prams;
  let lpCount = settings.NUMBER_ADDLP;
  const token0 = WPHRS_ADDRESS;
  const token1 = USDC_ADDRESS;
  const poolAddress = USDC_POOL_ADDRESS;
  try {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const actualToken0 = await pool.token0();
    const actualToken1 = await pool.token1();

    const token0Balance = await getTokenBalance(actualToken0, wallet.address, provider);
    const token1Balance = await getTokenBalance(actualToken1, wallet.address, provider);
    const token0Decimals = await getTokenDecimals(actualToken0, provider);
    const token1Decimals = await getTokenDecimals(actualToken1, provider);

    if (token0Balance === 0n || token1Balance === 0n) {
      return {
        tx: null,
        success: false,
        stop: true,
        message: `Insufficient balance`,
      };
    }

    let percent0 = getRandomNumber(settings.AMOUNT_ADDLP[0], settings.AMOUNT_ADDLP[1]);
    let percent1 = getRandomNumber(settings.AMOUNT_ADDLP[0], settings.AMOUNT_ADDLP[1]);

    let totalAmount0ForLP = (token0Balance * BigInt(Math.floor(percent0))) / 100n;
    let totalAmount1ForLP = (token1Balance * BigInt(Math.floor(percent1))) / 100n;

    let amount0PerLP = totalAmount0ForLP / BigInt(lpCount);
    let amount1PerLP = totalAmount1ForLP / BigInt(lpCount);

    let successCount = 0;

    for (let i = 0; i < lpCount; i++) {
      try {
        const currentToken0Balance = await getTokenBalance(actualToken0, wallet.address, provider);
        const currentToken1Balance = await getTokenBalance(actualToken1, wallet.address, provider);
        const useAmount0 = currentToken0Balance < amount0PerLP ? currentToken0Balance : amount0PerLP;
        const useAmount1 = currentToken1Balance < amount1PerLP ? currentToken1Balance : amount1PerLP;

        if (useAmount0 === 0n || useAmount1 === 0n) {
          continue;
        }

        const result = await addLiquidity(provider, wallet, actualToken0, actualToken1, poolAddress, useAmount0, useAmount1);
        if (result.success) {
          console.log(`[${i + 1}/${lpCount}] ${result.message}`.green);
          successCount++;
        } else {
          console.log(result.message);
          amount0PerLP = (amount0PerLP * 8n) / 10n;
          amount1PerLP = (amount1PerLP * 8n) / 10n;
        }

        if (i < lpCount - 1) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          console.log(`[${wallet.address}] Delay ${timesleep}s to next transaction...`.blue);
          await sleep(timesleep);
        }
      } catch (error) {
        await sleep(5);
      }
    }

    return successCount > 0;
  } catch (error) {
    // console.log(error.message);
    return false;
  }
}

module.exports = { performMultipleLPs };
