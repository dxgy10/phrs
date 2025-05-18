const { ethers } = require("ethers");
const settings = require("../config/config");
const { SWAP_ROUTER_ABI } = require("./ABI");
const { getRandomNumber } = require("./utils");

// const provider = new ethers.JsonRpcProvider(settings.RPC_URL);

const EXPOLER = "https://testnet.pharosscan.xyz/tx/";
const CHAIN_ID = 688688;

const WPHRS_ADDRESS = "0x76aaada469d23216be5f7c596fa25f282ff9b364";
const USDC_ADDRESS = "0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37";
const USDT_ADDRESS = "0xed59de2d7ad9c043442e381231ee3646fc3c2939";
const POSITIONMANAGER_ADDRESS = "0xF8a1D4FF0f9b9Af7CE58E1fc1833688F3BFd6115";
const FACTORY = "0x7CE5b44F2d05babd29caE68557F52ab051265F01";
const QUOTER = "0x00f2f47d1ed593Cf0AF0074173E9DF95afb0206C";
const SWAP_ROUTER_ADDRESS = "0x1a4de519154ae51200b0ad7c90f7fac75547888a";
const USDC_POOL_ADDRESS = "0x0373a059321219745aee4fad8a942cf088be3d0e";
const USDT_POOL_ADDRESS = "0x70118b6eec45329e0534d849bc3e588bb6752527";

const LP_ROUTER_ABI = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX96, uint256 feeGrowthInside1LastX96, uint128 tokensOwed0, uint128 tokensOwed1)",
];

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

const POSITION_MANAGER_ABI = [
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function refundETH() payable",
];
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() payable returns ()",
  "function withdraw(uint256 wad) returns ()",
];

const pairOptions = [
  { id: 1, from: "WPHRS", to: "USDC" },
  { id: 2, from: "USDC", to: "WPHRS" },
  { id: 3, from: "WPHRS", to: "USDT" },
  { id: 4, from: "USDT", to: "WPHRS" },
];
const tokenDecimals = {
  WPHRS: 18,
  USDC: 18,
  USDT: 18,
};

const tokens = {
  USDC: "0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37",
  USDT: "0xed59de2d7ad9c043442e381231ee3646fc3c2939",
  WPHRS: "0x76aaada469d23216be5f7c596fa25f282ff9b364",
};

async function approveToken({ tokenAddress, spenderAddress, amount, wallet }) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
    if (currentAllowance >= amount) {
      return {
        tx: null,
        success: true,
        message: `ok`,
      };
    }
    const tx = await tokenContract.approve(spenderAddress, amount);
    await tx.wait();
    return {
      tx: tx.hash,
      success: true,
      message: `ok`,
    };
  } catch (error) {
    return {
      tx: null,
      success: false,
      stop: false,
      message: `Error Approve: ${error.message}`,
    };
  }
}

const checkBalanceAndApproval = async (wallet, tokenAddress, amount, decimals, spender) => {
  try {
    const symbol = Object.entries(tokens).find((item) => item[1] === tokenAddress)[0];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);
    const required = ethers.parseUnits(amount.toString(), decimals);

    if (balance < required) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `Insufficient ${symbol} balance: ${ethers.formatUnits(balance, decimals)} < ${amount}`,
      };
    }

    const allowance = await tokenContract.allowance(wallet.address, spender);
    if (allowance < required) {
      console.log(`[${wallet.address}] Approving ${amount} ${symbol}...`.blue);
      const approveTx = await tokenContract.approve(spender, required);
      await approveTx.wait();
      console.log(`[${wallet.address}] Approval completed`.green);
    }

    return {
      tx: null,
      success: true,
      message: `200`,
    };
  } catch (error) {
    return {
      tx: null,
      success: false,
      stop: false,
      message: `Balance/approval check failed: ${error.message}`,
    };
  }
};

async function getTokenDecimals(tokenAddress, wallet) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const decimals = await tokenContract.decimals();
    return decimals;
  } catch (error) {
    return 6; // Default to 6 for USDC/USDT
  }
}
async function findExistingPosition({ token0, token1, fee, positionManager, wallet }) {
  try {
    // Get balance of NFT positions
    const balance = await positionManager.balanceOf(wallet.address);

    if (balance == 0n) {
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
        continue;
      }
    }

    return null; // No matching position found
  } catch (error) {
    return null;
  }
}

async function addLp(params) {
  let { wallet, amount0, amount1, provider } = params;
  let poolAddress = USDC_POOL_ADDRESS;
  const token0 = WPHRS_ADDRESS;
  const token1 = USDC_ADDRESS;
  try {
    const decimals0 = await getTokenDecimals(token0);
    const decimals1 = await getTokenDecimals(token1);
    const amount0Desired = ethers.parseUnits(amount0.toString(), decimals0);
    const amount1Desired = ethers.parseUnits(amount1.toString(), decimals1);
    const positionManager = new ethers.Contract(POSITIONMANAGER_ADDRESS, POSITION_MANAGER_ABI, wallet);
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const actualToken0 = await pool.token0();
    const actualToken1 = await pool.token1();
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
    const resCheckBalance0 = await approveToken({ tokenAddress: actualToken0, spenderAddress: POSITIONMANAGER_ADDRESS, amount: sortedAmount0, wallet });
    if (!resCheckBalance0.success) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: resCheckBalance0.message,
      };
    }
    const resCheckBalance1 = await approveToken({ tokenAddress: actualToken1, spenderAddress: POSITIONMANAGER_ADDRESS, amount: sortedAmount1, wallet });

    if (!resCheckBalance1.success) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: resCheckBalance1.message,
      };
    }

    // Check for existing position
    const existingPosition = await findExistingPosition({ token0, token1, fee: 500, poolAddress: USDC_POOL_ADDRESS, positionManager, decimals0, decimals1, wallet });
    console.log(existingPosition);
    let tx;

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const amount0Min = 0n;
    const amount1Min = 0n;

    if (existingPosition) {
      const params = {
        tokenId: existingPosition.tokenId,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline,
      };

      tx = await positionManager.increaseLiquidity(
        params,
        { gasLimit: 800000 } // Increased gas limit
      );
    } else {
      const mintParams = {
        token0: actualToken0,
        token1: actualToken1,
        fee: 500, // Verify this (500 = 0.05%)
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient: wallet.address,
        deadline,
      };

      let gasLimit;
      try {
        gasLimit = await positionManager.mint.estimateGas(params);
        gasLimit = (gasLimit * 200n) / 100n;
      } catch (gasError) {
        gasLimit = 5000000n;
      }

      tx = await positionManager.mint(
        mintParams,
        { gasLimit } // Increased gas limit
      );
      // const mintData = positionManager.interface.encodeFunctionData("mint", [mintParams]);
      // const refundData = positionManager.interface.encodeFunctionData("refundETH", []);
      // const multicallData = [mintData, refundData];
      // tx = await positionManager.multicall(multicallData, {
      //   value: amount0Desired,
      //   gasLimit: 1000000,
      // });
    }

    await tx.wait();
    return {
      tx: tx.hash,
      success: true,
      message: `Add liquidity transaction confirmed: ${EXPOLER}/${tx.hash}`,
    };
  } catch (error) {
    let message = `Error addlp: ${error?.shortMessage || error.message}`;
    return {
      tx: null,
      success: false,
      stop: false,
      message: message,
    };
  }
}

async function swapToken(params) {
  const { amount: amountIn, provider, wallet, pairsInit } = params;
  try {
    const options = pairsInit ? pairsInit : pairOptions;
    const pair = options[Math.floor(Math.random() * options.length)];
    const amount = pair.from === "WPHRS" ? amountIn.toString() : Math.max(amountIn, getRandomNumber(0.1, 10)).toString();
    const decimals = tokenDecimals[pair.from];
    const tokenContract = new ethers.Contract(tokens[pair.from], ERC20_ABI, provider);

    const balance = await tokenContract.balanceOf(wallet.address);
    const required = ethers.parseUnits(amount.toString(), decimals);

    console.log(`[${wallet.address}] Swapping ${amount} ${pair.from} to ${pair.to}`.blue);

    if (balance < required) {
      if (pair.from !== "WPHRS") {
        return await swapToken({
          ...params,
          pairsInit: [
            { id: 1, from: "WPHRS", to: "USDC" },
            { id: 3, from: "WPHRS", to: "USDT" },
          ],
        });
      } else {
        const balanceNative = await provider.getBalance(wallet.address);
        if (balanceNative > required) {
          await wrapToken({ ...params, action: "wrap" });
          return await swapToken({
            ...params,
          });
        } else
          return {
            tx: null,
            success: false,
            stop: false,
            message: `Insufficient ${pair.from} balance: ${ethers.formatUnits(balance, decimals)} < ${amount}`,
          };
      }
    }

    const res = await checkBalanceAndApproval(wallet, tokens[pair.from], amount, decimals, SWAP_ROUTER_ADDRESS);

    if (!res.success) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: res.message,
      };
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const exactInputSingleFunctionSelector = "0x04e45aaf";
    const maxFeePerGas = ethers.parseUnits("1.2", "gwei");
    const maxPriorityFeePerGas = ethers.parseUnits("1.2", "gwei");
    const value = ethers.parseEther(amount);

    try {
      const exactInputSingleData =
        exactInputSingleFunctionSelector +
        ethers.AbiCoder.defaultAbiCoder()
          .encode(
            [
              "address", // tokenIn
              "address", // tokenOut
              "uint24", // fee
              "address", // recipient
              "uint256", // amountIn
              "uint256", // amountOutMinimum
              "uint160", // sqrtPriceLimitX96
            ],
            [
              tokens[pair.from],
              tokens[pair.to],
              500,
              wallet.address,
              value,
              "0", // No minimum output
              "0", // No price limit
            ]
          )
          .substring(2);

      const multicallAbi = ["function multicall(uint256 deadline, bytes[] calldata data) payable"];
      const contract = new ethers.Contract(SWAP_ROUTER_ADDRESS, multicallAbi, wallet);
      const multicallData = contract.interface.encodeFunctionData("multicall", [deadline, [exactInputSingleData]]);

      const txParams = {
        to: SWAP_ROUTER_ADDRESS,
        from: wallet.address,
        value: value,
        data: multicallData,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit: 300000,
      };

      let tx = await wallet.sendTransaction(txParams);
      await tx.wait();
      return {
        tx: tx.hash,
        success: true,
        message: `Swap ${amount} ${pair.from} to ${pair.to} success: ${EXPOLER}${tx.hash}`,
      };
    } catch (swapError) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `Swap ${amount} ${pair.from} to ${pair.to} failed for: ${swapError.message}`,
      };
    }
  } catch (error) {
    return {
      tx: null,
      success: false,
      stop: false,
      message: `Error swap: ${error.message}`,
    };
  }
}

async function wrapToken(params) {
  let { action, amount, wallet, balance } = params;
  amount = Number(amount) * 2;
  try {
    if (balance < ethers.parseEther("0.0001")) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `Insufficient PHRS for wrap WPHRS`,
      };
    }

    const contract = new ethers.Contract(WPHRS_ADDRESS, ERC20_ABI, wallet);

    const amountWei = ethers.parseEther(amount.toString());
    let tx;

    if (action === "wrap") {
      tx = await contract.deposit({
        value: amountWei,
        gasLimit: 44866,
      });
    } else {
      tx = await contract.withdraw(amountWei, {
        gasLimit: 35116,
      });
    }
    await tx.wait(3);
    return {
      tx: tx.hash,
      success: true,
      message: `Swap ${amount} success: ${EXPOLER}${tx.hash}`,
    };
  } catch (error) {
    await tx.wait();
    return {
      tx: tx.hash,
      success: true,
      message: `Swap ${amount} failed: ${error.message}`,
    };
  }
}

async function checkBalance({ address: tokenAddress, provider, wallet }) {
  try {
    if (tokenAddress) {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      const balance = await tokenContract.balanceOf(wallet.address);
      const decimals = 18;
      return parseFloat(ethers.formatUnits(balance, decimals)).toFixed(4);
    } else {
      const balance = await provider.getBalance(wallet.address);
      return parseFloat(ethers.formatEther(balance)).toFixed(4);
    }
  } catch (error) {
    console.log(`[${wallet.address}] Failed to check balance: ${error.message}`);
    return "0";
  }
}

async function sendToken({ recipientAddress, amount, wallet, provider }) {
  try {
    amount = amount.toString();
    const amountIn = ethers.parseUnits(amount, 18);
    const balance = await provider.getBalance(wallet.address);

    if (balance < ethers.parseEther("0.0001")) {
      return {
        tx: null,
        success: false,
        stop: true,
        message: "Insufficient PHRS for transfer",
      };
    }

    let amountInWei = ethers.parseEther(amount);

    const minBalance = amountInWei + ethers.parseEther("0.000021");
    if (balance < minBalance) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `Insufficient PHRS. Need at least ${ethers.formatEther(minBalance)} PHRS, have ${ethers.formatEther(balance)} PHRS.`,
      };
    }

    const tx = await wallet.sendTransaction({
      to: recipientAddress,
      value: amountIn,
      gasLimit: 21000,
    });
    await tx.wait();

    return {
      tx: tx.hash,
      success: true,
      message: `Send ${amount} PHRS successful! Transaction hash: ${EXPOLER}${tx.hash}`,
    };
  } catch (error) {
    return {
      tx: null,
      success: false,
      stop: true,
      message: `Error Send: ${error.message}`,
    };
  }
}

module.exports = { sendToken, checkBalance, swapToken, wrapToken, addLp };
