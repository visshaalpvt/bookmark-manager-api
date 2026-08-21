import { GraphQLError } from 'graphql';

export enum ErrorCode {
  BAD_USER_INPUT = 'BAD_USER_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export class UserInputError extends GraphQLError {
  constructor(message: string, invalidArgs?: Record<string, unknown>) {
    super(message, {
      extensions: {
        code: ErrorCode.BAD_USER_INPUT,
        ...(invalidArgs ? { invalidArgs } : {}),
      },
    });
    Object.setPrototypeOf(this, UserInputError.prototype);
  }
}

export class NotFoundError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: ErrorCode.NOT_FOUND,
      },
    });
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class InternalError extends GraphQLError {
  constructor(message = 'An unexpected internal error occurred') {
    super(message, {
      extensions: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
      },
    });
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

export function maskOrFormatError(error: unknown): GraphQLError {
  if (error instanceof GraphQLError) {
    // Retain explicit GraphQLErrors (UserInputError, NotFoundError, etc.)
    return error;
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return new GraphQLError(message, {
    extensions: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
    },
  });
}
