import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { getAddress } from 'ethers/lib/utils';
import { RoutingType } from '../lib/constants';

export const CHAIN_IN_ID = 1;
export const CHAIN_OUT_ID = 1;
export const OFFERER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const CHECKSUM_OFFERER = getAddress(OFFERER);
export const TOKEN_IN = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
export const TOKEN_OUT = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const AMOUNT_IN = '1000000000000000000';
export const FILLER = '0x0000000000000000000000000000000000000000';
export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const USDC_ADDRESS_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

export const DL_CONFIG = {
  routingType: RoutingType.DUTCH_LIMIT,
  offerer: OFFERER,
  exclusivityOverrideBps: 24,
  auctionPeriodSecs: 60,
};

export const CLASSIC_CONFIG = {
  routingType: RoutingType.CLASSIC,
  protocols: ['V2', 'V3', 'MIXED'],
};

export const PERMIT2 = {
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
      expiration: 2592000,
      nonce: '0',
    },
    spender: UNIVERSAL_ROUTER_ADDRESS(1),
    sigDeadline: 1800,
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
      expiration: 2592000,
      nonce: '0',
    },
    spender: UNIVERSAL_ROUTER_ADDRESS(137),
    sigDeadline: 1800,
  },
};

export const PERMIT_DETAILS = {
  amount: AMOUNT_IN,
  expiration: 2592000,
  nonce: 0,
  token: TOKEN_IN,
};

export const DL_PERMIT = {
  domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022d473030f116ddee9f6b43ac78ba3' },
  types: {
    PermitWitnessTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'witness', type: 'ExclusiveDutchLimitOrder' },
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    ExclusiveDutchLimitOrder: [
      { name: 'info', type: 'OrderInfo' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'exclusiveFiller', type: 'address' },
      { name: 'exclusivityOverrideBps', type: 'uint256' },
      { name: 'inputToken', type: 'address' },
      { name: 'inputStartAmount', type: 'uint256' },
      { name: 'inputEndAmount', type: 'uint256' },
      { name: 'outputs', type: 'DutchOutput[]' },
    ],
    OrderInfo: [
      { name: 'reactor', type: 'address' },
      { name: 'offerer', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'validationContract', type: 'address' },
      { name: 'validationData', type: 'bytes' },
    ],
    DutchOutput: [
      { name: 'token', type: 'address' },
      { name: 'startAmount', type: 'uint256' },
      { name: 'endAmount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
  },
  values: {
    permitted: { token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', amount: { type: 'BigNumber', hex: '0x01' } },
    spender: '0xbD7F9D0239f81C94b728d827a87b9864972661eC',
    nonce: { type: 'BigNumber', hex: '0x01' },
    deadline: 72,
    witness: {
      info: {
        reactor: '0xbD7F9D0239f81C94b728d827a87b9864972661eC',
        offerer: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        nonce: { type: 'BigNumber', hex: '0x01' },
        deadline: 72,
        validationContract: '0x0000000000000000000000000000000000000000',
        validationData: '0x',
      },
      startTime: 0,
      endTime: 60,
      exclusiveFiller: '0x0000000000000000000000000000000000000000',
      exclusivityOverrideBps: { type: 'BigNumber', hex: '0x0c' },
      inputToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      inputStartAmount: { type: 'BigNumber', hex: '0x01' },
      inputEndAmount: { type: 'BigNumber', hex: '0x01' },
      outputs: [
        {
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          startAmount: { type: 'BigNumber', hex: '0x2710' },
          endAmount: { type: 'BigNumber', hex: '0x26de' },
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
    reactor: '0xbD7F9D0239f81C94b728d827a87b9864972661eC',
    offerer: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    nonce: '1',
    deadline: 72,
    validationContract: '0x0000000000000000000000000000000000000000',
    validationData: '0x',
    startTime: 0,
    endTime: 60,
    exclusiveFiller: '0x0000000000000000000000000000000000000000',
    exclusivityOverrideBps: '12',
    input: {
      token: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      startAmount: '1',
      endAmount: '1',
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
    '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f984000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000200000000000000000000000000bd7f9d0239f81c94b728d827a87b9864972661ec000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000048000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000026de000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  quoteId: 'quoteId',
  requestId: 'requestId',
  auctionPeriodSecs: 60,
  slippageTolerance: '0.5',
};
