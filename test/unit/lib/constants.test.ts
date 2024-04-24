import { frontendEnablePortion } from '../../../lib/constants';

describe('constants Unit Tests', () => {
  const sendPortionFlagOptions = [true, false, undefined];

  sendPortionFlagOptions.forEach((sendPortionFlag) => {
    it(`URA enable portion when sePortionEnabled = ${sendPortionFlag}`, () => {
      expect(frontendEnablePortion(sendPortionFlag)).toStrictEqual(sendPortionFlag);
    });
  });
});
