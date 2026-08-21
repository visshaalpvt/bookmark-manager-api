import { describe, it, expect } from 'bun:test';
import {
  encodeCursor,
  decodeCursor,
  buildBookmarkWhere,
} from '../../src/utils/pagination';
import { UserInputError } from '../../src/errors/errors';

describe('Pagination Utilities (Unit)', () => {
  describe('encodeCursor and decodeCursor', () => {
    it('should encode and decode cursor deterministically', () => {
      const date = new Date('2026-08-21T10:00:00.000Z');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      const cursor = encodeCursor(date, id);
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);

      const decoded = decodeCursor(cursor);
      expect(decoded.createdAt.toISOString()).toBe(date.toISOString());
      expect(decoded.id).toBe(id);
    });

    it('should throw UserInputError on corrupted base64 string', () => {
      expect(() => decodeCursor('!!!not-base-64!!!')).toThrow(UserInputError);
    });

    it('should throw UserInputError on non-JSON base64 string', () => {
      const invalidBase64 = Buffer.from('plain-text-not-json').toString('base64');
      expect(() => decodeCursor(invalidBase64)).toThrow(UserInputError);
    });

    it('should throw UserInputError on invalid JSON schema payload', () => {
      const invalidPayload = Buffer.from(JSON.stringify({ someField: 123 })).toString('base64');
      expect(() => decodeCursor(invalidPayload)).toThrow(UserInputError);
    });

    it('should throw UserInputError on invalid timestamp in payload', () => {
      const invalidDatePayload = Buffer.from(
        JSON.stringify({ createdAt: 'invalid-date', id: 'some-id' })
      ).toString('base64');
      expect(() => decodeCursor(invalidDatePayload)).toThrow(UserInputError);
    });
  });

  describe('buildBookmarkWhere', () => {
    it('should return empty where when no filters provided', () => {
      const where = buildBookmarkWhere();
      expect(where).toEqual({});
    });

    it('should return folderId filter when folderId is given', () => {
      const where = buildBookmarkWhere('folder-abc');
      expect(where).toEqual({ folderId: 'folder-abc' });
    });

    it('should return case-insensitive title search condition', () => {
      const where = buildBookmarkWhere(undefined, 'GraphQL');
      expect(where).toEqual({
        title: {
          contains: 'GraphQL',
          mode: 'insensitive',
        },
      });
    });

    it('should construct compound cursor conditions for pagination', () => {
      const date = new Date('2026-08-21T10:00:00.000Z');
      const cursor = encodeCursor(date, 'bm-99');

      const where = buildBookmarkWhere(undefined, undefined, cursor);
      expect(where).toEqual({
        OR: [
          { createdAt: { lt: date } },
          { createdAt: date, id: { lt: 'bm-99' } },
        ],
      });
    });

    it('should combine folderId, search, and cursor using AND', () => {
      const date = new Date('2026-08-21T10:00:00.000Z');
      const cursor = encodeCursor(date, 'bm-99');

      const where = buildBookmarkWhere('folder-1', 'TypeScript', cursor);
      expect(where).toHaveProperty('AND');
    });
  });
});
