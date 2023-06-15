import { APIGatewayProxyResult } from 'aws-lambda';

export enum ERROR_CODE {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  toJSON(id?: string): APIGatewayProxyResult {
    return {
      statusCode: 400,
      body: JSON.stringify({
        errorCode: ERROR_CODE.VALIDATION_ERROR,
        detail: this.message,
        id,
      }),
    };
  }
}
