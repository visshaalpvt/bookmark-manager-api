import { Bookmark, Folder } from '@prisma/client';
import { GraphQLContext } from '../context';
import { NotFoundError } from '../errors/errors';
import {
  validateInput,
  createBookmarkInputSchema,
  updateBookmarkInputSchema,
  moveBookmarkInputSchema,
  paginationInputSchema,
} from '../validation/schemas';
import {
  buildBookmarkWhere,
  encodeCursor,
} from '../utils/pagination';

export interface BookmarkEdge {
  node: Bookmark;
  cursor: string;
}

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface BookmarkConnection {
  edges: BookmarkEdge[];
  pageInfo: PageInfo;
}

export const bookmarkResolvers = {
  Query: {
    bookmarks: async (
      _parent: unknown,
      args: {
        folderId?: string;
        search?: string;
        take?: number;
        cursor?: string;
      },
      ctx: GraphQLContext
    ): Promise<BookmarkConnection> => {
      const validated = validateInput(paginationInputSchema, args);
      const where = buildBookmarkWhere(
        validated.folderId,
        validated.search,
        validated.cursor
      );

      const limit = validated.take ?? 20;

      // Fetch take + 1 to determine if there is a next page
      const items = await ctx.prisma.bookmark.findMany({
        where,
        take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const hasNextPage = items.length > limit;
      const pageItems = hasNextPage ? items.slice(0, limit) : items;

      const edges: BookmarkEdge[] = pageItems.map((item) => ({
        node: item,
        cursor: encodeCursor(item.createdAt, item.id),
      }));

      const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

      return {
        edges,
        pageInfo: {
          endCursor,
          hasNextPage,
        },
      };
    },
  },
  Mutation: {
    createBookmark: async (
      _parent: unknown,
      args: {
        title: string;
        url: string;
        tags?: string[];
        folderId: string;
      },
      ctx: GraphQLContext
    ): Promise<Bookmark> => {
      const validated = validateInput(createBookmarkInputSchema, args);

      // Verify that the specified folderId exists
      const folder = await ctx.prisma.folder.findUnique({
        where: { id: validated.folderId },
      });

      if (!folder) {
        throw new NotFoundError(
          `Folder with ID '${validated.folderId}' not found`
        );
      }

      return ctx.prisma.bookmark.create({
        data: {
          title: validated.title,
          url: validated.url,
          tags: validated.tags ?? [],
          folderId: validated.folderId,
        },
      });
    },

    updateBookmark: async (
      _parent: unknown,
      args: {
        id: string;
        title?: string;
        url?: string;
        tags?: string[];
      },
      ctx: GraphQLContext
    ): Promise<Bookmark> => {
      const validated = validateInput(updateBookmarkInputSchema, args);

      const existing = await ctx.prisma.bookmark.findUnique({
        where: { id: validated.id },
      });

      if (!existing) {
        throw new NotFoundError(
          `Bookmark with ID '${validated.id}' not found`
        );
      }

      return ctx.prisma.bookmark.update({
        where: { id: validated.id },
        data: {
          ...(validated.title !== undefined ? { title: validated.title } : {}),
          ...(validated.url !== undefined ? { url: validated.url } : {}),
          ...(validated.tags !== undefined ? { tags: validated.tags } : {}),
        },
      });
    },

    deleteBookmark: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ): Promise<boolean> => {
      if (!args.id || typeof args.id !== 'string') {
        throw new NotFoundError('Bookmark ID must be provided');
      }

      const existing = await ctx.prisma.bookmark.findUnique({
        where: { id: args.id },
      });

      if (!existing) {
        throw new NotFoundError(`Bookmark with ID '${args.id}' not found`);
      }

      await ctx.prisma.bookmark.delete({
        where: { id: args.id },
      });

      return true;
    },

    moveBookmark: async (
      _parent: unknown,
      args: { id: string; folderId: string },
      ctx: GraphQLContext
    ): Promise<Bookmark> => {
      const validated = validateInput(moveBookmarkInputSchema, args);

      const bookmark = await ctx.prisma.bookmark.findUnique({
        where: { id: validated.id },
      });

      if (!bookmark) {
        throw new NotFoundError(
          `Bookmark with ID '${validated.id}' not found`
        );
      }

      const targetFolder = await ctx.prisma.folder.findUnique({
        where: { id: validated.folderId },
      });

      if (!targetFolder) {
        throw new NotFoundError(
          `Target folder with ID '${validated.folderId}' not found`
        );
      }

      return ctx.prisma.bookmark.update({
        where: { id: validated.id },
        data: {
          folderId: validated.folderId,
        },
      });
    },
  },
  Bookmark: {
    createdAt: (parent: Bookmark): string => {
      return parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : new Date(parent.createdAt).toISOString();
    },
    folder: async (
      parent: Bookmark,
      _args: unknown,
      ctx: GraphQLContext
    ): Promise<Folder> => {
      const folder = await ctx.prisma.folder.findUnique({
        where: { id: parent.folderId },
      });

      if (!folder) {
        throw new NotFoundError(
          `Folder with ID '${parent.folderId}' not found for bookmark '${parent.id}'`
        );
      }

      return folder;
    },
  },
};
