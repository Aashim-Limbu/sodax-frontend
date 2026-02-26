'use client';

import { useCurrentAccount, useCurrentWallet, useSuiClient } from '@mysten/dapp-kit';
import { useEffect } from 'react';
import { EvmXService } from './xchains/evm';
import { SolanaXService } from './xchains/solana/SolanaXService';
import { SuiXService } from './xchains/sui';
import { useAnchorProvider } from './xchains/solana/hooks/useAnchorProvider';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useConfig } from 'wagmi';
import { useAleoXConnectors } from './xchains/aleo/useAleoXConnectors';
import { reconnectAleo } from './xchains/aleo/actions';

export const Hydrate = () => {
  // sui
  const suiClient = useSuiClient();
  useEffect(() => {
    if (suiClient) {
      SuiXService.getInstance().suiClient = suiClient;
    }
  }, [suiClient]);
  const { currentWallet: suiWallet } = useCurrentWallet();
  useEffect(() => {
    if (suiWallet) {
      SuiXService.getInstance().suiWallet = suiWallet;
    }
  }, [suiWallet]);
  const suiAccount = useCurrentAccount();
  useEffect(() => {
    if (suiAccount) {
      SuiXService.getInstance().suiAccount = suiAccount;
    }
  }, [suiAccount]);

  // solana
  const { connection: solanaConnection } = useConnection();
  const solanaWallet = useWallet();
  const solanaProvider = useAnchorProvider();
  useEffect(() => {
    if (solanaConnection) {
      SolanaXService.getInstance().connection = solanaConnection;
    }
  }, [solanaConnection]);
  useEffect(() => {
    if (solanaWallet) {
      SolanaXService.getInstance().wallet = solanaWallet;
    }
  }, [solanaWallet]);
  useEffect(() => {
    if (solanaProvider) {
      SolanaXService.getInstance().provider = solanaProvider;
    }
  }, [solanaProvider]);

  // evm
  const wagmiConfig = useConfig();
  useEffect(() => {
    if (wagmiConfig) {
      EvmXService.getInstance().wagmiConfig = wagmiConfig;
    }
  }, [wagmiConfig]);

  // aleo
  const { isLoading: aleoConnectorsLoading } = useAleoXConnectors();
  useEffect(() => {
    if (!aleoConnectorsLoading) {
      reconnectAleo();
    }
  }, [aleoConnectorsLoading]);

  return null;
};
