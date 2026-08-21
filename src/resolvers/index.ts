import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSchema } from 'graphql-yoga';
import { folderResolvers } from './folder.resolvers';
import { bookmarkResolvers } from './bookmark.resolvers';
import { GraphQLContext } from '../context';

function loadTypeDefs(): string {
  const candidatePaths = [
    join(__dirname, '../schema/schema.graphql'),
    join(__dirname, '../../src/schema/schema.graphql'),
    join(process.cwd(), 'src/schema/schema.graphql'),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return readFileSync(candidatePath, 'utf-8');
    }
  }

  throw new Error('Unable to locate src/schema/schema.graphql');
}

export const typeDefs = loadTypeDefs();

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
