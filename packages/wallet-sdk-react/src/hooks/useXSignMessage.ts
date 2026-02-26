import { useWallet } from '@solana/wallet-adapter-react';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ChainType } from '@sodax/types';
import { useSignMessage } from 'wagmi';
import { useSignPersonalMessage } from '@mysten/dapp-kit';
import { StellarXService } from '@/xchains/stellar';
import { InjectiveXService } from '@/xchains/injective';
import { AleoXService, AleoXConnector } from '@/xchains/aleo';
import { useXAccount } from './useXAccount';
import { getEthereumAddress } from '@injectivelabs/sdk-ts';
import { Wallet } from '@injectivelabs/wallet-base';
import { useXWagmiStore } from '@/useXWagmiStore';

type SignMessageReturnType = `0x${string}` | Uint8Array | string | undefined;

export function useXSignMessage(): UseMutationResult<
  SignMessageReturnType,
  Error,
  { xChainType: ChainType; message: string },
  unknown
> {
  const { signMessage } = useWallet();
  const { signMessageAsync: evmSignMessage } = useSignMessage();

  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const { address: injectiveAddress } = useXAccount('INJECTIVE');

  return useMutation({
    mutationFn: async ({ xChainType, message }: { xChainType: ChainType; message: string }) => {
      let signature: SignMessageReturnType;

      switch (xChainType) {
        case 'EVM': {
          signature = await evmSignMessage({ message });
          break;
        }
        case 'SUI': {
          const res = await signPersonalMessage({ message: new Uint8Array(new TextEncoder().encode(message)) });
          signature = res.signature;
          break;
        }
        case 'SOLANA': {
          if (!signMessage) {
            throw new Error('Solana wallet not connected');
          }
          signature = await signMessage(new TextEncoder().encode(message));
          break;
        }

        case 'STELLAR': {
          const res = await StellarXService.getInstance().walletsKit.signMessage(message);
          signature = res.signedMessage;
          break;
        }

        case 'INJECTIVE': {
          if (!injectiveAddress) {
            throw new Error('Injective address not found');
          }

          const ethereumAddress = getEthereumAddress(injectiveAddress);
          const walletStrategy = InjectiveXService.getInstance().walletStrategy;
          const res = await walletStrategy.signArbitrary(
            walletStrategy.getWallet() === Wallet.Metamask ? ethereumAddress : injectiveAddress,
            message,
          );

          if (!res) {
            throw new Error('Injective signature not found');
          }
          signature = res;
          break;
        }

        case 'ALEO': {
          const aleoConnection = useXWagmiStore.getState().xConnections.ALEO;
          if (!aleoConnection) {
            throw new Error('Aleo wallet not connected');
          }

          const aleoService = AleoXService.getInstance();
          const connector = aleoService.getXConnectorById(aleoConnection.xConnectorId) as AleoXConnector;
          
          if (!connector || !connector.adapter.connected) {
            throw new Error('Aleo wallet not connected');
          }

          const messageBytes = new TextEncoder().encode(message);
          signature = await connector.adapter.signMessage(messageBytes);
          break;
        }

        default:
          console.warn('Unsupported chain type');
          break;
      }

      return signature;
    },
  });
}
