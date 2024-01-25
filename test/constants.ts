import { ChainId, Currency, Ether, WETH9 } from '@uniswap/sdk-core';
import { DAI_MAINNET, USDC_MAINNET, WBTC_MAINNET } from '@uniswap/smart-order-router';
import { REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import { BPS, RoutingType } from '../lib/constants';
import { Portion, PortionType } from '../lib/fetchers/PortionFetcher';
import { agEUR_MAINNET, DAI_ON, USDC_ON, USDT_ON, XSGD_MAINNET } from './utils/tokens';
import { RelayConfig } from '../lib/entities/request/RelayRequest';

export const CHAIN_IN_ID = 1;
export const CHAIN_OUT_ID = 1;
export const SWAPPER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const CHECKSUM_SWAPPER = getAddress(SWAPPER);
export const ETH_IN = '0x0000000000000000000000000000000000000000';
export const TOKEN_IN = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
export const TOKEN_OUT = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const AMOUNT = '1000000000000000000';
export const AMOUNT_GAS_ADJUSTED = '900000000000000000';
export const AMOUNT_UNDER_GAS_THRESHOLD = '400000000000000000';
export const AMOUNT_BETTER = '2000000000000000000';
export const AMOUNT_LARGE = '10000000000000000000000';
export const AMOUNT_LARGE_GAS_ADJUSTED = '9000000000000000000000';
export const FILLER = '0x0000000000000000000000000000000000000000';
export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const USDC_ADDRESS_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
export const INELIGIBLE_TOKEN = '0x72e4f9f808c49a2a61de9c5896298920dc4eeea9';

export const PORTION_BIPS = 12;
export const PORTION_RECIPIENT = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

export const FLAT_PORTION: Portion = {
  bips: PORTION_BIPS,
  recipient: PORTION_RECIPIENT,
  type: PortionType.Flat,
};

export const DL_CONFIG = {
  routingType: RoutingType.DUTCH_LIMIT,
  swapper: SWAPPER,
  exclusivityOverrideBps: 24,
  auctionPeriodSecs: 60,
};

export const CLASSIC_CONFIG = {
  routingType: RoutingType.CLASSIC,
  protocols: ['V2', 'V3', 'MIXED'],
};

export const RELAY_CONFIG: RelayConfig = {
  swapper: SWAPPER,
  auctionPeriodSecs: 60,
  gasToken: TOKEN_IN
}

export const PERMIT2_USED = {
  domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
  types: {
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  values: {
    details: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      amount: '1461501637330902918203684832716283019655932542975',
      expiration: '2592000',
      nonce: '1',
    },
    spender: UNIVERSAL_ROUTER_ADDRESS(1),
    sigDeadline: '1800',
  },
};

export const PERMIT2 = {
  ...PERMIT2_USED,
  values: {
    ...PERMIT2_USED.values,
    details: {
      ...PERMIT2_USED.values.details,
      nonce: '0',
    },
  },
};

export const PERMIT2_POLYGON = {
  domain: { name: 'Permit2', chainId: 137, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
  types: {
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  values: {
    details: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      amount: '1461501637330902918203684832716283019655932542975',
      expiration: '2592000',
      nonce: '0',
    },
    spender: UNIVERSAL_ROUTER_ADDRESS(137),
    sigDeadline: '1800',
  },
};

export const PERMIT_DETAILS = {
  amount: AMOUNT,
  expiration: '2592000',
  nonce: '1',
  token: TOKEN_IN,
};

export const DL_PERMIT_RFQ = {
  domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022d473030f116ddee9f6b43ac78ba3' },
  types: {
    PermitWitnessTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'witness', type: 'ExclusiveDutchOrder' },
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    ExclusiveDutchOrder: [
      { name: 'info', type: 'OrderInfo' },
      { name: 'decayStartTime', type: 'uint256' },
      { name: 'decayEndTime', type: 'uint256' },
      { name: 'exclusiveFiller', type: 'address' },
      { name: 'exclusivityOverrideBps', type: 'uint256' },
      { name: 'inputToken', type: 'address' },
      { name: 'inputStartAmount', type: 'uint256' },
      { name: 'inputEndAmount', type: 'uint256' },
      { name: 'outputs', type: 'DutchOutput[]' },
    ],
    OrderInfo: [
      { name: 'reactor', type: 'address' },
      { name: 'swapper', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'additionalValidationContract', type: 'address' },
      { name: 'additionalValidationData', type: 'bytes' },
    ],
    DutchOutput: [
      { name: 'token', type: 'address' },
      { name: 'startAmount', type: 'uint256' },
      { name: 'endAmount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
  },
  values: {
    permitted: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      amount: { type: 'BigNumber', hex: '0x0de0b6b3a7640000' },
    },
    spender: '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4',
    nonce: { type: 'BigNumber', hex: '0x01' },
    deadline: 72,
    witness: {
      info: {
        reactor: '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4',
        swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        nonce: { type: 'BigNumber', hex: '0x01' },
        deadline: 72,
        additionalValidationContract: '0x0000000000000000000000000000000000000000',
        additionalValidationData: '0x',
      },
      decayStartTime: 0,
      decayEndTime: 60,
      exclusiveFiller: '0x1111111111111111111111111111111111111111',
      exclusivityOverrideBps: { type: 'BigNumber', hex: '0x0c' },
      inputToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      inputStartAmount: { type: 'BigNumber', hex: '0x0de0b6b3a7640000' },
      inputEndAmount: { type: 'BigNumber', hex: '0x0de0b6b3a7640000' },
      outputs: [
        {
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          startAmount: { type: 'BigNumber', hex: '0x021e19e0c9bab2400000' },
          endAmount: { type: 'BigNumber', hex: '0x021b63fd1aa400b80000' },
          recipient: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
      ],
    },
  },
};

export const DL_PERMIT = {
  domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022d473030f116ddee9f6b43ac78ba3' },
  types: {
    PermitWitnessTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'witness', type: 'ExclusiveDutchOrder' },
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    ExclusiveDutchOrder: [
      { name: 'info', type: 'OrderInfo' },
      { name: 'decayStartTime', type: 'uint256' },
      { name: 'decayEndTime', type: 'uint256' },
      { name: 'exclusiveFiller', type: 'address' },
      { name: 'exclusivityOverrideBps', type: 'uint256' },
      { name: 'inputToken', type: 'address' },
      { name: 'inputStartAmount', type: 'uint256' },
      { name: 'inputEndAmount', type: 'uint256' },
      { name: 'outputs', type: 'DutchOutput[]' },
    ],
    OrderInfo: [
      { name: 'reactor', type: 'address' },
      { name: 'swapper', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'additionalValidationContract', type: 'address' },
      { name: 'additionalValidationData', type: 'bytes' },
    ],
    DutchOutput: [
      { name: 'token', type: 'address' },
      { name: 'startAmount', type: 'uint256' },
      { name: 'endAmount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
  },
  values: {
    permitted: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      amount: { type: 'BigNumber', hex: '0x0de0b6b3a7640000' },
    },
    spender: '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4',
    nonce: { type: 'BigNumber', hex: '0x01' },
    deadline: 72,
    witness: {
      info: {
        reactor: '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4',
        swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        nonce: { type: 'BigNumber', hex: '0x01' },
        deadline: 72,
        additionalValidationContract: '0x0000000000000000000000000000000000000000',
        additionalValidationData: '0x',
      },
      decayStartTime: 0,
      decayEndTime: 60,
      exclusiveFiller: '0x0000000000000000000000000000000000000000',
      exclusivityOverrideBps: { type: 'BigNumber', hex: '0x0c' },
      inputToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      inputStartAmount: { type: 'BigNumber', hex: '0x0de0b6b3a7640000' },
      inputEndAmount: { type: 'BigNumber', hex: '0x0de0b6b3a7640000' },
      outputs: [
        {
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          startAmount: { type: 'BigNumber', hex: '0x021e19e0c9bab2400000' },
          endAmount: { type: 'BigNumber', hex: '0x021b63fd1aa400b80000' },
          recipient: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
      ],
    },
  },
};

export const DUTCH_LIMIT_ORDER_JSON = {
  orderInfo: {
    chainId: 1,
    permit2Address: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    reactor: '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4',
    swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    nonce: '1',
    deadline: 72,
    additionalValidationContract: '0x0000000000000000000000000000000000000000',
    additionalValidationData: '0x',
    decayStartTime: 0,
    decayEndTime: 60,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    exclusivityOverrideBps: '12',
    input: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      startAmount: AMOUNT,
      endAmount: AMOUNT,
    },
    outputs: [
      {
        token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        startAmount: '10000',
        endAmount: '9950',
        recipient: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      },
    ],
  },
  encodedOrder:
    '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f9840000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000006000da47483062a0d734ba3dc7576ce6a0b645c4000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000048000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000026de000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  quoteId: 'quoteId',
  requestId: 'requestId',
  startTimeBufferSecs: 45,
  auctionPeriodSecs: 60,
  slippageTolerance: '0.5',
  orderHash: '0x8859113385dac928f6e064e6d49539fd94cab32687e1a37592ef6f3192948513',
};

export const DUTCH_LIMIT_ORDER_JSON_WITH_PORTION = {
  orderInfo: {
    chainId: 1,
    permit2Address: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    reactor: '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4',
    swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    nonce: '1',
    deadline: 72,
    additionalValidationContract: '0x0000000000000000000000000000000000000000',
    additionalValidationData: '0x',
    decayStartTime: 0,
    decayEndTime: 60,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    exclusivityOverrideBps: '12',
    input: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      startAmount: AMOUNT,
      endAmount: AMOUNT,
    },
    outputs: [
      {
        token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        startAmount: BigNumber.from('10000')
          .sub(BigNumber.from('10000').mul(PORTION_BIPS).div(BPS).toString())
          .toString(),
        endAmount: BigNumber.from('9950').sub(BigNumber.from('9950').mul(PORTION_BIPS).div(BPS).toString()).toString(),
        recipient: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      },
      {
        token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        startAmount: BigNumber.from('10000').mul(PORTION_BIPS).div(BPS).toString(),
        endAmount: BigNumber.from('9950').mul(PORTION_BIPS).div(BPS).toString(),
        recipient: PORTION_RECIPIENT,
      },
    ],
  },
  encodedOrder:
    '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f9840000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000006000da47483062a0d734ba3dc7576ce6a0b645c4000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000048000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000270400000000000000000000000000000000000000000000000000000000000026d3000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000b000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',
  quoteId: 'quoteId',
  requestId: 'requestId',
  startTimeBufferSecs: 45,
  auctionPeriodSecs: 60,
  slippageTolerance: '0.5',
  orderHash: '0xc5230345d78a3758d321d54bf5b710778de69cc8004f4623d7316400a70956dd',
};

export const RELAY_PERMIT = {
  domain: {
    name: 'Permit2',
    chainId: 1,
    verifyingContract: '0x000000000022d473030f116ddee9f6b43ac78ba3',
  },
  types: {
    PermitBatchWitnessTransferFrom: [
      {
        name: 'permitted',
        type: 'TokenPermissions[]',
      },
      {
        name: 'spender',
        type: 'address',
      },
      {
        name: 'nonce',
        type: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint256',
      },
      {
        name: 'witness',
        type: 'RelayOrder',
      },
    ],
    TokenPermissions: [
      {
        name: 'token',
        type: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
      },
    ],
    RelayOrder: [
      {
        name: 'reactor',
        type: 'address',
      },
      {
        name: 'swapper',
        type: 'address',
      },
      {
        name: 'startAmounts',
        type: 'uint256[]',
      },
      {
        name: 'recipients',
        type: 'address[]',
      },
      {
        name: 'decayStartTime',
        type: 'uint256',
      },
      {
        name: 'decayEndTime',
        type: 'uint256',
      },
      {
        name: 'actions',
        type: 'bytes[]',
      },
    ],
  },
  values: {
    permitted: [
      {
        token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        amount: {
          type: 'BigNumber',
          hex: '0x0de0b6b3a7640000',
        },
      },
      {
        token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        amount: {
          type: 'BigNumber',
          hex: '0x0de0b6b3a7640000',
        },
      },
    ],
    spender: REACTOR_ADDRESS_MAPPING[ChainId.MAINNET]['Relay'],
    nonce: {
      type: 'BigNumber',
      hex: '0x01',
    },
    deadline: 72,
    witness: {
      reactor: REACTOR_ADDRESS_MAPPING[ChainId.MAINNET]['Relay'],
      swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decayStartTime: 0,
      decayEndTime: 60,
      startAmounts: [
        {
          type: 'BigNumber',
          hex: '0x0de0b6b3a7640000',
        },
        {
          type: 'BigNumber',
          hex: '0x0de0b6b3a7640000',
        },
      ],
      recipients: ['0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', '0x0000000000000000000000000000000000000000'],
      actions: [],
    },
  },
};

export const GREENLIST_TOKEN_PAIRS: Array<[Currency, Currency]> = [
  [Ether.onChain(ChainId.MAINNET), USDC_ON(ChainId.MAINNET)],
  [WETH9[ChainId.MAINNET], USDT_ON(ChainId.MAINNET)],
  [DAI_ON(ChainId.MAINNET), WBTC_MAINNET],
  [agEUR_MAINNET, XSGD_MAINNET], // good pair that simultaneously test two use cases: 1) stable-to-stable which is not in carve-out 2) newly published tokens in the default token list
];

export const GREENLIST_STABLE_TO_STABLE_PAIRS: Array<[Currency, Currency]> = [[USDC_MAINNET, DAI_MAINNET]];
