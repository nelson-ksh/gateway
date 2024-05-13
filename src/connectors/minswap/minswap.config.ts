import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace MinswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'minswap.allowedSlippage'
    ),
    tradingTypes: ['AMM'],
    chainType: 'ALGORAND',
    availableNetworks: [
      { chain: 'algorand', networks: ['mainnet', 'testnet'] },
    ],
  };
}
