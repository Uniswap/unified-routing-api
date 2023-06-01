type Input = any;
type Output = any;
type Response = any;

export type FetcherTest = {
    testName: string
    only?: boolean
    input?: Input
    output: Output
    clientResponse?: Response
    reject?: boolean
    errorType?: any
}

export type UtilityTest = {
  testName: string
  only?: boolean
  input?: Input
  output: Output
  errorType?: any
}
