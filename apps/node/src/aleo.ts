import 'dotenv/config';
import type { Address, Hash, Hex } from 'viem';
import {
  AleoSpokeProvider,
  AleoSpokeService,
  EvmAssetManagerService,
  EvmHubProvider,
  EvmWalletAbstraction,
  spokeChainConfig,
  type AleoSpokeChainConfig,
  type EvmHubProviderConfig,
  type SodaxConfig,
  Sodax,
  getHubChainConfig,
  getMoneyMarketConfig,
  encodeAddress,
} from '@sodax/sdk';
import { AleoWalletProvider } from '@sodax/wallet-sdk-core';
import { ALEO_TESTNET_CHAIN_ID, ALEO_MAINNET_CHAIN_ID, SONIC_MAINNET_CHAIN_ID, type HubChainId } from '@sodax/types';
import { solverConfig } from './config.js';

const IS_TESTNET = process.env.IS_TESTNET === 'true';
const ALEO_CHAIN_ID = IS_TESTNET ? ALEO_TESTNET_CHAIN_ID : ALEO_MAINNET_CHAIN_ID;
const aleoChainConfig = spokeChainConfig[ALEO_CHAIN_ID] as AleoSpokeChainConfig;
const ALEO_RPC_URL = process.env.ALEO_RPC_URL || aleoChainConfig.rpcUrl;
const ALEO_PRIVATE_KEY = process.env.ALEO_PRIVATE_KEY;
const HUB_CHAIN_ID: HubChainId = SONIC_MAINNET_CHAIN_ID;
const PROVABLE_API_KEY = process.env.PROVABLE_API_KEY;
const PROVABLE_CONSUMER_ID = process.env.PROVABLE_CONSUMER_ID;
const PROVABLE_DELEGATE_URL = process.env.PROVABLE_DELEGATE_URL;
const HUB_RPC_URL = process.env.HUB_RPC_URL || 'https://rpc.soniclabs.com';
const API_URL = process.env.API_URL || 'http://localhost:4566/';

if (!ALEO_PRIVATE_KEY) throw new Error('ALEO_PRIVATE_KEY is required');
if (!ALEO_PRIVATE_KEY.startsWith('APrivateKey1')) throw new Error('Invalid ALEO_PRIVATE_KEY');

const aleoWalletProvider = new AleoWalletProvider({
  type: 'privateKey',
  rpcUrl: ALEO_RPC_URL,
  privateKey: ALEO_PRIVATE_KEY,
  network: IS_TESTNET ? 'testnet' : 'mainnet',
  ...(PROVABLE_API_KEY && PROVABLE_CONSUMER_ID
    ? {
        delegate: {
          apiKey: PROVABLE_API_KEY,
          consumerId: PROVABLE_CONSUMER_ID,
          url: PROVABLE_DELEGATE_URL,
        },
      }
    : {}),
});

const hubConfig = {
  hubRpcUrl: HUB_RPC_URL,
  chainConfig: getHubChainConfig(),
} satisfies EvmHubProviderConfig;

const moneyMarketConfig = getMoneyMarketConfig(HUB_CHAIN_ID);

const sodax = new Sodax({
  swaps: solverConfig,
  moneyMarket: moneyMarketConfig,
  hubProviderConfig: hubConfig,
} satisfies SodaxConfig);

const hubProvider = new EvmHubProvider({
  config: hubConfig,
  configService: sodax.config,
});

const aleoSpokeProvider = new AleoSpokeProvider(aleoChainConfig, aleoWalletProvider, ALEO_RPC_URL);

async function submitData(txHash: string, address: Address, payload: Hex | null) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'submit',
      params: {
        chain_id: `${aleoSpokeProvider.chainConfig.chain.chainId}`,
        tx_hash: txHash,
        data: {
          address,
          payload,
        },
      },
    }),
  });
  return response.json();
}

async function getUserWallet() {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const walletAddressBytes = encodeAddress(ALEO_CHAIN_ID, walletAddress);
  return await EvmWalletAbstraction.getUserHubWalletAddress(
    aleoSpokeProvider.chainConfig.chain.id,
    walletAddressBytes,
    hubProvider,
  );
}

//! solana mimic
async function depositTo(token: string, amount: number, recipient: Address) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const data = EvmAssetManagerService.depositToData(
    {
      token,
      to: recipient,
      amount: BigInt(amount),
    },
    aleoSpokeProvider.chainConfig.chain.id,
    sodax.config,
  );

  const txId = await AleoSpokeService.deposit(
    {
      from: walletAddress,
      token,
      amount,
      data,
    },
    aleoSpokeProvider,
    hubProvider,
  );
  const userWallet = await getUserWallet();

  const res = await submitData(txId, userWallet, data);
  console.log(res);

  console.log('[depositTo] txId', txId);
}

async function withdrawAsset(token: string, amount: number, recipient: string) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const walletAddressBytes = encodeAddress(ALEO_TESTNET_CHAIN_ID, walletAddress);
  const hubWallet = await EvmWalletAbstraction.getUserHubWalletAddress(
    aleoSpokeProvider.chainConfig.chain.id,
    walletAddressBytes,
    hubProvider,
  );

  const data = EvmAssetManagerService.withdrawAssetData(
    {
      token,
      to: encodeAddress(ALEO_TESTNET_CHAIN_ID, recipient),
      amount: BigInt(amount),
    },
    hubProvider,
    aleoSpokeProvider.chainConfig.chain.id,
  );

  const txId = await AleoSpokeService.callWallet(hubWallet, data, aleoSpokeProvider, hubProvider);

  console.log('[withdrawAsset] txId', txId);
}

async function supply(token: string, amount: number) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const walletAddressBytes = encodeAddress(ALEO_TESTNET_CHAIN_ID, walletAddress);
  const hubWallet = await EvmWalletAbstraction.getUserHubWalletAddress(
    aleoSpokeProvider.chainConfig.chain.id,
    walletAddressBytes,
    hubProvider,
  );

  const data = sodax.moneyMarket.buildSupplyData(
    aleoSpokeProvider.chainConfig.chain.id,
    token,
    BigInt(amount),
    hubWallet,
  );

  const txId = await AleoSpokeService.deposit(
    {
      from: walletAddress,
      token,
      amount,
      data,
    },
    aleoSpokeProvider,
    hubProvider,
  );

  console.log('[supply] txId', txId);
}

async function borrow(token: string, amount: number) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const walletAddressBytes = encodeAddress(ALEO_TESTNET_CHAIN_ID, walletAddress);
  const hubWallet = await EvmWalletAbstraction.getUserHubWalletAddress(
    aleoSpokeProvider.chainConfig.chain.id,
    walletAddressBytes,
    hubProvider,
  );

  const data: Hex = sodax.moneyMarket.buildBorrowData(
    hubWallet,
    walletAddressBytes,
    token,
    BigInt(amount),
    aleoSpokeProvider.chainConfig.chain.id,
  );

  const txId = await AleoSpokeService.callWallet(hubWallet, data, aleoSpokeProvider, hubProvider);

  console.log('[borrow] txId', txId);
}

async function withdraw(token: string, amount: number) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const walletAddressBytes = encodeAddress(ALEO_TESTNET_CHAIN_ID, walletAddress);
  const hubWallet = await EvmWalletAbstraction.getUserHubWalletAddress(
    aleoSpokeProvider.chainConfig.chain.id,
    walletAddressBytes,
    hubProvider,
  );

  const data: Hex = sodax.moneyMarket.buildWithdrawData(
    hubWallet,
    walletAddressBytes,
    token,
    BigInt(amount),
    aleoSpokeProvider.chainConfig.chain.id,
  );

  const txId = await AleoSpokeService.callWallet(hubWallet, data, aleoSpokeProvider, hubProvider);

  console.log('[withdraw] txId', txId);
}

async function repay(token: string, amount: number) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();
  const walletAddressBytes = encodeAddress(ALEO_TESTNET_CHAIN_ID, walletAddress);
  const hubWallet = await EvmWalletAbstraction.getUserHubWalletAddress(
    aleoSpokeProvider.chainConfig.chain.id,
    walletAddressBytes,
    hubProvider,
  );

  const data: Hex = sodax.moneyMarket.buildRepayData(
    aleoSpokeProvider.chainConfig.chain.id,
    token,
    BigInt(amount),
    hubWallet,
  );

  const txId = await AleoSpokeService.deposit(
    {
      from: walletAddress,
      token,
      amount,
      data,
    },
    aleoSpokeProvider,
    hubProvider,
  );

  console.log('[repay] txId', txId);
}

async function createIntent(amount: number, inputToken: string, outputToken: string) {
  const walletAddress = await aleoSpokeProvider.walletProvider.getWalletAddress();

  const txId = await sodax.swaps.createIntent({
    intentParams: {
      inputToken,
      outputToken,
      inputAmount: BigInt(amount),
      minOutputAmount: 0n,
      deadline: 0n,
      allowPartialFill: false,
      srcChain: aleoSpokeProvider.chainConfig.chain.id,
      dstChain: aleoSpokeProvider.chainConfig.chain.id,
      srcAddress: walletAddress,
      dstAddress: walletAddress,
      solver: '0x0000000000000000000000000000000000000000',
      data: '0x',
    },
    spokeProvider: aleoSpokeProvider,
  });

  console.log('[createIntent] txId', txId);
}

async function main() {
  const functionName = process.argv[2];

  if (functionName === 'deposit') {
    const token = process.argv[3];
    const amount = Number(process.argv[4]);
    const recipient = process.argv[5] as Address;
    await depositTo(token, amount, recipient);
  } else if (functionName === 'withdrawAsset') {
    const token = process.argv[3];
    const amount = Number(process.argv[4]);
    const recipient = process.argv[5] as Hex;
    await withdrawAsset(token, amount, recipient);
  } else if (functionName === 'supply') {
    const token = process.argv[3];
    const amount = Number(process.argv[4]);
    await supply(token, amount);
  } else if (functionName === 'borrow') {
    const token = process.argv[3];
    const amount = Number(process.argv[4]);
    await borrow(token, amount);
  } else if (functionName === 'withdraw') {
    const token = process.argv[3];
    const amount = Number(process.argv[4]);
    await withdraw(token, amount);
  } else if (functionName === 'repay') {
    const token = process.argv[3];
    const amount = Number(process.argv[4]);
    await repay(token, amount);
  } else if (functionName === 'createIntent') {
    const amount = Number(process.argv[3]);
    const inputToken = process.argv[4];
    const outputToken = process.argv[5];
    await createIntent(amount, inputToken, outputToken);
  } else {
    console.log(
      'Usage: pnpm aleo <function> [args...]\n' +
        'Functions:\n' +
        '  deposit <token> <amount> <recipient> [native]  - Deposit tokens to hub\n' +
        '  withdrawAsset <token> <amount> <recipient>      - Withdraw tokens from hub\n' +
        '  supply <token> <amount>                          - Supply to lending pool\n' +
        '  borrow <token> <amount>                          - Borrow from lending pool\n' +
        '  withdraw <token> <amount>                        - Withdraw from lending pool\n' +
        '  repay <token> <amount>                           - Repay lending pool debt\n' +
        '  createIntent <amount> <inputToken> <outputToken> - Create swap intent',
    );
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
