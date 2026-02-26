# Aleo Integration Status

## Done

| # | Item | File(s) |
|---|------|---------|
| 1 | `AleoSpokeProvider` + `AleoRawSpokeProvider` classes | `packages/sdk/src/shared/entities/aleo/AleoSpokeProvider.ts` |
| 2 | `AleoBaseSpokeProvider` with address encoding, Leo formatting, balance queries | `packages/sdk/src/shared/entities/aleo/AleoSpokeProvider.ts` |
| 3 | `AleoSpokeService` — deposit, callWallet, getDeposit, estimateGas, generateConnSn, waitForConfirmation | `packages/sdk/src/shared/services/spoke/AleoSpokeService.ts` |
| 4 | Type guards: `isAleoSpokeProviderType`, `isAleoSpokeProvider`, `isAleoRawSpokeProvider` | `packages/sdk/src/shared/guards.ts` |
| 5 | `AleoSpokeProviderType` union type + conditional types (`TxReturnType`, `GetSpokeDepositParamsType`, `GetEstimateGasReturnType`) | `packages/sdk/src/shared/types.ts` |
| 6 | `AleoSpokeDepositParams`, `AleoRawTransaction`, `AleoExecuteOptions` types | `packages/sdk/src/shared/types.ts` |
| 7 | Chain constants: `ALEO_MAINNET_CHAIN_ID`, `ALEO_TESTNET_CHAIN_ID`, `ChainIdToIntentRelayChainId` | `packages/types/src/constants/index.ts` |
| 8 | Spoke chain config (mainnet + testnet) with program addresses, RPC URLs, supported tokens | `packages/types/src/constants/index.ts` |
| 9 | `AleoSpokeChainConfig` type definition | `packages/types/src/common/index.ts` |
| 10 | `AleoWalletProvider` — private key + browser extension modes, execute, executeAndWait, waitForTransactionReceipt | `packages/wallet-sdk-core/src/wallet-providers/AleoWalletProvider.ts` |
| 11 | `AleoWalletProvider` unit tests | `packages/wallet-sdk-core/src/wallet-providers/AleoWalletProvider.test.ts` |
| 12 | `AleoXService` — singleton, balance queries, network client | `packages/wallet-sdk-react/src/xchains/aleo/AleoXService.ts` |
| 13 | `AleoXConnector` — wallet adapter wrapper, connect/disconnect | `packages/wallet-sdk-react/src/xchains/aleo/AleoXConnector.ts` |
| 14 | `useAleoXConnectors` hook — detects Leo/Fox/Puzzle/Shield/Soter wallets | `packages/wallet-sdk-react/src/xchains/aleo/useAleoXConnectors.ts` |
| 15 | `reconnectAleo()` action | `packages/wallet-sdk-react/src/xchains/aleo/actions.ts` |
| 16 | `reconnectAleo()` called in Hydrate component on app load | `packages/wallet-sdk-react/src/Hydrate.ts` |
| 17 | Aleo chain icon + chain UI entry | `apps/web/components/icons/chains/aleo.tsx`, `apps/web/constants/chains.ts` |
| 18 | Node.js CLI — deposit, withdraw, supply, borrow, repay, createIntent, transfer | `apps/node/src/aleo.ts`, `apps/node/src/aleo-transfer.ts` |
| 19 | Aleo guard dispatch in `SpokeService.deposit()` | `packages/sdk/src/shared/services/spoke/SpokeService.ts` |

## TODO

| # | Item | File | What Needs to Change |
|---|------|------|---------------------|
| 1 | Add Aleo branch to `getSimulateDepositParams` | `packages/sdk/src/shared/services/spoke/SpokeService.ts` (lines ~313-362) | Add `if (isAleoSpokeProviderType(spokeProvider))` case that calls `AleoSpokeService.getSimulateDepositParams()`. Currently throws `'Invalid spoke provider'` for Aleo. Note: Aleo may intentionally skip simulation (see Architecture.md §7), in which case the guard should return a no-op or the caller should skip the call for Aleo. |
| 2 | Add `case 'ALEO'` to `useWalletProvider` hook | `packages/wallet-sdk-react/src/hooks/useWalletProvider.ts` (lines ~43-148) | Add `case 'ALEO':` to the switch statement. Should construct and return an `AleoWalletProvider` from `xService` and `xAccount`, similar to how SUI/ICON/etc. are handled. |
| 3 | Add `IAleoWalletProvider` to `useWalletProvider` return type | `packages/wallet-sdk-react/src/hooks/useWalletProvider.ts` (line ~43-52) | Add `\| IAleoWalletProvider` to the return type union. Currently only includes EVM, SUI, ICON, Injective, Stellar, Solana. |
| 4 | Add `xChainType === 'ALEO'` case to `useSpokeProvider` hook | `packages/dapp-kit/src/hooks/provider/useSpokeProvider.ts` (lines ~47-124) | Add an ALEO branch that creates `new AleoSpokeProvider(spokeChainConfig[spokeChainId] as AleoSpokeChainConfig, walletProvider as IAleoWalletProvider)`. Currently returns `undefined` for Aleo. |
| 5 | Add `reconnectAleo()` call at module level in `SodaxWalletProvider` | `packages/wallet-sdk-react/src/SodaxWalletProvider.tsx` (lines ~51-53) | Add `reconnectAleo();` alongside existing `reconnectIcon()` and `reconnectStellar()` calls. Currently only called inside Hydrate component, but other chains also call reconnect at module level. |
| 6 | Add Aleo to user registration support | `apps/web/apis/users.ts` (lines ~1-72) | Add `'ALEO'` to `SIGN_SUPPORTED_CHAINS` array and handle Aleo signature format in the registration flow. Currently Aleo falls back to localStorage-only registration. |
| 7 | Replace hardcoded hub chain ID `BigInt(146)` with constant | `packages/sdk/src/shared/services/spoke/AleoSpokeService.ts` (line ~177) | Use a shared constant (e.g., `HUB_CHAIN_ID`) instead of the hardcoded value. Minor cleanup. |
| 8 | Expand Aleo token lists | `packages/types/src/constants/index.ts` (lines ~1409-1456) | Currently only ALEO (credits) and bnUSD are listed. Add additional tokens as they become available on the Aleo spoke (e.g., wrapped assets, stablecoins). Depends on contract deployments. |
| 9 | Wire Aleo into swap/money-market/bridge token list UI | `apps/web/` (various components) | Ensure the web app's token selectors, swap UI, money market UI, and bridge UI include Aleo tokens when Aleo is selected as source/destination chain. Requires TODO items 2-4 to be completed first. |
| 10 | Align `AleoXService` RPC URLs with spoke chain config | `packages/wallet-sdk-react/src/xchains/aleo/AleoXService.ts` | `AleoXService` hardcodes its own RPC URLs (`api.explorer.aleo.org`, `api.explorer.provable.com`) which differ from the spoke chain config URLs. Should read from spoke chain config or accept config injection for consistency. |
