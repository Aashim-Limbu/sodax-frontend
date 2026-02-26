# Plan: Integrate Aleo Chain into the SODAX Web App

## Current State Analysis

### Already Implemented
- `AleoSpokeProvider` / `AleoRawSpokeProvider` / `AleoBaseSpokeProvider` — `packages/sdk/src/shared/entities/aleo/AleoSpokeProvider.ts`
- `AleoSpokeService` (deposit, callWallet, estimateGas, getDeposit, getSimulateDepositParams, waitForConfirmation) — `packages/sdk/src/shared/services/spoke/AleoSpokeService.ts`
- Guards: `isAleoSpokeProvider`, `isAleoRawSpokeProvider`, `isAleoSpokeProviderType` — `packages/sdk/src/shared/guards.ts`
- `AleoGasEstimate`, `AleoSpokeProviderType`, `GetEstimateGasReturnType<ALEO>` — `packages/sdk/src/shared/types.ts`
- `AleoWalletProvider` (privateKey + browserExtension modes) — `packages/wallet-sdk-core/src/wallet-providers/AleoWalletProvider.ts`
- `AleoXService`, `AleoXConnector`, `useAleoXConnectors`, `reconnectAleo` — `packages/wallet-sdk-react/src/xchains/aleo/`
- Chain config & intent relay IDs for `aleo` / `aleo-testnet` — `packages/types/src/constants/index.ts`
- `SpokeService` already dispatches Aleo for: `estimateGas`, `deposit`, `callWallet`, `getDeposit`

### Gaps (what still needs to be done)
1. `GetSpokeDepositParamsType` returns `never` for Aleo — needs `AleoSpokeDepositParams`
2. `SpokeService.getSimulateDepositParams` has no Aleo branch (throws before reaching it)
3. `useWalletProvider` hook has no `ALEO` case
4. `useSpokeProvider` hook has no `ALEO` case
5. `SodaxWalletProvider` does not call `reconnectAleo()`
6. Web app `rpcConfig` is missing the Aleo RPC URL
7. `apps/web/constants/chains.ts` uses a hardcoded `'aleo'` string instead of `ALEO_MAINNET_CHAIN_ID`
8. `swapSupportedTokens[ALEO_MAINNET_CHAIN_ID]` is empty — ALEO and bnUSD tokens need to be added

---

## Proposed Changes

### Step 1 — Fix `GetSpokeDepositParamsType` in `packages/sdk/src/shared/types.ts`
**Why:** The two Aleo branches return `never`, making the type system reject `AleoSpokeDepositParams`.

Add import:
```typescript
import type { AleoSpokeDepositParams } from './services/spoke/AleoSpokeService.js';
```

Change:
```typescript
: T extends AleoSpokeProvider
  ? never  // TODO: Define AleoSpokeDepositParams when needed
  : T extends AleoRawSpokeProvider
    ? never  // TODO: Define AleoSpokeDepositParams when needed
```
To:
```typescript
: T extends AleoSpokeProvider
  ? AleoSpokeDepositParams
  : T extends AleoRawSpokeProvider
    ? AleoSpokeDepositParams
```

---

### Step 2 — Add Aleo branch to `SpokeService.getSimulateDepositParams` in `packages/sdk/src/shared/services/spoke/SpokeService.ts`
**Why:** The method throws for any non-EVM/Stellar/etc provider. Aleo needs its own branch before the throw.

Add before the final `throw`:
```typescript
if (isAleoSpokeProviderType(spokeProvider)) {
  return AleoSpokeService.getSimulateDepositParams(
    params as GetSpokeDepositParamsType<AleoSpokeProviderType>,
    spokeProvider,
    hubProvider,
  );
}
```

Note: No other SpokeService methods need changes — `estimateGas`, `deposit`, `callWallet`, and `getDeposit` all already have Aleo dispatch.

---

### Step 3 — Add `ALEO` case to `useWalletProvider` in `packages/wallet-sdk-react/src/hooks/useWalletProvider.ts`
**Why:** Without this, connecting an Aleo wallet never produces a `walletProvider`, so `useSpokeProvider` always returns `undefined`.

Add imports:
```typescript
import { AleoWalletProvider } from '@sodax/wallet-sdk-core';
import type { AleoXService } from '../xchains/aleo/AleoXService';
import type { AleoXConnector } from '../xchains/aleo/AleoXConnector';
import type { BaseAleoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-core';
import type { IAleoWalletProvider } from '@sodax/types';
import { useXWagmiStore } from '../useXWagmiStore';
```

Add inside `useWalletProvider`:
```typescript
const xConnections = useXWagmiStore(state => state.xConnections);
```

Add case in the `useMemo` switch and update return type union to include `IAleoWalletProvider`:
```typescript
case 'ALEO': {
  const aleoXService = xService as AleoXService;
  const connectorId = xConnections.ALEO?.xConnectorId;
  if (!aleoXService || !connectorId) return undefined;
  const aleoConnector = aleoXService.getXConnectorById(connectorId) as AleoXConnector | undefined;
  if (!aleoConnector) return undefined;
  return new AleoWalletProvider({
    type: 'browserExtension',
    rpcUrl: aleoXService.rpcUrl,
    provableAdapter: aleoConnector.adapter as BaseAleoWalletAdapter,
  });
}
```

Add `xConnections` to the `useMemo` deps array.

---

### Step 4 — Add `ALEO` case to `useSpokeProvider` in `packages/dapp-kit/src/hooks/provider/useSpokeProvider.ts`
**Why:** Without this, no `AleoSpokeProvider` is ever created, so Aleo deposits/swaps can't be initiated.

Add imports:
```typescript
import { AleoSpokeProvider, type AleoSpokeChainConfig } from '@sodax/sdk';
import type { IAleoWalletProvider } from '@sodax/types';
```

Add case inside the `useMemo` before `return undefined`:
```typescript
if (xChainType === 'ALEO') {
  return new AleoSpokeProvider(
    spokeChainConfig[spokeChainId] as AleoSpokeChainConfig,
    walletProvider as IAleoWalletProvider,
    (rpcConfig as Record<string, string>)['aleo'] ?? spokeChainConfig[spokeChainId].rpcUrl,
  );
}
```

---

### Step 5 — Register `reconnectAleo` in `packages/wallet-sdk-react/src/SodaxWalletProvider.tsx`
**Why:** Without reconnection, refreshing the page loses the Aleo wallet connection even if the user previously connected.

Add import:
```typescript
import { reconnectAleo } from './xchains/aleo/actions';
```

Add at the bottom of the file (alongside `reconnectIcon()` and `reconnectStellar()`):
```typescript
reconnectAleo();
```

---

### Step 6 — Add Aleo RPC URL to web app config in `apps/web/providers/constants.ts`
**Why:** `useSpokeProvider` falls back to `rpcConfig['aleo']`; without it the default from `spokeChainConfig` is used, which may not be what the app wants.

Add to `rpcConfig`:
```typescript
aleo: 'https://api.explorer.provable.com/v1',
```

---

### Step 7 — Use `ALEO_MAINNET_CHAIN_ID` constant in `apps/web/constants/chains.ts`
**Why:** Using a hardcoded `'aleo'` string is fragile and will silently break if the constant ever changes.

Update import to include `ALEO_MAINNET_CHAIN_ID` from `@sodax/types` and change:
```typescript
{ id: 'aleo', name: 'ALEO', icon: '/chain/aleo.png' },
```
To:
```typescript
{ id: ALEO_MAINNET_CHAIN_ID, name: 'ALEO', icon: '/chain/aleo.png' },
```

---

### Step 8 — Add Aleo tokens to `swapSupportedTokens` in `packages/types/src/constants/index.ts`
**Why:** The array is currently empty so Aleo tokens never appear in the swap UI.

Change:
```typescript
[ALEO_MAINNET_CHAIN_ID]: [
  // NOTE: Not implemented yet - waiting for contract deployment
] as const satisfies XToken[],
```
To:
```typescript
[ALEO_MAINNET_CHAIN_ID]: [
  spokeChainConfig[ALEO_MAINNET_CHAIN_ID].supportedTokens.ALEO,
  spokeChainConfig[ALEO_MAINNET_CHAIN_ID].supportedTokens.bnUSD,
] as const satisfies XToken[],
```

---

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/sdk/src/shared/types.ts` | `GetSpokeDepositParamsType`: `never` → `AleoSpokeDepositParams` for both Aleo branches |
| 2 | `packages/sdk/src/shared/services/spoke/SpokeService.ts` | Add Aleo branch to `getSimulateDepositParams` |
| 3 | `packages/wallet-sdk-react/src/hooks/useWalletProvider.ts` | Add `ALEO` case + `IAleoWalletProvider` return type |
| 4 | `packages/dapp-kit/src/hooks/provider/useSpokeProvider.ts` | Add `ALEO` case returning `AleoSpokeProvider` |
| 5 | `packages/wallet-sdk-react/src/SodaxWalletProvider.tsx` | Call `reconnectAleo()` |
| 6 | `apps/web/providers/constants.ts` | Add `aleo` RPC URL to `rpcConfig` |
| 7 | `apps/web/constants/chains.ts` | Use `ALEO_MAINNET_CHAIN_ID` constant |
| 8 | `packages/types/src/constants/index.ts` | Add ALEO + bnUSD to `swapSupportedTokens` |

## No New Files Needed

All changes are additions to existing files.

## Verification

1. `pnpm checkTs` — no new type errors
2. `pnpm build` — all packages build cleanly
3. UI: open wallet modal → Aleo group appears; Leo/Puzzle wallet connects
4. Swap UI: Aleo tokens appear in token selector after connecting
5. `apps/node/src/aleo.ts` — raw deposit/callWallet flows still work
