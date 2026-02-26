import { useXService } from '@/hooks';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { WalletAdapter as BaseAleoWalletAdapter } from '@provablehq/aleo-wallet-standard';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { FoxWalletAdapter } from '@provablehq/aleo-wallet-adaptor-fox';
import { PuzzleWalletAdapter } from '@provablehq/aleo-wallet-adaptor-puzzle';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { SoterWalletAdapter } from '@provablehq/aleo-wallet-adaptor-soter';
import { AleoXConnector } from './AleoXConnector';
import type { AleoXService } from './AleoXService';

interface AleoWindow extends Window {
  leoWallet?: unknown;
  leo?: unknown;
  foxwallet?: { aleo?: unknown };
  puzzle?: unknown;
  shield?: unknown;
  soter?: unknown;
}

const WALLET_ADAPTERS = [
  { check: (w: AleoWindow): boolean => !!(w.leoWallet || w.leo), Adapter: LeoWalletAdapter },
  { check: (w: AleoWindow): boolean => !!w.foxwallet?.aleo, Adapter: FoxWalletAdapter },
  { check: (w: AleoWindow): boolean => !!w.puzzle, Adapter: PuzzleWalletAdapter },
  { check: (w: AleoWindow): boolean => !!w.shield, Adapter: ShieldWalletAdapter },
  { check: (w: AleoWindow): boolean => !!w.soter, Adapter: SoterWalletAdapter },
] as const;

export const useAleoXConnectors = (): UseQueryResult<AleoXConnector[] | undefined, Error | null> => {
  const xService = useXService('ALEO') as AleoXService;

  return useQuery({
    queryKey: ['aleo-wallets'],
    queryFn: async () => {
      if (!xService || typeof window === 'undefined') {
        return [];
      }

      const w = window as AleoWindow;
      const wallets: BaseAleoWalletAdapter[] = [];

      for (const { check, Adapter } of WALLET_ADAPTERS) {
        if (check(w)) {
          try {
            wallets.push(new Adapter());
          } catch {
            // Wallet adapter not available
          }
        }
      }

      const connectors = wallets.map(adapter => new AleoXConnector(adapter));
      xService.setXConnectors(connectors);

      return connectors;
    },
    enabled: !!xService,
  });
};
