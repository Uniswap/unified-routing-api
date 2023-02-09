import { Protocol } from '@uniswap/router-sdk';
import Logger from 'bunyan';

import { TradeType } from '@uniswap/sdk-core';
import { parseEther } from 'ethers/lib/utils';
import { RequestTransformer } from '..';
import { QuoteRequest } from '../../../entities';
import { ClassicRequest } from '../../../entities/request/ClassicRequest';

export class RouteBackToEthTransformer implements RequestTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'RouteBackToEthTransformer' });
  }
  transform(requests: QuoteRequest[], gasPriceWei: string): QuoteRequest[] {
    const synthClassicRequest = new ClassicRequest(
      {
        ...requests[0].info,
        type: TradeType.EXACT_OUTPUT,
        tokenIn: requests[0].info.tokenOut,
        amount: parseEther('1'),
        tokenOut: 'ETH',
      },
      {
        protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
        gasPriceWei: gasPriceWei,
      }
    );
    this.log.info({ synthClassicRequest: synthClassicRequest });
    return [...requests, synthClassicRequest];
  }
}
