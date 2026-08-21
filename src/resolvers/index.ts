import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSchema } from 'graphql-yoga';
import { folderResolvers } from './folder.resolvers';
import { bookmarkResolvers } from './bookmark.resolvers';
import { GraphQLContext } from '../context';

export const typeDefs = readFileSync(
  join(__dirname, '../schema/schema.graphql'),
  'utf-8'
);

export const resolvers = {
  Query: {
    ...folderResolvers.Query,
    ...bookmarkResolvers.Query,
  },
  Mutation: {
    ...folderResolvers.Mutation,
    ...bookmarkResolvers.Mutation,
  },
  Folder: folderResolvers.Folder,
  Bookmark: bookmarkResolvers.Bookmark,
};

export function createGraphQLSchema() {
  return createSchema<GraphQLContext>({
    typeDefs,
    resolvers,
  });
}
