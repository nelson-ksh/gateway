import {
  poolUtils,
  SignerTransaction,
  SupportedNetwork,
  Swap,
  SwapQuote,
  SwapQuoteType,
  SwapType,
  V2PoolInfo,
} from '@tinymanorg/tinyman-js-sdk';
import { V2SwapExecution } from '@tinymanorg/tinyman-js-sdk/dist/swap/types';
import { Account } from 'algosdk';
import LRUCache from 'lru-cache';
import { pow } from 'mathjs';
import { PriceRequest } from '../../amm/amm.requests';
import { Algorand } from '../../chains/algorand/algorand';
import { getAlgorandConfig } from '../../chains/algorand/algorand.config';
import { AlgorandAsset } from '../../chains/algorand/algorand.requests';
import { percentRegexp } from '../../services/config-manager-v2';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { logger } from '../../services/logger';
import { MinswapConfig } from './minswap.config';

export class Minswap {
  private static _instances: LRUCache<string, Minswap>;
  private chain: Algorand;
  private _ready: boolean = false;
  private _config: MinswapConfig.NetworkConfig;
  private _swap;

  public get swap() {
    return this._swap;
  }

  private constructor(network: string) {
    this._config = MinswapConfig.config;
    this.chain = Algorand.getInstance(network);
    this._swap = Swap;
  }

  public static getInstance(network: string): Minswap {
    const config = getAlgorandConfig(network);
    if (Minswap._instances === undefined) {
      Minswap._instances = new LRUCache<string, Minswap>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Minswap._instances.has(network)) {
      if (network !== null) {
        Minswap._instances.set(network, new Minswap(network));
      } else {
        throw new Error(
          `Minswap.getInstance received an unexpected network: ${network}.`
        );
      }
    }

    return Minswap._instances.get(network) as Minswap;
  }

  public async init() {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Gets the allowed slippage percent from configuration.
   */
  getSlippage(): number {
    const allowedSlippage = this._config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) slippage = Number(nd[1]) / Number(nd[2]);
    return slippage;
  }

  /**
   * Fetches information about a pair and constructs a pair from the given two tokens.
   * This is to replace the Fetcher Class
   * @param baseToken  first token
   * @param quoteToken second token
   */

  async fetchData(
    baseToken: AlgorandAsset,
    quoteToken: AlgorandAsset
  ): Promise<V2PoolInfo> {
    logger.info(
      `Fetching pair data for ${baseToken.symbol}-${quoteToken.symbol}.`
    );
    return await poolUtils.v2.getPoolInfo({
      network: this.chain.network as SupportedNetwork,
      client: this.chain.algod,
      asset1ID: baseToken.assetId,
      asset2ID: quoteToken.assetId,
    });
  }

  /**
   * This is typically used for calculating token prices.
   *
   * @param req Price request object
   */

  async estimateTrade(req: PriceRequest) {
    const baseToken: AlgorandAsset | null = this.chain.getAssetForSymbol(
      req.base
    );
    const quoteToken: AlgorandAsset | null = this.chain.getAssetForSymbol(
      req.quote
    );

    if (baseToken === null || quoteToken === null)
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
        TOKEN_NOT_SUPPORTED_ERROR_CODE
      );
    const baseAsset = { id: baseToken.assetId, decimals: baseToken.decimals };
    const quoteAsset = {
      id: quoteToken.assetId,
      decimals: quoteToken.decimals,
    };
    const amount = Number(req.amount) * <number>pow(10, baseToken.decimals);
    const isBuy: boolean = req.side === 'BUY';
    const pool: V2PoolInfo = await this.fetchData(baseToken, quoteToken);

    const quote = await this.swap.v2.getQuote({
      type: isBuy === true ? SwapType.FixedOutput : SwapType.FixedInput,
      amount: Number(amount.toString()),
      assetIn: isBuy === true ? quoteAsset : baseAsset,
      assetOut: isBuy === true ? baseAsset : quoteAsset,
      pool,
      network: this.chain.network as SupportedNetwork,
      isSwapRouterEnabled: false,
    });
    const price =
      quote.type === SwapQuoteType.Direct ? quote.data.quote.rate : 0;
    logger.info(
      `Best quote for ${baseToken.symbol}-${quoteToken.symbol}: ` +
        `${price}` +
        `${baseToken.symbol}.`
    );
    const expectedPrice = isBuy === true ? 1 / price : price;
    const expectedAmount =
      req.side === 'BUY'
        ? Number(req.amount)
        : expectedPrice * Number(req.amount);

    return { trade: quote, expectedAmount, expectedPrice };
  }

  /**
   * Given an account and a minswap trade, try to execute it on blockchain.
   *
   * @param account Algorand account
   * @param quote Expected trade
   * @param isBuy Used to indicate buy or sell swap
   */

  async executeTrade(
    account: Account,
    quote: SwapQuote,
    isBuy: boolean
  ): Promise<V2SwapExecution> {
    const network = this.chain.network as SupportedNetwork;
    const fixedSwapTxns = await this.swap.v2.generateTxns({
      client: this.chain.algod,
      network,
      swapType: isBuy === true ? SwapType.FixedOutput : SwapType.FixedInput,
      quote,
      slippage: this.getSlippage(),
      initiatorAddr: account.addr,
    });
    const signedTxns = await this.swap.v2.signTxns({
      txGroup: fixedSwapTxns,
      initiatorSigner: this.signerWithSecretKey(account),
    });
    const tx = await this.swap.v2.execute({
      client: this.chain.algod,
      quote,
      txGroup: fixedSwapTxns,
      signedTxns,
    });

    logger.info(`Swap transaction Id: ${tx.txnID}`);
    return tx;
  }

  /**
   * @param account account data that will sign the transactions
   * @returns a function that will sign the transactions, can be used as `initiatorSigner`
   */
  signerWithSecretKey(account: Account) {
    return function (txGroups: SignerTransaction[][]): Promise<Uint8Array[]> {
      // Filter out transactions that don't need to be signed by the account
      const txnsToBeSigned = txGroups.flatMap((txGroup) =>
        txGroup.filter((item) => item.signers?.includes(account.addr))
      );
      // Sign all transactions that need to be signed by the account
      const signedTxns: Uint8Array[] = txnsToBeSigned.map(({ txn }) =>
        txn.signTxn(account.sk)
      );

      // We wrap this with a Promise since SDK's initiatorSigner expects a Promise
      return new Promise((resolve) => {
        resolve(signedTxns);
      });
    };
  }
}
