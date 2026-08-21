import { describe, it, expect, mock } from 'bun:test';
import { folderResolvers } from '../../src/resolvers/folder.resolvers';
import { bookmarkResolvers } from '../../src/resolvers/bookmark.resolvers';
import { GraphQLContext } from '../../src/context';
import { NotFoundError, UserInputError, ErrorCode } from '../../src/errors/errors';
import { PrismaClient, Folder, Bookmark } from '@prisma/client';
import { encodeCursor } from '../../src/utils/pagination';

describe('Resolvers (Unit)', () => {
  const mockFolder: Folder = {
    id: 'folder-1',
    name: 'Development',
    createdAt: new Date('2026-08-21T09:00:00.000Z'),
  };

  const mockBookmark: Bookmark = {
    id: 'bookmark-1',
    title: 'GraphQL Yoga Docs',
    url: 'https://the-guild.dev/graphql/yoga-server',
    tags: ['graphql', 'yoga'],
    folderId: 'folder-1',
    createdAt: new Date('2026-08-21T09:30:00.000Z'),
  };

  describe('Folder Resolvers', () => {
    it('Query.folders should return a list of folders', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            findMany: mock(async () => [mockFolder]),
          },
        },
      } as unknown as GraphQLContext;

      const result = await folderResolvers.Query.folders({}, {}, mockCtx);
      expect(result).toEqual([mockFolder]);
      expect(mockCtx.prisma.folder.findMany).toHaveBeenCalled();
    });

    it('Query.folder should return a single folder when found', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            findUnique: mock(async () => mockFolder),
          },
        },
      } as unknown as GraphQLContext;

      const result = await folderResolvers.Query.folder({}, { id: 'folder-1' }, mockCtx);
      expect(result).toEqual(mockFolder);
    });

    it('Query.folder should return null when folder not found', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            findUnique: mock(async () => null),
          },
        },
      } as unknown as GraphQLContext;

      const result = await folderResolvers.Query.folder({}, { id: 'non-existent' }, mockCtx);
      expect(result).toBeNull();
    });

    it('Mutation.createFolder should validate input and create folder', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            create: mock(async ({ data }: { data: { name: string } }) => ({
              ...mockFolder,
              name: data.name,
            })),
          },
        },
      } as unknown as GraphQLContext;

      const result = await folderResolvers.Mutation.createFolder(
        {},
        { name: 'New Folder' },
        mockCtx
      );
      expect(result.name).toBe('New Folder');
    });

    it('Mutation.createFolder should reject empty name with BAD_USER_INPUT', async () => {
      const mockCtx = {} as GraphQLContext;
      try {
        await folderResolvers.Mutation.createFolder({}, { name: '   ' }, mockCtx);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UserInputError);
        expect((err as UserInputError).extensions.code).toBe(ErrorCode.BAD_USER_INPUT);
      }
    });

    it('Folder.bookmarks field resolver should fetch nested bookmarks', async () => {
      const mockCtx = {
        prisma: {
          bookmark: {
            findMany: mock(async () => [mockBookmark]),
          },
        },
      } as unknown as GraphQLContext;

      const result = await folderResolvers.Folder.bookmarks(mockFolder, {}, mockCtx);
      expect(result).toEqual([mockBookmark]);
    });
  });

  describe('Bookmark Resolvers', () => {
    it('Query.bookmarks should return paginated edges and pageInfo', async () => {
      const mockCtx = {
        prisma: {
          bookmark: {
            findMany: mock(async () => [mockBookmark]),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Query.bookmarks(
        {},
        { take: 10 },
        mockCtx
      );

      expect(result.edges.length).toBe(1);
      expect(result.edges[0]?.node).toEqual(mockBookmark);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toBeDefined();
    });

    it('Query.bookmarks should indicate hasNextPage when more records exist', async () => {
      const bm2: Bookmark = {
        ...mockBookmark,
        id: 'bm-2',
        createdAt: new Date('2026-08-21T09:29:00.000Z'),
      };
      const bm3: Bookmark = {
        ...mockBookmark,
        id: 'bm-3',
        createdAt: new Date('2026-08-21T09:28:00.000Z'),
      };

      // When take=2, return 3 records (take + 1)
      const mockCtx = {
        prisma: {
          bookmark: {
            findMany: mock(async () => [mockBookmark, bm2, bm3]),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Query.bookmarks(
        {},
        { take: 2 },
        mockCtx
      );

      expect(result.edges.length).toBe(2);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).toBe(encodeCursor(bm2.createdAt, bm2.id));
    });

    it('Mutation.createBookmark should create bookmark when folder exists', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            findUnique: mock(async () => mockFolder),
          },
          bookmark: {
            create: mock(async () => mockBookmark),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Mutation.createBookmark(
        {},
        {
          title: 'GraphQL Yoga Docs',
          url: 'https://the-guild.dev/graphql/yoga-server',
          tags: ['graphql'],
          folderId: 'folder-1',
        },
        mockCtx
      );

      expect(result).toEqual(mockBookmark);
    });

    it('Mutation.createBookmark should throw NOT_FOUND if folder does not exist', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            findUnique: mock(async () => null),
          },
        },
      } as unknown as GraphQLContext;

      try {
        await bookmarkResolvers.Mutation.createBookmark(
          {},
          {
            title: 'Test',
            url: 'https://example.com',
            folderId: 'missing-folder',
          },
          mockCtx
        );
        expect.unreachable('Should have thrown NotFoundError');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect((err as NotFoundError).extensions.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('Mutation.updateBookmark should update existing bookmark', async () => {
      const updatedBm = { ...mockBookmark, title: 'Updated Title' };
      const mockCtx = {
        prisma: {
          bookmark: {
            findUnique: mock(async () => mockBookmark),
            update: mock(async () => updatedBm),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Mutation.updateBookmark(
        {},
        { id: 'bookmark-1', title: 'Updated Title' },
        mockCtx
      );

      expect(result.title).toBe('Updated Title');
    });

    it('Mutation.updateBookmark should throw NOT_FOUND if bookmark is missing', async () => {
      const mockCtx = {
        prisma: {
          bookmark: {
            findUnique: mock(async () => null),
          },
        },
      } as unknown as GraphQLContext;

      try {
        await bookmarkResolvers.Mutation.updateBookmark(
          {},
          { id: 'missing-bm', title: 'New Title' },
          mockCtx
        );
        expect.unreachable('Should have thrown NotFoundError');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect((err as NotFoundError).extensions.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('Mutation.deleteBookmark should delete and return true', async () => {
      const mockCtx = {
        prisma: {
          bookmark: {
            findUnique: mock(async () => mockBookmark),
            delete: mock(async () => mockBookmark),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Mutation.deleteBookmark(
        {},
        { id: 'bookmark-1' },
        mockCtx
      );

      expect(result).toBe(true);
    });

    it('Mutation.deleteBookmark should throw NOT_FOUND if bookmark does not exist', async () => {
      const mockCtx = {
        prisma: {
          bookmark: {
            findUnique: mock(async () => null),
          },
        },
      } as unknown as GraphQLContext;

      try {
        await bookmarkResolvers.Mutation.deleteBookmark(
          {},
          { id: 'non-existent' },
          mockCtx
        );
        expect.unreachable('Should have thrown NotFoundError');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect((err as NotFoundError).extensions.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('Mutation.moveBookmark should update folderId when both bookmark and target folder exist', async () => {
      const targetFolder: Folder = {
        id: 'folder-2',
        name: 'Personal',
        createdAt: new Date(),
      };
      const movedBm = { ...mockBookmark, folderId: 'folder-2' };

      const mockCtx = {
        prisma: {
          bookmark: {
            findUnique: mock(async () => mockBookmark),
            update: mock(async () => movedBm),
          },
          folder: {
            findUnique: mock(async () => targetFolder),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Mutation.moveBookmark(
        {},
        { id: 'bookmark-1', folderId: 'folder-2' },
        mockCtx
      );

      expect(result.folderId).toBe('folder-2');
    });

    it('Mutation.moveBookmark should throw NOT_FOUND if target folder missing', async () => {
      const mockCtx = {
        prisma: {
          bookmark: {
            findUnique: mock(async () => mockBookmark),
          },
          folder: {
            findUnique: mock(async () => null),
          },
        },
      } as unknown as GraphQLContext;

      try {
        await bookmarkResolvers.Mutation.moveBookmark(
          {},
          { id: 'bookmark-1', folderId: 'missing-folder' },
          mockCtx
        );
        expect.unreachable('Should have thrown NotFoundError');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect((err as NotFoundError).extensions.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('Bookmark.folder field resolver should resolve parent folder', async () => {
      const mockCtx = {
        prisma: {
          folder: {
            findUnique: mock(async () => mockFolder),
          },
        },
      } as unknown as GraphQLContext;

      const result = await bookmarkResolvers.Bookmark.folder(mockBookmark, {}, mockCtx);
      expect(result).toEqual(mockFolder);
    });
  });
});
