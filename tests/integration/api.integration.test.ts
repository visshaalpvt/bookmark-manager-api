import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { createYogaServer } from '../../src/server';

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('API Integration Tests (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let yoga: ReturnType<typeof createYogaServer>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // Connect to the real database — fail hard if unreachable
    await prisma.$connect();
    // Clean up previous test data
    await prisma.bookmark.deleteMany({});
    await prisma.folder.deleteMany({});
    yoga = createYogaServer({ prisma });
  });

  afterAll(async () => {
    await prisma.bookmark.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.$disconnect();
  });

  async function executeGraphQL(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse> {
    const response = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    return (await response.json()) as GraphQLResponse;
  }

  it('should execute full end-to-end folder and bookmark lifecycle', async () => {
    // 1. Create Folders
    const createFolderMutation = `
      mutation CreateFolder($name: String!) {
        createFolder(name: $name) {
          id
          name
          createdAt
        }
      }
    `;

    const folderRes1 = await executeGraphQL(createFolderMutation, { name: 'Work' });
    expect(folderRes1.errors).toBeUndefined();
    const folder1 = folderRes1.data?.createFolder as Record<string, string> | undefined;
    expect(folder1).toBeDefined();
    expect(folder1!.id).toBeDefined();
    expect(folder1!.name).toBe('Work');

    const folderRes2 = await executeGraphQL(createFolderMutation, { name: 'Personal' });
    const folder2 = folderRes2.data?.createFolder as Record<string, string> | undefined;
    expect(folder2).toBeDefined();
    expect(folder2!.id).toBeDefined();

    // 2. Query Folders
    const foldersQuery = `
      query GetFolders {
        folders {
          id
          name
          bookmarks {
            id
          }
        }
      }
    `;
    const listFoldersRes = await executeGraphQL(foldersQuery);
    const folders = listFoldersRes.data?.folders as unknown[];
    expect(folders.length).toBe(2);

    // 3. Create Bookmarks inside Folder 1
    const createBookmarkMutation = `
      mutation CreateBookmark($title: String!, $url: String!, $tags: [String!], $folderId: ID!) {
        createBookmark(title: $title, url: $url, tags: $tags, folderId: $folderId) {
          id
          title
          url
          tags
          folderId
          createdAt
          folder {
            id
            name
          }
        }
      }
    `;

    const bm1Res = await executeGraphQL(createBookmarkMutation, {
      title: 'Bun Runtime',
      url: 'https://bun.sh',
      tags: ['bun', 'javascript'],
      folderId: folder1!.id,
    });
    expect(bm1Res.errors).toBeUndefined();
    const bm1 = bm1Res.data?.createBookmark as Record<string, unknown> | undefined;
    expect(bm1).toBeDefined();
    expect(bm1!.title).toBe('Bun Runtime');
    expect((bm1!.folder as Record<string, string>).name).toBe('Work');

    // Create 4 more bookmarks for pagination testing
    for (let i = 2; i <= 5; i++) {
      const res = await executeGraphQL(createBookmarkMutation, {
        title: `Bookmark Article ${i}`,
        url: `https://example.com/article-${i}`,
        tags: [`tag-${i}`],
        folderId: folder1!.id,
      });
      expect(res.errors).toBeUndefined();
    }

    // 4. Test Cursor Pagination (Page 1)
    const paginationQuery = `
      query GetBookmarks($folderId: ID, $search: String, $take: Int, $cursor: String) {
        bookmarks(folderId: $folderId, search: $search, take: $take, cursor: $cursor) {
          edges {
            cursor
            node {
              id
              title
              url
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    `;

    const page1Res = await executeGraphQL(paginationQuery, {
      folderId: folder1!.id,
      take: 2,
    });

    const page1 = page1Res.data?.bookmarks as { edges: Array<{ node: { id: string; title: string }; cursor: string }>; pageInfo: { endCursor: string | null; hasNextPage: boolean } };
    expect(page1.edges.length).toBe(2);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect(page1.pageInfo.endCursor).toBeDefined();

    // 5. Test Cursor Pagination (Page 2 using endCursor)
    const page2Res = await executeGraphQL(paginationQuery, {
      folderId: folder1!.id,
      take: 2,
      cursor: page1.pageInfo.endCursor,
    });

    const page2 = page2Res.data?.bookmarks as typeof page1;
    expect(page2.edges.length).toBe(2);
    expect(page2.pageInfo.hasNextPage).toBe(true);
    // Ensure records on Page 2 are distinct from Page 1
    const page1Ids = page1.edges.map((e) => e.node.id);
    const page2Ids = page2.edges.map((e) => e.node.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }

    // 6. Test Cursor Pagination (Page 3 final page)
    const page3Res = await executeGraphQL(paginationQuery, {
      folderId: folder1!.id,
      take: 2,
      cursor: page2.pageInfo.endCursor,
    });

    const page3 = page3Res.data?.bookmarks as typeof page1;
    expect(page3.edges.length).toBe(1);
    expect(page3.pageInfo.hasNextPage).toBe(false);

    // 7. Test Substring Search (case-insensitive)
    const searchRes = await executeGraphQL(paginationQuery, {
      search: 'bun',
    });
    const searchResults = searchRes.data?.bookmarks as typeof page1;
    expect(searchResults.edges.length).toBe(1);
    expect(searchResults.edges[0]!.node.title).toBe('Bun Runtime');

    // 8. Test Update Bookmark
    const updateMutation = `
      mutation UpdateBookmark($id: ID!, $title: String, $url: String) {
        updateBookmark(id: $id, title: $title, url: $url) {
          id
          title
          url
        }
      }
    `;
    const updateRes = await executeGraphQL(updateMutation, {
      id: bm1!.id as string,
      title: 'Bun Fast JavaScript Runtime',
    });
    const updated = updateRes.data?.updateBookmark as Record<string, string>;
    expect(updated.title).toBe('Bun Fast JavaScript Runtime');

    // 9. Test Move Bookmark to Folder 2
    const moveMutation = `
      mutation MoveBookmark($id: ID!, $folderId: ID!) {
        moveBookmark(id: $id, folderId: $folderId) {
          id
          folderId
          folder {
            id
            name
          }
        }
      }
    `;
    const moveRes = await executeGraphQL(moveMutation, {
      id: bm1!.id as string,
      folderId: folder2!.id,
    });
    const moved = moveRes.data?.moveBookmark as Record<string, unknown>;
    expect(moved.folderId).toBe(folder2!.id);
    expect((moved.folder as Record<string, string>).name).toBe('Personal');

    // 10. Test Nested Folder Query
    const singleFolderQuery = `
      query GetFolder($id: ID!) {
        folder(id: $id) {
          id
          name
          bookmarks {
            id
            title
          }
        }
      }
    `;
    const folder2Res = await executeGraphQL(singleFolderQuery, { id: folder2!.id });
    const fetchedFolder = folder2Res.data?.folder as { bookmarks: Array<{ id: string }> };
    expect(fetchedFolder.bookmarks.length).toBe(1);
    expect(fetchedFolder.bookmarks[0]!.id).toBe(bm1!.id);

    // 11. Test Error Handling: Invalid Input
    const invalidCreateRes = await executeGraphQL(createBookmarkMutation, {
      title: '   ',
      url: 'invalid-url',
      folderId: folder1!.id,
    });
    expect(invalidCreateRes.errors).toBeDefined();
    expect(invalidCreateRes.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    // 12. Test Error Handling: Not Found Folder
    const missingFolderRes = await executeGraphQL(createBookmarkMutation, {
      title: 'Valid Title',
      url: 'https://valid.com',
      folderId: '00000000-0000-0000-0000-000000000000',
    });
    expect(missingFolderRes.errors).toBeDefined();
    expect(missingFolderRes.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');

    // 13. Test Delete Bookmark
    const deleteMutation = `
      mutation DeleteBookmark($id: ID!) {
        deleteBookmark(id: $id)
      }
    `;
    const deleteRes = await executeGraphQL(deleteMutation, { id: bm1!.id as string });
    expect(deleteRes.data?.deleteBookmark).toBe(true);

    // Verify deleted bookmark cannot be deleted again
    const deleteAgainRes = await executeGraphQL(deleteMutation, { id: bm1!.id as string });
    expect(deleteAgainRes.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });
});
