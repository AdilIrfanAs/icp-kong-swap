import { API_URL } from "$lib/api/index";
import { KONG_BACKEND_CANISTER_ID } from "$lib/constants/canisterConstants";
import { createAnonymousActorHelper } from "$lib/utils/actorUtils";
import { auth, requireWalletConnection, canisterIDLs } from "$lib/stores/auth";
import { IcrcService } from "$lib/services/icrc/IcrcService";
import { toastStore } from "$lib/stores/toastStore";

export const fetchPools = async (params?: any): Promise<{pools: BE.Pool[], total_count: number, total_pages: number, page: number, limit: number}> => {
  try {
    const { page = 1, limit = 50, canisterIds, search = '' } = params || {};
    
    // Build query string for pagination and filters
    const queryParams: Record<string, string> = {
      page: page.toString(),
      limit: limit.toString(),
      t: Date.now().toString() // Cache busting
    };
    
    // Add search if provided
    if (search) {
      queryParams.search = search;
    }
    
    // Add canister_id if provided
    if (canisterIds && canisterIds.length > 0) {
      queryParams.canister_id = canisterIds[0];
    }
    
    const queryString = new URLSearchParams(queryParams).toString();
    
    const response = await fetch(
      `${API_URL}/api/pools?${queryString}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      }
    );
   
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error response: ${errorText}`);
      throw new Error(`Failed to fetch pools: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("data", data);
    if (!data || !data.items) {
      throw new Error("Invalid API response");
    }

    // Helper function: Remove underscores and convert to a numeric value.
    const parseNumericString = (value: string | number): number => {
      if (typeof value === 'number') {
        return value;
      }
      return parseFloat(value.replace(/_/g, ''));
    };

    // Helper function: Parse a single pool data item.
    const parsePoolData = (item: any): BE.Pool => {
      const pool = item.pool;

      // If a StablePool raw_json exists, then parse its numeric fields.
      if (pool.raw_json && pool.raw_json.StablePool) {
        const stablePool = pool.raw_json.StablePool;
        const numericFields = [
          'balance_0',
          'balance_1',
          'lp_fee_0',
          'lp_fee_1',
          'lp_token_id',
          'rolling_24h_volume',
          'rolling_24h_lp_fee',
          'rolling_24h_num_swaps',
          'tvl',
          'kong_fee_0',
          'kong_fee_1'
        ];
        numericFields.forEach(field => {
          if (stablePool[field] !== undefined && typeof stablePool[field] === 'string') {
            stablePool[field] = parseNumericString(stablePool[field]);
          }
        });
        pool.raw_json.StablePool = stablePool;
      }

      // Return a flat structure combining pool data with token details.
      return {
        ...pool,
        lp_token_id: item.pool.lp_token_id,
        symbol_0: item.token0?.symbol,
        address_0: item.token0?.canister_id,
        symbol_1: item.token1?.symbol,
        address_1: item.token1?.canister_id,
        token0: item.token0,
        token1: item.token1
      } as BE.Pool;
    };

    const transformedItems = data.items.map(parsePoolData);

    // Compute pagination info
    const currentPage = page;
    const currentLimit = limit;
    const total_count = data.total_count || transformedItems.length;
    const total_pages = data.total_pages || Math.ceil(total_count / currentLimit);

    return {
      pools: transformedItems,
      total_count,
      total_pages,
      page: currentPage,
      limit: currentLimit
    };
  } catch (error) {
    console.error('Error fetching pools:', error);
    throw error;
  }
};

export const fetchPoolBalanceHistory = async (poolId: string | number): Promise<any> => {
  try {
    // Use the exact endpoint without any query parameters
    const endpoint = `${API_URL}/api/pools/${poolId}/balance-history`;
    console.log('Calling pool balance history endpoint:', endpoint);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      // Try to get more information about the error
      let errorInfo = '';
      try {
        const errorData = await response.text();
        errorInfo = errorData ? ` - ${errorData}` : '';
      } catch (e) {
        // Ignore error parsing error
      }
      
      throw new Error(`Failed to fetch pool balance history: ${response.status} ${response.statusText}${errorInfo}`);
    }
    
    const data = await response.json();
    
    // Log the first item to help debug
    if (Array.isArray(data) && data.length > 0) {
      console.log('Sample balance history item:', data[0]);
    } else {
      console.log('Empty or unexpected response format:', data);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching pool balance history:', error);
    throw error;
  }
};

export const fetchPoolTotals = async (): Promise<{total_volume_24h: number, total_tvl: number, total_fees_24h: number}> => {
  try {
    const response = await fetch(`${API_URL}/api/pools/totals`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching pool totals:', error);
    throw error;
  }
}

/**
 * Calculate required amounts for adding liquidity
 */
export async function calculateLiquidityAmounts(
  token0Symbol: string,
  amount0: bigint,
  token1Symbol: string,
): Promise<any> {
  try {
    const actor = createAnonymousActorHelper(
      KONG_BACKEND_CANISTER_ID,
      canisterIDLs.kong_backend,
    );
    const result = await actor.add_liquidity_amounts(
      "IC." + token0Symbol,
      amount0,
      "IC." + token1Symbol,
    );

    if (!result.Ok) {
      throw new Error(result.Err || "Failed to calculate liquidity amounts");
    }

    return result;
  } catch (error) {
    console.error("Error calculating liquidity amounts:", error);
    throw error;
  }
}

/**
 * Calculate amounts that would be received when removing liquidity
 */
export async function calculateRemoveLiquidityAmounts(
  token0CanisterId: string,
  token1CanisterId: string,
  lpTokenAmount: number | bigint,
): Promise<[bigint, bigint]> {
  try {
    const lpTokenBigInt =
      typeof lpTokenAmount === "number"
        ? BigInt(Math.floor(lpTokenAmount * 1e8))
        : lpTokenAmount;

    const actor = await auth.pnp.getActor(
      KONG_BACKEND_CANISTER_ID,
      canisterIDLs.kong_backend,
      { anon: true, requiresSigning: false },
    );

    const result = await actor.remove_liquidity_amounts(
      "IC." + token0CanisterId,
      "IC." + token1CanisterId,
      lpTokenBigInt,
    );

    if (!result.Ok) {
      throw new Error(result.Err || "Failed to calculate removal amounts");
    }

    // Handle the correct response format based on .did file
    const reply = result.Ok;
    return [BigInt(reply.amount_0), BigInt(reply.amount_1)];
  } catch (error) {
    console.error("Error calculating removal amounts:", error);
    throw error;
  }
}

/**
 * Add liquidity to a pool with ICRC2 approval
 */
export async function addLiquidity(params: {
  token_0: FE.Token;
  amount_0: bigint;
  token_1: FE.Token;
  amount_1: bigint;
}): Promise<bigint> {
  requireWalletConnection();
  try {
    if (!params.token_0 || !params.token_1) {
      throw new Error("Invalid token configuration");
    }

    let tx_id_0: Array<{ BlockIndex: bigint }> = [];
    let tx_id_1: Array<{ BlockIndex: bigint }> = [];
    let actor;

    // Handle ICRC2 tokens
    if (params.token_0.icrc2 && params.token_1.icrc2) {
      const [_approval0, _approval1, actorResult] = await Promise.all([
        IcrcService.checkAndRequestIcrc2Allowances(
          params.token_0,
          params.amount_0,
        ),
        IcrcService.checkAndRequestIcrc2Allowances(
          params.token_1,
          params.amount_1,
        ),
        auth.pnp.getActor(KONG_BACKEND_CANISTER_ID, canisterIDLs.kong_backend, {
          anon: false,
          requiresSigning: false,
        }),
      ]);

      // For ICRC2 tokens, we don't need to pass transfer block indexes
      tx_id_0 = [];
      tx_id_1 = [];
      actor = actorResult;


    } else {
      // Handle ICRC1 tokens
      const [transfer0Result, transfer1Result, actorResult] = await Promise.all([
        IcrcService.transfer(
          params.token_0,
          KONG_BACKEND_CANISTER_ID,
          params.amount_0,
        ),
        IcrcService.transfer(
          params.token_1,
          KONG_BACKEND_CANISTER_ID,
          params.amount_1,
        ),
        auth.pnp.getActor(KONG_BACKEND_CANISTER_ID, canisterIDLs.kong_backend, {
          anon: false,
          requiresSigning: false,
        }),
      ]);

      // Keep block IDs as BigInt
      tx_id_0 = transfer0Result?.Ok ? [{ BlockIndex: transfer0Result.Ok }] : [];
      tx_id_1 = transfer1Result?.Ok ? [{ BlockIndex: transfer1Result.Ok }] : [];
      actor = actorResult;
    }

    const addLiquidityArgs = {
      token_0: "IC." + params.token_0.canister_id,
      amount_0: params.amount_0,
      token_1: "IC." + params.token_1.canister_id,
      amount_1: params.amount_1,
      tx_id_0,
      tx_id_1,
    };

    let result = await actor.add_liquidity_async(addLiquidityArgs);

    if ("Err" in result) {
      throw new Error(result.Err);
    }

    return result.Ok;
  } catch (error) {
    console.error("Error adding liquidity:", error);
    throw error;
  }
}

/**
 * Poll for request status
 */
export async function pollRequestStatus(requestId: bigint): Promise<any> {
  let attempts = 0;
  const MAX_ATTEMPTS = 20;
  let lastStatus = '';
  
  const toastId = toastStore.info(
    "Processing liquidity operation...",
  );

  try {
    while (attempts < MAX_ATTEMPTS) {
      const actor = await auth.pnp.getActor(
        KONG_BACKEND_CANISTER_ID,
        canisterIDLs.kong_backend,
        { anon: true }
      );
      const result = await actor.requests([requestId]);

      if (!result.Ok || result.Ok.length === 0) {
        toastStore.dismiss(toastId);
        throw new Error("Failed to get request status");
      }

      const status = result.Ok[0];
      
      // Show status updates in toast
      if (status.statuses && status.statuses.length > 0) {
        const currentStatus = status.statuses[status.statuses.length - 1];
        if (currentStatus !== lastStatus) {
          lastStatus = currentStatus;
          if(currentStatus.includes("Success")) {
            toastStore.success(currentStatus);
          } else {
            toastStore.info(currentStatus);
          }
        }
      }

      // Check for success
      if (status.statuses.includes("Success")) {
        toastStore.dismiss(toastId);
        return status;
      }

      // Check for failure
      if (status.statuses.find(s => s.includes("Failed"))) {
        const failureMessage = status.statuses.find(s => s.includes("Failed"));
        toastStore.dismiss(toastId);
        toastStore.error(failureMessage || "Operation failed");
        return status;
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500)); // .5 second delay between polls
    }

    // If we exit the loop without success/failure
    toastStore.dismiss(toastId);
    toastStore.error("Operation timed out");
    throw new Error("Polling timed out");
  } catch (error) {
    toastStore.dismiss(toastId);
    toastStore.error(error.message || "Error polling request status");
    console.error("Error polling request status:", error);
    throw error;
  }
}

export async function removeLiquidity(params: {
  token0: string;
  token1: string;
  lpTokenAmount: number | bigint;
}): Promise<string> {
  requireWalletConnection();
  try {
    // Ensure we're using BigInt for the amount
    const lpTokenBigInt =
      typeof params.lpTokenAmount === "number"
        ? BigInt(Math.floor(params.lpTokenAmount * 1e8))
        : params.lpTokenAmount;

    const actor = await auth.pnp.getActor(
      KONG_BACKEND_CANISTER_ID,
      canisterIDLs.kong_backend,
      { anon: false, requiresSigning: false },
    );
    const result = await actor.remove_liquidity_async({
      token_0: "IC." + params.token0,
      token_1: "IC." + params.token1,
      remove_lp_token_amount: lpTokenBigInt,
    });

    if (!result.Ok) {
      throw new Error(result.Err || "Failed to remove liquidity");
    }
    return result.Ok.toString();
  } catch (error) {
    console.error("Error removing liquidity:", error);
    throw new Error(error.message || "Failed to remove liquidity");
  }
}

export async function approveTokens(token: FE.Token, amount: bigint) {
  try {
    await IcrcService.checkAndRequestIcrc2Allowances(token, amount);
  } catch (error) {
    console.error("Error approving tokens:", error);
    throw new Error(`Failed to approve ${token.symbol}: ${error.message}`);
  }
}

export async function createPool(params: {
  token_0: FE.Token;
  amount_0: bigint;
  token_1: FE.Token;
  amount_1: bigint;
  initial_price: number;
}) {
  requireWalletConnection();
  
  try {
    let tx_id_0: Array<{ BlockIndex: bigint }> = [];
    let tx_id_1: Array<{ BlockIndex: bigint }> = [];
    let actor;

    // Handle ICRC2 tokens
    if (params.token_0.icrc2 && params.token_1.icrc2) {
      const [approval0, approval1, actorResult] = await Promise.all([
        IcrcService.checkAndRequestIcrc2Allowances(
          params.token_0,
          params.amount_0,
        ),
        IcrcService.checkAndRequestIcrc2Allowances(
          params.token_1,
          params.amount_1,
        ),
        auth.pnp.getActor(KONG_BACKEND_CANISTER_ID, canisterIDLs.kong_backend, {
          anon: false,
          requiresSigning: false,
        }),
      ]);

      // For ICRC2 tokens, we don't need to pass transfer block indexes
      tx_id_0 = [];
      tx_id_1 = [];
      actor = actorResult;
    } else {
      // Handle ICRC1 tokens
      const [transfer0Result, transfer1Result, actorResult] = await Promise.all([
        IcrcService.transfer(
          params.token_0,
          KONG_BACKEND_CANISTER_ID,
          params.amount_0,
        ),
        IcrcService.transfer(
          params.token_1,
          KONG_BACKEND_CANISTER_ID,
          params.amount_1,
        ),
        auth.pnp.getActor(KONG_BACKEND_CANISTER_ID, canisterIDLs.kong_backend, {
          anon: false,
          requiresSigning: false,
        }),
      ]);

      // Keep block IDs as BigInt
      tx_id_0 = transfer0Result?.Ok ? [{ BlockIndex: transfer0Result.Ok }] : [];
      tx_id_1 = transfer1Result?.Ok ? [{ BlockIndex: transfer1Result.Ok }] : [];
      actor = actorResult;
    }

    const result = await actor.add_pool({
      token_0: "IC." + params.token_0.canister_id,
      amount_0: params.amount_0,
      token_1: "IC." + params.token_1.canister_id,
      amount_1: params.amount_1,
      tx_id_0: tx_id_0,
      tx_id_1: tx_id_1,
      lp_fee_bps: [30] // Hardcoded LP fee basis points
    });

    if ('Err' in result) {
      throw new Error(result.Err);
    }

    return result.Ok;
  } catch (error) {
    console.error("Error creating pool:", error);
    throw new Error(error.message || "Failed to create pool");
  }
}

/**
 * Send LP tokens to another address
 */
export async function sendLpTokens(params: {
  token: string; // LP token ID
  toAddress: string;
  amount: number | bigint;
}): Promise<any> {
  requireWalletConnection();
  try {
    // Ensure we're using BigInt for the amount
    const amountBigInt = typeof params.amount === "number"
      ? BigInt(Math.floor(params.amount * 1e8))
      : params.amount;

    const actor = await auth.pnp.getActor(
      KONG_BACKEND_CANISTER_ID,
      canisterIDLs.kong_backend,
      { anon: false, requiresSigning: false },
    );

    const result = await actor.send({
      token: params.token,
      to_address: params.toAddress,
      amount: amountBigInt,
    });

    if (!result.OK) {
      throw new Error(result.Err || "Failed to send LP tokens");
    }

    toastStore.success(`Successfully sent ${params.amount} LP tokens`);
    return result.OK;
  } catch (error) {
    console.error("Error sending LP tokens:", error);
    toastStore.error(error.message || "Failed to send LP tokens");
    throw error;
  }
}
