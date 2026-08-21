import { createYoga } from 'graphql-yoga';
import { createGraphQLSchema } from './resolvers';
import { createContext, GraphQLContext } from './context';
import { maskOrFormatError } from './errors/errors';

export function createYogaServer(customContext?: Partial<GraphQLContext>) {
  const schema = createGraphQLSchema();

  return createYoga<GraphQLContext>({
    schema,
    context: () => {
      const defaultContext = createContext();
      return {
        ...defaultContext,
        ...customContext,
      };
    },
    graphiql: {
      title: 'Bookmark Manager GraphQL API Explorer',
    },
    maskedErrors: {
      maskError: (error) => maskOrFormatError(error),
    },
    logging: process.env.NODE_ENV !== 'test',
  });
}
