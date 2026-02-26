# Swap Flow: Aleo → ETH Cross-Chain Swap

## Overview

The swap is an intent-based cross-chain protocol using a **hub-and-spoke model**. The hub is **Sonic mainnet** and each supported chain (Aleo, ETH, etc.) is a spoke. A swap from Aleo → ETH goes:

```
Aleo (source spoke) → Sonic Hub → Ethereum (destination spoke)
```

Expected time: **~3 minutes** (Aleo is a "slow chain")

---

## Component Hierarchy

```
SwapPage (apps/web/app/(apps)/swap/page.tsx)
├── CurrencyInputPanel [INPUT]   (swap/_components/currency-input-panel.tsx)
│   └── TokenSelectDialog
├── SwapDirectionToggle
├── CurrencyInputPanel [OUTPUT]  (swap/_components/currency-input-panel.tsx)
│   └── TokenSelectDialog
├── SwapReviewButton             (swap/_components/swap-review-button.tsx)
└── SwapConfirmDialog            (swap/_components/swap-confirm-dialog.tsx)
    ├── SwapButton               (swap/_components/swap-button.tsx)
    └── Status display / tx links
```

---

## Phase 1: User Input & Quote Fetching

**File:** `apps/web/app/(apps)/swap/page.tsx`

When the user types an amount, `setInputAmount()` is called from the Zustand store.

### Zustand Store State (useSwapState / useSwapActions)

| Field | Description |
|---|---|
| `inputToken` | Selected source token (e.g., Aleo USDC) |
| `outputToken` | Selected destination token (e.g., ETH USDC) |
| `inputAmount` | Amount entered by user |
| `isSwapAndSend` | Whether sending to custom address |
| `customDestinationAddress` | Optional destination override |
| `slippageTolerance` | Default 0.5% |
| `swapStatus` | Current execution status |
| `swapError` | Error state |
| `dstTxHash` | Destination tx hash (triggers status polling) |
| `allowanceConfirmed` | Whether token approval is done |

### Quote Payload Construction

```typescript
// SwapPage.tsx ~line 62
const quotePayload = useMemo(() => {
  return {
    token_src: inputToken.address,
    token_src_blockchain_id: inputToken.xChainId,   // Aleo chain ID
    token_dst: outputToken.address,
    token_dst_blockchain_id: outputToken.xChainId,  // ETH chain ID
    amount: parseUnits(inputAmount, inputToken.decimals) - sodax.swaps.getPartnerFee(...),
    quote_type: 'exact_input',
  };
}, [inputToken, outputToken, inputAmount]);
```

### Quote Hook

**File:** `packages/dapp-kit/src/hooks/swap/useQuote.ts`

```typescript
export const useQuote = (payload) => {
  return useQuery({
    queryKey: ['quote', ...],
    queryFn: async () => sodax.swaps.getQuote(payload),
    refetchInterval: 3000,  // Auto-refreshes every 3 seconds
  });
};
```

### Fee Calculations

```typescript
// Partner fee (configurable, e.g., 1%)
partnerFee = inputAmount * (percentage / 10000)

// Solver fee (fixed 0.1%)
solverFee = outputAmount * 10 / 10000

// Adjusted amount sent for quoting
adjustedAmount = inputAmount - partnerFee

// Min output with slippage protection
minOutputAmount = quotedOutput * (100 - slippageTolerance) / 100
```

---

## Phase 2: Validation & Review Button

**File:** `apps/web/app/(apps)/swap/_components/swap-review-button.tsx`

The button iterates through validation states in order:

1. Source chain not connected → "Connect Aleo"
2. Quote unavailable → "Quote unavailable"
3. Destination chain not connected (non SwapAndSend) → "Connect ETH"
4. Input validation error → shows error text
5. Wrong source network → "Switch to [network]"
6. All valid → "Review" button enabled

**On "Review" click:**
```typescript
const handleReview = async () => {
  setFixedOutputAmount(calculatedOutputAmount);
  setFixedMinOutputAmount(minOutputAmount);
  setIsSwapConfirmOpen(true);  // Opens SwapConfirmDialog
};
```

---

## Phase 3: SwapConfirmDialog Opens

**File:** `apps/web/app/(apps)/swap/_components/swap-confirm-dialog.tsx`

On open, builds the `intentOrderPayload`:

```typescript
const intentOrderPayload: CreateIntentParams = {
  inputToken: inputToken.address,           // Aleo token address (as field)
  outputToken: outputToken.address,         // ETH token address
  inputAmount: parseUnits(inputAmount, inputToken.decimals),
  minOutputAmount: minOutputAmount,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 5), // 5 min TTL
  allowPartialFill: false,
  srcChain: inputToken.xChainId,            // Aleo chain ID
  dstChain: outputToken.xChainId,           // ETH chain ID
  srcAddress: sourceAddress,                // User's Aleo address
  dstAddress: finalDestinationAddress,      // User's ETH address (or custom)
  solver: '0x000...000',
  data: '0x',
};
```

### Provider Setup

**SpokeProvider** — `packages/dapp-kit/src/hooks/provider/useSpokeProvider.ts`

For Aleo source:
```typescript
return new AleoSpokeProvider(
  spokeChainConfig[spokeChainId] as AleoSpokeChainConfig,
  walletProvider as IAleoWalletProvider,
);
```

**WalletProvider** — `packages/wallet-sdk-react/src/hooks/useWalletProvider.ts`

For Aleo:
```typescript
case 'ALEO': {
  return new AleoWalletProvider({
    type: 'browserExtension',
    rpcUrl: 'https://api.explorer.provable.com/v2',
    provableAdapter: adapter as BaseAleoWalletAdapter,
    network: 'testnet',
  });
}
```

---

## Phase 4: Token Approval

**File:** `apps/web/app/(apps)/swap/_components/swap-button.tsx`

### Check Allowance

**Hook:** `packages/dapp-kit/src/hooks/swap/useSwapAllowance.ts`

```typescript
return useQuery({
  queryKey: ['allowance', params],
  queryFn: async () => {
    const allowance = await sodax.swaps.isAllowanceValid({ intentParams: params, spokeProvider });
    return allowance.ok ? allowance.value : false;
  },
  refetchInterval: 2000,  // Poll every 2 seconds
});
```

### Approve Flow

If `!allowanceConfirmed && !hasAllowed`, shows the "Approve [token]" button.

**Hook:** `packages/dapp-kit/src/hooks/swap/useSwapApprove.ts`

```typescript
mutationFn: async ({ params }) => {
  const result = await sodax.swaps.approve({ intentParams: params, spokeProvider });
  if (!result.ok) throw new Error('Failed to approve');
  return result.ok;
},
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['allowance', params] });
}
```

On success → `setAllowanceConfirmed(true)` → "Approve" button replaced by "Swap" button.

---

## Phase 5: Swap Execution

**File:** `apps/web/app/(apps)/swap/_components/swap-confirm-dialog.tsx`

User clicks "Swap" → `handleSwapConfirm()`:

```typescript
const handleSwapConfirm = async () => {
  const result = await executeSwap(intentOrderPayload);

  if (!result.ok) {
    setSwapError(getSwapErrorMessage(result.error?.code));
    return;
  }

  const [, , intentDeliveryInfo] = result.value;
  setDstTxHash(intentDeliveryInfo.dstTxHash);  // Triggers status polling
  setSwapStatus(SolverIntentStatusCode.NOT_STARTED_YET);
};
```

**Hook:** `packages/dapp-kit/src/hooks/swap/useSwap.ts`

```typescript
mutationFn: async (params: CreateIntentParams) => {
  return sodax.swaps.swap({ intentParams: params, spokeProvider });
}
```

---

## Phase 6: SDK — Intent Creation & Relay

**File:** `packages/sdk/src/swap/SwapService.ts`

`sodax.swaps.swap()` → `createAndSubmitIntent()` which runs 4 steps:

### Step 1: Create Intent on Aleo

```typescript
const [spokeTxHash, intent, data] = await this.createIntent({
  intentParams: params,
  spokeProvider,
  fee,
});
```

Calls down the chain:

```
SwapService.createIntent()
  └── SpokeService.deposit()
        └── AleoSpokeService.deposit()
              └── AleoBaseSpokeProvider.transfer()
                    └── walletProvider.execute(asset_manager.aleo/transfer)
```

**File:** `packages/sdk/src/shared/services/spoke/AleoSpokeService.ts`

```typescript
// 1. Derive user's hub wallet address from their Aleo address
const userWallet = await EvmWalletAbstraction.getUserHubWalletAddress(
  spokeProvider.chainConfig.chain.id,
  encodeAddress(spokeProvider.chainConfig.chain.id, params.from),
  hubProvider,
);

// 2. Generate random connection sequence number (nonce)
const connSn = BigInt(AleoSpokeService.generateConnSn());

// 3. Call transfer
return AleoSpokeService.transfer({ token, recipient: userWallet, amount, data, connSn, ... });
```

**Aleo Program Call** (`AleoBaseSpokeProvider.transfer()`):

```aleo
// asset_manager.aleo transition executed:
transition transfer(
  token: field,          // Aleo token ID
  dst_address: [u8; 32], // Hub wallet address
  amount: u64,           // Token amount
  conn_sn: u128,         // Random nonce
  data: [u8; 32],        // keccak256 of intent data
  fee_amount: u64,       // Protocol fee
  hub_chain_id: u128,    // Sonic chain ID
  hub_address: [u8; 32], // Hub contract address
) -> Future
```

Returns `transactionId` (the `spokeTxHash`).

### Step 2: Verify Transaction

```typescript
await SpokeService.verifyTxHash(spokeTxHash, spokeProvider);
// Waits for Aleo tx to confirm on-chain
```

### Step 3: Submit to Relayer

```typescript
// Submit tx hash to relayer API
await this.submitIntent({
  action: 'submit',
  params: {
    chain_id: getIntentRelayChainId(params.srcChain).toString(),
    tx_hash: spokeTxHash,
  },
});

// Wait for relay to hub chain
const packet = await waitUntilIntentExecuted({
  intentRelayChainId,
  spokeTxHash,
  timeout: DEFAULT_RELAY_TX_TIMEOUT, // 60s default
  apiUrl: this.config.relayerApiEndpoint,
});

dstIntentTxHash = packet.value.dst_tx_hash;
// This is the tx hash on Sonic Hub
```

### Step 4: Post Execution

```typescript
await this.postExecution({
  intent_tx_hash: dstIntentTxHash,
});
// Notifies solver the hub tx is confirmed; solver now executes on ETH
```

### Return Value

```typescript
return {
  ok: true,
  value: [
    solverExecutionResponse,
    intent,
    {
      srcChainId: 'aleo-testnet',
      srcTxHash: spokeTxHash,
      srcAddress: params.srcAddress,
      dstChainId: 'eth-mainnet',
      dstTxHash: dstIntentTxHash,   // Hub chain tx, NOT final ETH tx
      dstAddress: params.dstAddress,
    },
  ],
};
```

---

## Phase 7: Status Polling

`setDstTxHash(dstIntentTxHash)` triggers a `useEffect` that polls intent status.

**Hook:** `packages/dapp-kit/src/hooks/swap/useStatus.ts`

```typescript
return useQuery({
  queryKey: [intent_tx_hash],
  queryFn: async () => sodax.swaps.getStatus({ intent_tx_hash }),
  refetchInterval: 3000,  // Poll solver API every 3 seconds
});
```

### Status Progression

| Status Code | Meaning |
|---|---|
| `NOT_FOUND` | Not yet indexed |
| `NOT_STARTED_YET` | Intent created, awaiting solver |
| `IN_PROGRESS` | Solver executing |
| `SOLVED` | Solver filled the intent on hub |
| `FAILED` | Swap failed |

### On SOLVED Status

```typescript
// SwapConfirmDialog useEffect
if (statusCode === SolverIntentStatusCode.SOLVED) {
  const filledIntent = await sodax.swaps.getFilledIntent(status.value.fill_tx_hash);

  // Wait for relay from Sonic Hub → ETH
  const packet = await waitUntilIntentExecuted({
    intentRelayChainId: getIntentRelayChainId(SONIC_MAINNET_CHAIN_ID).toString(),
    spokeTxHash: status.value.fill_tx_hash,
    timeout: 300000,  // 5 minutes
    apiUrl: sodax.relayerApiEndpoint,
  });

  if (packet.ok) {
    setTargetChainSolved(true);  // Shows "Swap complete" UI
  }
}
```

---

## Complete Execution Flow Diagram

```
User enters amount
        │
        ▼
useQuote (polls every 3s) ──► Solver API: GET /quote
        │
        ▼
User clicks "Review"
        │
        ▼
SwapConfirmDialog opens
        │
        ▼
useSwapAllowance (polls every 2s) ──► sodax.swaps.isAllowanceValid()
        │
        ├── NOT ALLOWED ──► Show "Approve USDC" button
        │         │
        │         ▼
        │   useSwapApprove.mutate()
        │         │
        │         ▼
        │   sodax.swaps.approve({ intentParams, spokeProvider })
        │         │
        │         ▼
        │   AleoSpokeProvider.approve() ──► Wallet signs approval tx
        │         │
        │         ▼
        │   setAllowanceConfirmed(true)
        │
        └── ALLOWED ──► Show "Swap" button
                  │
                  ▼
            User clicks "Swap"
                  │
                  ▼
            handleSwapConfirm()
                  │
                  ▼
            useSwap.mutate(intentOrderPayload)
                  │
                  ▼
            sodax.swaps.swap({ intentParams, spokeProvider })
                  │
                  ▼
            SwapService.createAndSubmitIntent()
                  │
                  ├─ [1] createIntent()
                  │         │
                  │         ▼
                  │   SpokeService.deposit()
                  │         │
                  │         ▼
                  │   AleoSpokeService.deposit()
                  │    - Derive hub wallet from Aleo address
                  │    - Generate random connSn nonce
                  │         │
                  │         ▼
                  │   AleoBaseSpokeProvider.transfer()
                  │    - Encode params as Aleo types
                  │         │
                  │         ▼
                  │   walletProvider.execute(asset_manager.aleo/transfer)
                  │    - Browser extension signs & submits
                  │         │
                  │         ▼
                  │   Returns: spokeTxHash (Aleo tx ID)
                  │
                  ├─ [2] SpokeService.verifyTxHash(spokeTxHash)
                  │    - Waits for Aleo tx confirmation
                  │
                  ├─ [3] submitIntent({ chain_id, tx_hash: spokeTxHash })
                  │    ──► Relayer API: POST /submit
                  │         │
                  │         ▼
                  │   waitUntilIntentExecuted() polls relayer
                  │         │
                  │         ▼
                  │   Relayer monitors Aleo, relays to Sonic Hub
                  │         │
                  │         ▼
                  │   Returns: dstIntentTxHash (Sonic Hub tx ID)
                  │
                  └─ [4] postExecution({ intent_tx_hash: dstIntentTxHash })
                       ──► Solver API: notifies hub tx confirmed
                             │
                             ▼
                       Solver executes swap on Sonic Hub
                             │
                             ▼
                       Returns: [SolverExecutionResponse, Intent, DeliveryInfo]

                  │
                  ▼
            setDstTxHash(dstIntentTxHash) ──► Triggers status polling
                  │
                  ▼
            useStatus polls every 3s ──► Solver API: GET /status
                  │
                  ├─ status = IN_PROGRESS ──► Show progress UI
                  │
                  └─ status = SOLVED
                            │
                            ▼
                      getFilledIntent(fill_tx_hash)
                            │
                            ▼
                      waitUntilIntentExecuted()
                       - Sonic Hub → ETH relay
                       - Polls relayer API (5 min timeout)
                            │
                            ▼
                      setTargetChainSolved(true)
                            │
                            ▼
                      Show "Swap complete" ✓
```

---

## Key Files Reference

| File | Role |
|---|---|
| `apps/web/app/(apps)/swap/page.tsx` | Main swap page, state orchestration |
| `apps/web/app/(apps)/swap/_components/currency-input-panel.tsx` | Token + amount input |
| `apps/web/app/(apps)/swap/_components/swap-review-button.tsx` | Validation + review trigger |
| `apps/web/app/(apps)/swap/_components/swap-confirm-dialog.tsx` | Confirm dialog, approval, execution |
| `apps/web/app/(apps)/swap/_components/swap-button.tsx` | Approve/Swap button logic |
| `apps/web/lib/swap-timing.ts` | Timing labels (slow vs fast chains) |
| `packages/dapp-kit/src/hooks/swap/useQuote.ts` | Quote fetching hook |
| `packages/dapp-kit/src/hooks/swap/useSwapAllowance.ts` | Allowance check hook |
| `packages/dapp-kit/src/hooks/swap/useSwapApprove.ts` | Approval mutation hook |
| `packages/dapp-kit/src/hooks/swap/useSwap.ts` | Swap execution hook |
| `packages/dapp-kit/src/hooks/swap/useStatus.ts` | Status polling hook |
| `packages/dapp-kit/src/hooks/provider/useSpokeProvider.ts` | SpokeProvider factory |
| `packages/sdk/src/swap/SwapService.ts` | Core SDK swap logic |
| `packages/sdk/src/shared/services/spoke/AleoSpokeService.ts` | Aleo deposit/transfer logic |
| `packages/wallet-sdk-react/src/xchains/aleo/AleoXService.ts` | Aleo chain service |
| `packages/wallet-sdk-react/src/hooks/useWalletProvider.ts` | Wallet provider factory |
| `packages/wallet-sdk-core/src/wallet-providers/AleoWalletProvider.ts` | Aleo wallet adapter |

---

## Important Notes

- **Hub Wallet Abstraction**: Each Aleo address has a deterministically derived wallet on Sonic Hub. The deposit goes to this hub wallet.
- **connSn (Connection Sequence Number)**: A random `u128` nonce generated per transaction to uniquely identify cross-chain messages.
- **Relay Pattern**: All non-hub swaps relay through Sonic Hub. Aleo → ETH = 2 relay hops: Aleo→Sonic, Sonic→ETH.
- **Timing**: Aleo and Ethereum are marked as "slow chains" (`SLOW_CHAINS` in `swap-timing.ts`). Expected time is ~3 minutes.
- **Data Encoding**: Intent data is `keccak256` hashed and passed as `[u8; 32]` to the Aleo program. Addresses use 32-byte hex encoding for cross-chain compatibility.
