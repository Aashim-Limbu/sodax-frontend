# Sodax SDK Architecture

## 1. What is Sodax

Sodax is a cross-chain DeFi protocol enabling swaps, lending, and bridging across 15+ blockchains. It uses a **hub-and-spoke model** with Sonic (EVM, chain ID 146) as the hub and all other chains as spokes.

The protocol is **intent-based**: users express desired outcomes (e.g., "swap 100 USDC on Aleo for ETH on Arbitrum"), and solvers compete to fulfill them. This abstracts away cross-chain complexity — users interact with their native chain and wallet, while the protocol handles routing, bridging, and settlement.

## 2. Monorepo Structure

```
packages/
  types/               @sodax/types          Shared types, chain constants, contract addresses
  sdk/                 @sodax/sdk            Core SDK: spoke providers, spoke services, hub services
  wallet-sdk-core/     @sodax/wallet-sdk-core  Chain-specific wallet provider implementations
  wallet-sdk-react/    @sodax/wallet-sdk-react  React hooks, XService/XConnector pattern, SodaxWalletProvider
  dapp-kit/            @sodax/dapp-kit       High-level React hooks (useSpokeProvider, useQuote, useSwap)

apps/
  web/                 Production Next.js web app
  node/                Node.js CLI for integration tests & examples
  demo/                Demo app
```

## 3. Hub-and-Spoke Architecture

### Hub (Sonic, Chain ID 146)

The hub chain runs the core protocol contracts:

- **Asset Manager** — tracks deposited assets, manages cross-chain balances
- **Wallet Abstraction** — each user gets a hub wallet derived from their spoke address; all cross-chain actions route through it
- **Intents Contract** — accepts intent submissions, coordinates solver fulfillment
- **Money Market** — lending/borrowing pools on the hub chain

### Spokes (All Other Chains)

Each spoke chain deploys two contracts (or programs, in Aleo's case):

- **Asset Manager** — accepts user deposits and disbursement of withdrawals
- **Connection** — handles cross-chain message encoding and relay submission

### xCall Relay

Cross-chain message passing layer that relays events between spoke and hub:

- **Deposit flow**: User deposits on spoke → asset_manager emits event → relayer picks up → hub receives and credits hub wallet
- **Withdrawal flow**: Hub initiates withdrawal → relayer picks up → spoke asset_manager disburses tokens to user

## 4. Intent Lifecycle (Swap Flow)

```
1. User selects source/dest tokens + amount
         │
2. useQuote() ──→ Solver API returns quote (price, slippage, fees)
         │
3. UI builds CreateIntentParams
   { inputToken, outputToken, inputAmount, minOutputAmount,
     deadline, srcChain, dstChain, srcAddress, dstAddress }
         │
4. useSwapAllowance() ──→ checks token approval on spoke
         │
5. useSwapApprove() ──→ approves token spend if needed
         │
6. useSwap() ──→ SpokeService.deposit()
   │  • Simulates deposit on hub (except Aleo and Sonic)
   │  • Calls spoke chain's asset_manager contract
   │  • Returns tx hash
         │
7. Relayer picks up deposit event, relays to hub
         │
8. Solver sees intent, fills on destination chain
         │
9. useStatus() / waitUntilIntentExecuted() polls for settlement
```

### Key Hooks (packages/dapp-kit/src/hooks/swap/)

| Hook | Purpose |
|------|---------|
| `useQuote` | Fetches solver quote via `SolverIntentQuoteRequest` |
| `useSwap` | Executes deposit via `SpokeService.deposit()` |
| `useSwapAllowance` | Checks if token spending is approved |
| `useSwapApprove` | Approves token spending |
| `useStatus` | Polls intent status via solver API |

## 5. Spoke Provider Pattern

### Class Hierarchy

Every spoke chain implements two provider variants:

- **`SpokeProvider`** (full wallet) — has wallet access, signs and submits transactions, returns tx hashes
- **`RawSpokeProvider`** — only knows the wallet address, returns unsigned transaction objects for external signing

### Generic Type System (`packages/sdk/src/shared/types.ts`)

```typescript
// Returns tx hash (full provider) or raw transaction object (raw provider)
type TxReturnType<T extends SpokeProviderType, Raw extends boolean>

// Selects correct deposit params type based on provider chain
type GetSpokeDepositParamsType<T extends SpokeProviderType>

// Selects correct gas estimate type based on provider chain
type GetEstimateGasReturnType<T extends SpokeProviderType>
```

### Guard-Based Dispatch (`packages/sdk/src/shared/guards.ts`)

`SpokeService` uses type guards to dispatch to the correct chain-specific service:

```typescript
isAleoSpokeProviderType(value)       → AleoSpokeService
isEvmSpokeProviderType(value)        → EvmSpokeService
isSuiSpokeProviderType(value)        → SuiSpokeService
isIconSpokeProviderType(value)       → IconSpokeService
isInjectiveSpokeProviderType(value)  → InjectiveSpokeService
isSolanaSpokeProviderType(value)     → SolanaSpokeService
isStellarSpokeProviderType(value)    → StellarSpokeService
```

### Per-Chain Implementation Set

Each chain provides:

| Component | Example (Aleo) | Location |
|-----------|----------------|----------|
| SpokeProvider | `AleoSpokeProvider` | `packages/sdk/src/shared/entities/aleo/` |
| RawSpokeProvider | `AleoRawSpokeProvider` | `packages/sdk/src/shared/entities/aleo/` |
| SpokeService | `AleoSpokeService` | `packages/sdk/src/shared/services/spoke/` |
| WalletProvider | `AleoWalletProvider` | `packages/wallet-sdk-core/src/wallet-providers/` |
| XService | `AleoXService` | `packages/wallet-sdk-react/src/xchains/aleo/` |
| XConnector | `AleoXConnector` | `packages/wallet-sdk-react/src/xchains/aleo/` |

## 6. Wallet Integration Pipeline

```
Browser Wallet (MetaMask, Leo Wallet, Phantom, etc.)
    │
    ▼
XConnector (individual wallet adapter wrapper)
    │  AleoXConnector wraps Leo/Fox/Puzzle/Shield/Soter adapters
    │
    ▼
XService (chain-specific singleton managing connectors + balance queries)
    │  AleoXService.getInstance() — singleton with NetworkClient
    │
    ▼
useWalletProvider(chainId)
    │  Returns IAleoWalletProvider / IEvmWalletProvider / etc.
    │
    ▼
useSpokeProvider(chainId, walletProvider)
    │  Returns AleoSpokeProvider / EvmSpokeProvider / etc.
    │
    ▼
SpokeService.deposit() / SpokeService.callWallet() / etc.
```

### XService (`packages/wallet-sdk-react/src/core/XService.ts`)

Abstract base class for chain-specific wallet management:

- Holds an array of `XConnector` instances
- Provides `getBalance()` and `getBalances()` for token queries
- Singleton pattern per chain

### XConnector (`packages/wallet-sdk-react/src/core/XConnector.ts`)

Abstract base class wrapping individual wallet adapters:

- `connect()` → returns `XAccount` with address and chain type
- `disconnect()` → cleans up wallet connection
- Each browser wallet gets its own XConnector instance

### SodaxWalletProvider (`packages/wallet-sdk-react/src/SodaxWalletProvider.tsx`)

Top-level React provider that:

- Wraps the app with wallet context for all chains
- Calls reconnect functions for previously connected wallets
- Provides `useXService`, `useXAccount`, `useXConnectors` hooks

### Hydrate Component (`packages/wallet-sdk-react/src/Hydrate.ts`)

Handles wallet reconnection on app load:

- Detects available wallet adapters per chain
- Reconnects to previously used wallets
- Includes Aleo reconnection via `reconnectAleo()`

## 7. Aleo-Specific Architecture

### Programs vs Smart Contracts

Aleo uses **programs** instead of smart contracts. The Sodax spoke deploys:

| Program | Purpose |
|---------|---------|
| `sodax_asset_manager_v1.aleo` | Accepts deposits, disburses withdrawals |
| `sodax_connection_v1.aleo` | Encodes and sends cross-chain messages |
| `credits.aleo` | Native Aleo token (ALEO credits) |
| `token_registry.aleo` | Custom token tracking |

### Leo Type Formatting

Aleo's Leo language requires explicit type annotations on all values:

- Amounts: `"123456789u128"` or `"100u64"` — via `AleoBaseSpokeProvider.formatAmount()`
- Addresses: encoded as `[u8; 32]` byte arrays — via `hexToAleoU8Array()`
- Token IDs: `field` type representation
- Hub chain ID: `"146u128"` (Sonic)

### Random connSn Generation

Unlike EVM chains where contracts can read on-chain state to auto-increment sequence numbers, Aleo transitions **cannot read on-chain mappings**. The SDK generates a random `connSn` (connection sequence number) client-side via `AleoSpokeService.generateConnSn()`.

### Data Hashing

Cross-chain payload data is hashed with `keccak256` before being passed to the Aleo program call. This produces a 32-byte hash that fits the `[u8; 32]` parameter format.

### No Deposit Simulation

Most chains simulate the deposit on the hub before executing on the spoke. Aleo skips this step — the `SpokeService.deposit()` flow for Aleo does not call `getSimulateDepositParams()` because Aleo can't simulate cross-chain transfers the same way EVM chains can.

### AleoExecuteOptions

Instead of raw calldata (like EVM's `0x...` hex), Aleo uses structured execution options:

```typescript
type AleoExecuteOptions = {
  programId: string       // e.g., "sodax_asset_manager_v1.aleo"
  functionName: string    // e.g., "transfer" or "transfer_native"
  inputs: string[]        // Leo-formatted arguments
  fee: number             // Transaction fee in microcredits
}
```

### Transaction Confirmation

Aleo transactions are confirmed via polling with `waitForTransactionReceipt()`:

- Default check interval: 2000ms
- Default RPC timeout: 45000ms
- Receipt contains status: `'accepted'` or `'rejected'`

### Two Token Types

| Type | Function Called | Example |
|------|----------------|---------|
| Native (credits.aleo) | `transferNative` on asset_manager | ALEO credits |
| Token registry tokens | `transfer` on asset_manager | bnUSD, wrapped assets |

### Deposit Flow (Aleo-specific)

```
1. AleoSpokeService.deposit(params, spokeProvider, hubProvider)
2. Derive hub wallet address via EvmWalletAbstraction.getUserHubWalletAddress()
3. Generate random connSn
4. Hash data payload with keccak256
5. Format all values as Leo types (u128, u64, [u8; 32])
6. Call asset_manager program:
   - Native token → transferNative function
   - Other tokens → transfer function
7. Return tx ID (full provider) or raw transaction (raw provider)
8. Relayer picks up and relays to hub
```

### Withdrawal Flow (Aleo-specific)

```
1. AleoSpokeService.callWallet(from, payload, spokeProvider, hubProvider)
2. Derive hub wallet address
3. Build withdraw payload via EvmAssetManagerService.withdrawAssetData()
4. Call connection program's send_message function
5. Hub contracts process withdrawal
6. Relayer relays back to Aleo spoke
7. Asset manager disburses tokens
```

### Wallet Providers

`AleoWalletProvider` (`packages/wallet-sdk-core/src/wallet-providers/AleoWalletProvider.ts`) supports two modes:

| Mode | Use Case |
|------|----------|
| `privateKey` | Node.js testing, CLI tools — uses `Account` from `@provablehq/sdk` |
| `browserExtension` | Web app — wraps wallet adapter (Leo, Fox, Puzzle, Shield, Soter) |

Key methods:
- `execute(options: AleoExecuteOptions)` — submits transaction
- `executeAndWait(options, receiptOptions?)` — submits and polls for confirmation
- `waitForTransactionReceipt(txId, options?)` — polls for receipt
- Supports delegate proving via Provable API

### Supported Browser Wallets

Detected via `useAleoXConnectors` hook (`packages/wallet-sdk-react/src/xchains/aleo/useAleoXConnectors.ts`):

- Leo Wallet (`@provablehq/aleo-wallet-adaptor-leo`)
- Fox Wallet (`@provablehq/aleo-wallet-adaptor-fox`)
- Puzzle Wallet (`@provablehq/aleo-wallet-adaptor-puzzle`)
- Shield Wallet (`@provablehq/aleo-wallet-adaptor-shield`)
- Soter Wallet (`@provablehq/aleo-wallet-adaptor-soter`)

### Address Encoding

```typescript
// Validation
AleoBaseSpokeProvider.isValidAleoAddress(address)
  // starts with 'aleo1', length === 63

// Transaction ID validation
AleoBaseSpokeProvider.isValidTransactionId(txId)
  // starts with 'at1', length === 61

// Hex to Leo array (for cross-chain address encoding)
AleoBaseSpokeProvider.hexToAleoU8Array(hex)
  // "0xabcd..." → "[171u8, 205u8, ...]"
  // Left-pads to 32 bytes

// BCS encoding for cross-chain
AleoBaseSpokeProvider.getAddressBCSBytes(aleoAddress)
  // Encodes address for hub-side decoding
```

### Chain Constants (`packages/types/src/constants/index.ts`)

```typescript
ALEO_MAINNET_CHAIN_ID = 'aleo'
ALEO_TESTNET_CHAIN_ID = 'aleo-testnet'

// Intent relay chain IDs
ChainIdToIntentRelayChainId['aleo'] = 28n
ChainIdToIntentRelayChainId['aleo-testnet'] = 6694886634401n

// Aleo mainnet chain info
baseChainInfo['aleo'] = {
  name: 'Aleo', id: 'aleo', type: 'ALEO', chainId: 'aleo'
}

// Aleo testnet chain info
baseChainInfo['aleo-testnet'] = {
  name: 'Aleo Testnet', id: 'aleo-testnet', type: 'ALEO', chainId: 6694886634403
}
```

### Spoke Chain Config (`packages/types/src/constants/index.ts`)

```typescript
type AleoSpokeChainConfig = BaseSpokeChainConfig<'ALEO'> & {
  rpcUrl: string
  walletAddress: string
  addresses: {
    assetManager: string    // sodax_asset_manager_v1.aleo
    connection: string      // sodax_connection_v1.aleo
    xTokenManager: string
    rateLimit: string
    testToken: string
  }
  nativeToken: string       // 'credits.aleo' (mainnet)
  gasPrice: string
  network: AleoNetworkEnv   // 'mainnet' | 'testnet'
}
```

### RPC URLs

| Network | URL |
|---------|-----|
| Mainnet (spoke config) | `https://api.explorer.provable.com/v1` |
| Testnet (spoke config) | `https://api.provable.com/v2` |
| AleoXService (mainnet) | `https://api.explorer.aleo.org/v1` |
| AleoXService (testnet) | `https://api.explorer.provable.com/v1` |

## 8. Key File Reference

### Core SDK (`packages/sdk/src/shared/`)

| File | Purpose |
|------|---------|
| `entities/aleo/AleoSpokeProvider.ts` | `AleoSpokeProvider`, `AleoRawSpokeProvider`, `AleoBaseSpokeProvider` |
| `entities/aleo/index.ts` | Exports Aleo providers |
| `services/spoke/AleoSpokeService.ts` | `deposit`, `callWallet`, `getDeposit`, `estimateGas`, `generateConnSn` |
| `services/spoke/SpokeService.ts` | Main dispatcher — routes to chain-specific services via guards |
| `services/hub/HubService.ts` | Hub-side operations |
| `services/hub/EvmAssetManagerService.ts` | Hub asset manager (withdraw data encoding) |
| `services/hub/EvmWalletAbstraction.ts` | Hub wallet address derivation |
| `guards.ts` | Type guards: `isAleoSpokeProviderType`, `isAleoSpokeProvider`, etc. |
| `types.ts` | `AleoSpokeProviderType`, `TxReturnType`, `GetSpokeDepositParamsType`, etc. |

### Wallet SDK Core (`packages/wallet-sdk-core/src/wallet-providers/`)

| File | Purpose |
|------|---------|
| `AleoWalletProvider.ts` | Private key + browser extension wallet implementation |
| `AleoWalletProvider.test.ts` | Unit tests for wallet provider |

### Wallet SDK React (`packages/wallet-sdk-react/src/`)

| File | Purpose |
|------|---------|
| `xchains/aleo/AleoXService.ts` | Singleton service for Aleo balance queries |
| `xchains/aleo/AleoXConnector.ts` | Wallet adapter wrapper for browser wallets |
| `xchains/aleo/useAleoXConnectors.ts` | Hook to detect available Aleo wallets |
| `xchains/aleo/actions.ts` | `reconnectAleo()` — reconnects on app load |
| `xchains/aleo/index.ts` | Exports Aleo wallet integration |
| `hooks/useWalletProvider.ts` | Returns chain-specific wallet provider |
| `SodaxWalletProvider.tsx` | Top-level provider wrapping all chains |
| `Hydrate.ts` | Wallet reconnection on app load |

### Dapp Kit (`packages/dapp-kit/src/hooks/`)

| File | Purpose |
|------|---------|
| `provider/useSpokeProvider.ts` | Creates chain-specific spoke provider from wallet provider |
| `swap/useQuote.ts` | Fetches solver quote |
| `swap/useSwap.ts` | Executes swap via deposit |
| `swap/useSwapAllowance.ts` | Checks token approval |
| `swap/useSwapApprove.ts` | Approves token spending |
| `swap/useStatus.ts` | Polls intent execution status |

### Types (`packages/types/src/`)

| File | Purpose |
|------|---------|
| `constants/index.ts` | Chain IDs, spoke configs, base chain info, relay chain IDs |
| `common/index.ts` | `AleoSpokeChainConfig`, `BaseSpokeChainConfig`, chain types |

### Web App (`apps/web/`)

| File | Purpose |
|------|---------|
| `constants/chains.ts` | Chain UI config (name, icon) — includes Aleo |
| `components/icons/chains/aleo.tsx` | Aleo chain icon SVG |
| `components/shared/wallet-modal/wallet-modal.tsx` | Wallet connection modal |
| `apis/users.ts` | User registration (signature-based) |

### Node CLI (`apps/node/src/`)

| File | Purpose |
|------|---------|
| `aleo.ts` | CLI for deposit, withdraw, supply, borrow, repay, createIntent |
| `aleo-transfer.ts` | Transfer utility functions and tests |
