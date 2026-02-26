import type { XAccount } from '@/types';
import { XConnector } from '@/core';
import type { WalletAdapter } from '@provablehq/aleo-wallet-standard';
import { WalletDecryptPermission } from '@provablehq/aleo-wallet-standard';
import { Network } from '@provablehq/aleo-types';
import { AleoXService } from './AleoXService';

export class AleoXConnector extends XConnector {
  adapter: WalletAdapter;
  private defaultNetwork: Network = Network.TESTNET3;
  private defaultDecryptPermission: WalletDecryptPermission = WalletDecryptPermission.NoDecrypt;

  constructor(adapter: WalletAdapter) {
    super('ALEO', adapter.name, adapter.name);
    this.adapter = adapter;
  }

  getXService(): AleoXService {
    return AleoXService.getInstance();
  }

  async connect(): Promise<XAccount | undefined> {
    const account = await this.adapter.connect(
      this.defaultNetwork,
      this.defaultDecryptPermission,
      []
    );
    
    if (!account?.address) {
      return undefined;
    }

    return {
      address: account.address,
      xChainType: this.xChainType,
    };
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  public get icon() {
    return this.adapter.icon;
  }
}
