import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  maxLRUCacheInstances: number;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
}

export function getCardanoConfig(network: string): Config {
  return {
    network: {
      name: network,
      maxLRUCacheInstances: 10,
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      'cardano.nativeCurrencySymbol',
    ),
  };
}
