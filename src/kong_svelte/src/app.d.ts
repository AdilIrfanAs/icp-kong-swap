// See https://kit.svelte.dev/docs/types#app
/// <reference path="./types/index.d.ts" />

declare global {
  interface CanisterIdIcpLedger {
    [key: string]: any;
  }
  
  const CANISTER_ID_ICP_LEDGER: CanisterIdIcpLedger;

  interface Result<T> {
    Ok?: T;
    Err?: string;
  }
  
  namespace FE {
    interface TokenBalance {
      in_tokens: bigint;
      in_usd: string;
    }
    
    interface Transaction {
      type: 'send' | 'receive';
      amount: string;
      token: string;
      to?: string;
      from?: string;
      date: string;
    }
  }

  namespace BE {
    // Pool Types
  
   type PoolResponse = {
      pools: Pool[];
      total_tvl: bigint;
      total_24h_volume: bigint;
      total_24h_lp_fee: bigint;
      total_24h_num_swaps: number;
  }
  
  // Swap Types
   interface SwapTx {
      ts: bigint;
      receive_chain: string;
      pay_amount: bigint;
      receive_amount: bigint;
      pay_symbol: string;
      receive_symbol: string;
      receive_address: string;
      pool_symbol: string;
      price: number;
      pay_chain: string;
      lp_fee: bigint;
      gas_fee: bigint;
  }
  
   interface SwapQuoteResponse {
      Ok?: {
          txs: SwapTx[];
          receive_chain: string;
          mid_price: number;
          pay_amount: bigint;
          receive_amount: bigint;
          pay_symbol: string;
          receive_symbol: string;
          receive_address: string;
          pay_address: string;
          price: number;
          pay_chain: string;
          slippage: number;
      };
      Err?: string;
  }
  
   interface SwapAsyncResponse {
      Ok?: bigint;
      Err?: string;
  }
  
  // Request Status Types
   interface TransferInfo {
      transfer_id: bigint;
      transfer: {
          IC: {
              is_send: boolean;
              block_index: bigint;
              chain: string;
              canister_id: string;
              amount: bigint;
              symbol: string;
          }
      }
  }
  
   interface SwapReply {
      Swap: {
          ts: bigint;
          txs: SwapTx[];
          request_id: bigint;
          status: string;
          tx_id: bigint;
          transfer_ids: TransferInfo[];
          receive_chain: string;
          mid_price: number;
          pay_amount: bigint;
          receive_amount: bigint;
          claim_ids: bigint[];
          pay_symbol: string;
          receive_symbol: string;
          price: number;
          pay_chain: string;
          slippage: number;
      }
  }
  
   interface RequestResponse {
      Ok?: Array<{
          ts: bigint;
          request_id: bigint;
          request: any;
          statuses: string[];
          reply: SwapReply | { Pending: null };
      }>;
      Err?: string;
  }
  
  // User Types
   interface User {
      account_id: string;
      user_name: string;
      fee_level_expires_at?: bigint;
      referred_by?: string;
      user_id: number;
      fee_level: number;
      principal_id: string;
      referred_by_expires_at?: bigint;
      campaign1_flags: boolean[];
      my_referral_code: string;
    }
  }
}

export {};
