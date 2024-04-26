import LRUCache from 'lru-cache';
import { getCardanoConfig } from './cardano.config';

export class Cardano {
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

  public async init(): Promise<void> {
    // await this.loadAssets();
    this._ready = true;
    return;
  }

  public ready(): boolean {
    return this._ready;
  }
}
