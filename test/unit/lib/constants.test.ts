import { frontendAndUraEnablePortion, frontendEnablePortion, uraEnablePortion } from '../../../lib/constants';

describe('constants Unit Tests', () => {
  const enablePortionFlagOptions = ['true', 'false', undefined, 'garbage'];

  enablePortionFlagOptions.forEach((enablePortionFlagOption) => {
    it(`URA enable portion when process.env.ENABLE_PORTION = ${enablePortionFlagOption}`, () => {
      process.env.ENABLE_PORTION = enablePortionFlagOption;

      switch (enablePortionFlagOption) {
        case 'true':
          expect(uraEnablePortion()).toBeTruthy();
          break;
        case 'false':
          expect(uraEnablePortion()).toBeFalsy();
          break;
        default:
          expect(uraEnablePortion()).toBeFalsy();
          break;
      }
    });
  });

  const sendPortionFlagOptions = [true, false, undefined];

  sendPortionFlagOptions.forEach((sendPortionFlag) => {
    it(`URA enable portion when process.env.ENABLE_PORTION = ${sendPortionFlag}`, () => {
      expect(frontendEnablePortion(sendPortionFlag)).toStrictEqual(sendPortionFlag);
    });
  });

  enablePortionFlagOptions.forEach((enablePortionFlagOption) => {
    sendPortionFlagOptions.forEach((sendPortionFlag) => {
      it(`URA enable portion when process.env.ENABLE_PORTION = ${enablePortionFlagOption} and sendPortionFlag = ${sendPortionFlag}`, () => {
        process.env.ENABLE_PORTION = enablePortionFlagOption;

        expect(frontendAndUraEnablePortion(sendPortionFlag)).toStrictEqual(
          sendPortionFlag && enablePortionFlagOption === 'true'
        );
      });
    });
  });
});
