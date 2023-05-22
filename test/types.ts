export type FetcherTest = {
    testName: string
    only?: boolean
    input?: Input
    output: Output
    clientResponse?: Response
    reject?: boolean
    errorType?: any
  }