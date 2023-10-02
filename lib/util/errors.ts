import { APIGatewayProxyResult } from 'aws-lambda';

export enum ErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  InternalError = 'INTERNAL_ERROR',
  QuoteError = 'QUOTE_ERROR',
  UnknownTradeTypeERROR = 'UNKNOWN_TRADE_TYPE_ERROR',
}

export abstract class CustomError extends Error {
  abstract toJSON(id?: string): APIGatewayProxyResult;
}

export class UnknownTradeTypeError extends CustomError {
  constructor(message: string) {
    super(message);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, UnknownTradeTypeError.prototype);
  }

  toJSON(id?: string): APIGatewayProxyResult {
    return {
      statusCode: 400,
      body: JSON.stringify({
        errorCode: ErrorCode.UnknownTradeTypeERROR,
        detail: this.message,
        id,
      }),
    };
  }
}

export class ValidationError extends CustomError {
  constructor(message: string) {
    super(message);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  toJSON(id?: string): APIGatewayProxyResult {
    return {
      statusCode: 400,
      body: JSON.stringify({
        errorCode: ErrorCode.ValidationError,
        detail: this.message,
        id,
      }),
    };
  }
}

export class NoQuotesAvailable extends CustomError {
  private static MESSAGE = 'No quotes available';

  constructor() {
    super(NoQuotesAvailable.MESSAGE);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NoQuotesAvailable.prototype);
  }

  toJSON(id?: string): APIGatewayProxyResult {
    return {
      statusCode: 404,
      body: JSON.stringify({
        errorCode: ErrorCode.QuoteError,
        detail: this.message,
        id,
      }),
    };
  }
}

export class QuoteFetchError extends CustomError {
  constructor(message: string) {
    super(message);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, QuoteFetchError.prototype);
  }

  toJSON(id?: string): APIGatewayProxyResult {
    return {
      statusCode: 500,
      body: JSON.stringify({
        errorCode: ErrorCode.QuoteError,
        detail: this.message,
        id,
      }),
    };
  }
}
