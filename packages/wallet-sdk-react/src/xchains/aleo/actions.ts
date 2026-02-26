import { useXWagmiStore } from '@/useXWagmiStore';
import { AleoXService } from './AleoXService';
import type { AleoXConnector } from './AleoXConnector';

export const reconnectAleo = async () => {
  const aleoConnection = useXWagmiStore.getState().xConnections.ALEO;
  if (!aleoConnection) return;

  const recentXConnectorId = aleoConnection.xConnectorId;
  const aleoService = AleoXService.getInstance();
  const connector = aleoService.getXConnectorById(recentXConnectorId) as AleoXConnector | undefined;

  if (!connector) return;

  const xAccount = await connector.connect();

  if (xAccount?.address) {
    useXWagmiStore.setState({
      xConnections: {
        ...useXWagmiStore.getState().xConnections,
        ALEO: {
          xAccount: {
            address: xAccount.address,
            xChainType: 'ALEO',
          },
          xConnectorId: recentXConnectorId,
        },
      },
    });
  }
};
