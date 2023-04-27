import { APIGatewayProxyResult } from 'aws-lambda';

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
        errorCode: 'VALIDATION_ERROR',
        detail: this.message,
        id,
      }),
    };
  }
}
