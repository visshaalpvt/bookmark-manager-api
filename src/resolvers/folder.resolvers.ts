import { Folder, Bookmark } from '@prisma/client';
import { GraphQLContext } from '../context';
import { validateInput, createFolderInputSchema } from '../validation/schemas';

export const folderResolvers = {
  Query: {
    folders: async (_parent: unknown, _args: unknown, ctx: GraphQLContext): Promise<Folder[]> => {
      return ctx.prisma.folder.findMany({
        orderBy: { createdAt: 'desc' },
      });
    },
    folder: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ): Promise<Folder | null> => {
      if (!args.id || typeof args.id !== 'string') {
        return null;
      }
      return ctx.prisma.folder.findUnique({
        where: { id: args.id },
      });
    },
  },
  Mutation: {
    createFolder: async (
      _parent: unknown,
      args: { name: string },
      ctx: GraphQLContext
    ): Promise<Folder> => {
      const validated = validateInput(createFolderInputSchema, args);
      return ctx.prisma.folder.create({
        data: {
          name: validated.name,
        },
      });
    },
  },
  Folder: {
    createdAt: (parent: Folder): string => {
      return parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : new Date(parent.createdAt).toISOString();
    },
    bookmarks: async (parent: Folder, _args: unknown, ctx: GraphQLContext): Promise<Bookmark[]> => {
      return ctx.prisma.bookmark.findMany({
        where: { folderId: parent.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    },
  },
};
