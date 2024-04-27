import LRUCache from 'lru-cache';
import { getCardanoConfig } from './cardano.config';

export class Cardano {
  public nativeTokenSymbol;
  private static _instances: LRUCache<string, Cardano>;
  private _chain: string = 'cardano';
  private _network: string;
  private _ready: boolean = false;

  // dummy
  getChain() {
    return this._chain;
  }

  getNetwork() {
    return this._network;
  }

  constructor(network: string) {
    this._network = network;
    const config = getCardanoConfig(network);
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
  }

  public static getInstance(network: string): Cardano {
    const config = getCardanoConfig(network);
    if (Cardano._instances === undefined) {
      Cardano._instances = new LRUCache<string, Cardano>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Cardano._instances.has(config.network.name)) {
      if (network !== null) {
        Cardano._instances.set(config.network.name, new Cardano(network));
      } else {
        throw new Error(
          `Cardano.getInstance received an unexpected network: ${network}.`,
        );
      }
    }

    return Cardano._instances.get(config.network.name) as Cardano;
  }

  public static getConnectedInstances(): { [name: string]: Cardano } {
    const connectedInstances: { [name: string]: Cardano } = {};
    if (this._instances !== undefined) {
      const keys = Array.from(this._instances.keys());
      for (const instance of keys) {
        if (instance !== undefined) {
          connectedInstances[instance] = this._instances.get(
            instance
          ) as Cardano;
        }
      }
    }
    return connectedInstances;
  }

  public async init(): Promise<void> {
    // await this.loadAssets();
    this._ready = true;
    return;
  }

  public ready(): boolean {
    return this._ready;
  }
}
