import { describe, it, expect } from 'bun:test';
import {
  createFolderInputSchema,
  createBookmarkInputSchema,
  updateBookmarkInputSchema,
  moveBookmarkInputSchema,
  paginationInputSchema,
  validateInput,
} from '../../src/validation/schemas';
import { UserInputError, ErrorCode } from '../../src/errors/errors';

describe('Validation Schemas (Unit)', () => {
  describe('createFolderInputSchema', () => {
    it('should accept valid folder name', () => {
      const result = validateInput(createFolderInputSchema, { name: 'Work' });
      expect(result.name).toBe('Work');
    });

    it('should trim whitespace from folder name', () => {
      const result = validateInput(createFolderInputSchema, { name: '  Engineering  ' });
      expect(result.name).toBe('Engineering');
    });

    it('should reject empty or whitespace-only folder name', () => {
      expect(() => validateInput(createFolderInputSchema, { name: '   ' })).toThrow(UserInputError);
      expect(() => validateInput(createFolderInputSchema, { name: '' })).toThrow(UserInputError);
    });

    it('should reject missing folder name', () => {
      expect(() => validateInput(createFolderInputSchema, {})).toThrow(UserInputError);
    });
  });

  describe('createBookmarkInputSchema', () => {
    const validData = {
      title: 'GraphQL Official Docs',
      url: 'https://graphql.org',
      tags: ['graphql', 'api'],
      folderId: 'folder-123',
    };

    it('should accept valid bookmark input', () => {
      const result = validateInput(createBookmarkInputSchema, validData);
      expect(result.title).toBe(validData.title);
      expect(result.url).toBe(validData.url);
      expect(result.tags).toEqual(validData.tags);
      expect(result.folderId).toBe(validData.folderId);
    });

    it('should default tags to empty array when omitted', () => {
      const result = validateInput(createBookmarkInputSchema, {
        title: 'Prisma ORM',
        url: 'https://prisma.io',
        folderId: 'folder-123',
      });
      expect(result.tags).toEqual([]);
    });

    it('should reject empty or whitespace-only title', () => {
      expect(() =>
        validateInput(createBookmarkInputSchema, {
          ...validData,
          title: '   ',
        })
      ).toThrow(UserInputError);
    });

    it('should reject malformed URL', () => {
      expect(() =>
        validateInput(createBookmarkInputSchema, {
          ...validData,
          url: 'not-a-valid-url',
        })
      ).toThrow(UserInputError);
    });

    it('should reject non-HTTP/HTTPS URLs', () => {
      expect(() =>
        validateInput(createBookmarkInputSchema, {
          ...validData,
          url: 'ftp://files.example.com',
        })
      ).toThrow(UserInputError);

      expect(() =>
        validateInput(createBookmarkInputSchema, {
          ...validData,
          url: 'javascript:alert(1)',
        })
      ).toThrow(UserInputError);
    });

    it('should reject missing folderId', () => {
      expect(() =>
        validateInput(createBookmarkInputSchema, {
          title: 'Test',
          url: 'https://example.com',
        })
      ).toThrow(UserInputError);
    });
  });

  describe('updateBookmarkInputSchema', () => {
    it('should accept partial updates', () => {
      const result = validateInput(updateBookmarkInputSchema, {
        id: 'bm-1',
        title: 'New Title',
      });
      expect(result.id).toBe('bm-1');
      expect(result.title).toBe('New Title');
      expect(result.url).toBeUndefined();
    });

    it('should reject empty title when provided', () => {
      expect(() =>
        validateInput(updateBookmarkInputSchema, {
          id: 'bm-1',
          title: '   ',
        })
      ).toThrow(UserInputError);
    });

    it('should reject invalid URL when provided', () => {
      expect(() =>
        validateInput(updateBookmarkInputSchema, {
          id: 'bm-1',
          url: 'bad-url',
        })
      ).toThrow(UserInputError);
    });
  });

  describe('moveBookmarkInputSchema', () => {
    it('should accept valid IDs', () => {
      const result = validateInput(moveBookmarkInputSchema, {
        id: 'bm-1',
        folderId: 'folder-2',
      });
      expect(result.id).toBe('bm-1');
      expect(result.folderId).toBe('folder-2');
    });

    it('should reject empty folderId', () => {
      expect(() =>
        validateInput(moveBookmarkInputSchema, {
          id: 'bm-1',
          folderId: '  ',
        })
      ).toThrow(UserInputError);
    });
  });

  describe('paginationInputSchema', () => {
    it('should apply default take of 20', () => {
      const result = validateInput(paginationInputSchema, {});
      expect(result.take).toBe(20);
    });

    it('should reject take less than 1', () => {
      expect(() => validateInput(paginationInputSchema, { take: 0 })).toThrow(UserInputError);
    });

    it('should reject take exceeding 100', () => {
      expect(() => validateInput(paginationInputSchema, { take: 101 })).toThrow(UserInputError);
    });

    it('should accept valid pagination parameters', () => {
      const result = validateInput(paginationInputSchema, {
        take: 50,
        search: 'graphql',
        folderId: 'folder-1',
        cursor: 'valid-cursor',
      });
      expect(result.take).toBe(50);
      expect(result.search).toBe('graphql');
    });
  });

  describe('UserInputError format', () => {
    it('should contain BAD_USER_INPUT extension code', () => {
      try {
        validateInput(createFolderInputSchema, { name: '' });
        expect.unreachable('Should have thrown UserInputError');
      } catch (err) {
        expect(err).toBeInstanceOf(UserInputError);
        const graphqlError = err as UserInputError;
        expect(graphqlError.extensions.code).toBe(ErrorCode.BAD_USER_INPUT);
      }
    });
  });
});
