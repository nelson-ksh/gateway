import LRUCache from "lru-cache";
import { MinswapConfig } from "./minswap.config";
import { Cardano } from "../../chains/cardano/cardano";
import { getCardanoConfig } from "../../chains/cardano/cardano.config";

export class Minswap {
    private static _instances: LRUCache<string, Minswap>;
    private chain: Cardano;
    private _ready: boolean = false;
    private _config: MinswapConfig.NetworkConfig;
    // private _swap;

    // public get swap() {
    //     return this._swap;
    //   }

    //dummy
    getConfig() {
        return this._config;
    }

      private constructor(network: string) {
        this._config = MinswapConfig.config;
        this.chain = Cardano.getInstance(network);
        // this._swap = Swap;
      }

      public static getInstance(network: string): Minswap {
        const config = getCardanoConfig(network);
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
}