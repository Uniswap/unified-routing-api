import { ChainId, Currency, Ether, WETH9 } from '@uniswap/sdk-core';
import { DAI_MAINNET, USDC_MAINNET, WBTC_MAINNET } from '@uniswap/smart-order-router';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import { BPS, RoutingType } from '../lib/constants';
import { RelayConfig } from '../lib/entities/request/RelayRequest';
import { Portion, PortionType } from '../lib/fetchers/PortionFetcher';
import { agEUR_MAINNET, DAI_ON, USDC_ON, USDT_ON, XSGD_MAINNET } from './utils/tokens';

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

export const DUTCH_V2_CONFIG = {
  routingType: RoutingType.DUTCH_V2,
  swapper: SWAPPER,
  deadlineBufferSecs: 24,
};

export const CLASSIC_CONFIG = {
  routingType: RoutingType.CLASSIC,
  protocols: ['V2', 'V3', 'MIXED'],
};

export const RELAY_CONFIG: RelayConfig = {
  swapper: SWAPPER,
  auctionPeriodSecs: 60,
  gasToken: TOKEN_IN,
};

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

export const RELAY_ORDER_JSON = {
  orderInfo: {
    chainId: 1,
    permit2Address: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    reactor: '0x0000000000000000000000000000000000000000',
    swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    nonce: '65277495437622379544597053445039140184959683828055940449931827006038205742848',
    deadline: 1710789023,
    universalRouterCalldata: '0x',
    input: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      amount: '1000000000000000000',
      recipient: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    },
    fee: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      startAmount: '1000000000000000000',
      endAmount: '1000000000000087500',
      startTime: 1710788951,
      endTime: 1710789011,
    },
  },
  encodedOrder:
    '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee9051c0cbc978303b73d6283285f0dc56cacda690661f99bcdc72d8e769a73f000000000000000000000000000000000000000000000000000000000065f8919f0000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f9840000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000003fc91a3afd70395cd496c647d5a6cc9d4b2b7fad0000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f9840000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a76555cc0000000000000000000000000000000000000000000000000000000065f891570000000000000000000000000000000000000000000000000000000065f8919300000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000000',
  quoteId: '85bf86b5-15e2-4fc1-b8af-8a6606d44fc7',
  requestId: 'requestId',
  orderHash: '0xb5a5ec19607037bd17eebc87322e389a8ef636b0d62e0470c83b751cfb8e2082',
  startTimeBufferSecs: 45,
  auctionPeriodSecs: 60,
  deadlineBufferSecs: 12,
  slippageTolerance: '0.5',
  permitData: {
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
          name: 'info',
          type: 'RelayOrderInfo',
        },
        {
          name: 'input',
          type: 'Input',
        },
        {
          name: 'fee',
          type: 'FeeEscalator',
        },
        {
          name: 'universalRouterCalldata',
          type: 'bytes',
        },
      ],
      RelayOrderInfo: [
        {
          name: 'reactor',
          type: 'address',
        },
        {
          name: 'swapper',
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
      ],
      Input: [
        {
          name: 'token',
          type: 'address',
        },
        {
          name: 'amount',
          type: 'uint256',
        },
        {
          name: 'recipient',
          type: 'address',
        },
      ],
      FeeEscalator: [
        {
          name: 'token',
          type: 'address',
        },
        {
          name: 'startAmount',
          type: 'uint256',
        },
        {
          name: 'endAmount',
          type: 'uint256',
        },
        {
          name: 'startTime',
          type: 'uint256',
        },
        {
          name: 'endTime',
          type: 'uint256',
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
            hex: '0x0de0b6b3a76555cc',
          },
        },
      ],
      spender: '0x0000000000000000000000000000000000000000',
      nonce: {
        type: 'BigNumber',
        hex: '0x9051c0cbc978303b73d6283285f0dc56cacda690661f99bcdc72d8e769a73f00',
      },
      deadline: 1710789023,
      witness: {
        info: {
          reactor: '0x0000000000000000000000000000000000000000',
          swapper: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          nonce: {
            type: 'BigNumber',
            hex: '0x9051c0cbc978303b73d6283285f0dc56cacda690661f99bcdc72d8e769a73f00',
          },
          deadline: 1710789023,
        },
        input: {
          token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          amount: {
            type: 'BigNumber',
            hex: '0x0de0b6b3a7640000',
          },
          recipient: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
        },
        fee: {
          token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startAmount: {
            type: 'BigNumber',
            hex: '0x0de0b6b3a7640000',
          },
          endAmount: {
            type: 'BigNumber',
            hex: '0x0de0b6b3a76555cc',
          },
          startTime: 1710788951,
          endTime: 1710789011,
        },
        universalRouterCalldata: '0x',
      },
    },
  },
  classicQuoteData: {
    requestId: 'requestId',
    quoteId: 'fb410404-d6d8-4a92-833a-9e829cf9dce3',
    amount: '1000000000000000000',
    amountDecimals: '18',
    quote: '1000000000000000000',
    quoteDecimals: '18',
    quoteGasAdjusted: '1000000000000000000',
    quoteGasAdjustedDecimals: '18',
    gasUseEstimate: '100',
    gasUseEstimateQuote: '100',
    gasUseEstimateQuoteDecimals: '18',
    gasUseEstimateUSD: '100',
    simulationStatus: 'start',
    gasPriceWei: '10000',
    blockNumber: '1234',
    route: [],
    routeString: 'USD-ETH',
    permitNonce: '1',
    tradeType: 'EXACT_INPUT',
    slippage: 0.5,
    portionBips: 0,
    portionRecipient: '0x0000000000000000000000000000000000000000',
    gasUseEstimateGasToken: '1000000000000000000',
    gasUseEstimateGasTokenDecimals: '18',
    permitData: {
      domain: {
        name: 'Permit2',
        chainId: 1,
        verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      },
      types: {
        PermitSingle: [
          {
            name: 'details',
            type: 'PermitDetails',
          },
          {
            name: 'spender',
            type: 'address',
          },
          {
            name: 'sigDeadline',
            type: 'uint256',
          },
        ],
        PermitDetails: [
          {
            name: 'token',
            type: 'address',
          },
          {
            name: 'amount',
            type: 'uint160',
          },
          {
            name: 'expiration',
            type: 'uint48',
          },
          {
            name: 'nonce',
            type: 'uint48',
          },
        ],
      },
      values: {
        details: {
          token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          amount: '1461501637330902918203684832716283019655932542975',
          expiration: '1713380951',
          nonce: '0',
        },
        spender: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
        sigDeadline: '1710790751',
      },
    },
  },
};

export const GREENLIST_TOKEN_PAIRS: Array<[Currency, Currency]> = [
  [Ether.onChain(ChainId.MAINNET), USDC_ON(ChainId.MAINNET)],
  [WETH9[ChainId.MAINNET], USDT_ON(ChainId.MAINNET)],
  [DAI_ON(ChainId.MAINNET), WBTC_MAINNET],
  [agEUR_MAINNET, XSGD_MAINNET], // good pair that simultaneously test two use cases: 1) stable-to-stable which is not in carve-out 2) newly published tokens in the default token list
];

// reasonably sized token amounts for integ tests
export function getTestAmount(currency: Currency): string {
  switch (currency) {
    case agEUR_MAINNET:
      return '1000';
    case XSGD_MAINNET:
      return '1000';
    case DAI_ON(ChainId.MAINNET):
      return '5000';
    case WBTC_MAINNET:
      return '1';
    default:
      return '10';
  }
}

export const GREENLIST_STABLE_TO_STABLE_PAIRS: Array<[Currency, Currency]> = [[USDC_MAINNET, DAI_MAINNET]];
