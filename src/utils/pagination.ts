import { Prisma } from '@prisma/client';
import { UserInputError } from '../errors/errors';

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({
    createdAt: createdAt.toISOString(),
    id,
  });
  return Buffer.from(payload, 'utf8').toString('base64');
}

export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw) as { createdAt?: unknown; id?: unknown };

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('Malformed cursor payload');
    }

    const createdAt = new Date(parsed.createdAt);
    if (isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor timestamp');
    }

    return {
      createdAt,
      id: parsed.id,
    };
  } catch {
    throw new UserInputError('Invalid pagination cursor provided');
  }
}

export function buildBookmarkWhere(
  folderId?: string,
  search?: string,
  cursor?: string
): Prisma.BookmarkWhereInput {
  const conditions: Prisma.BookmarkWhereInput[] = [];

  if (folderId) {
    conditions.push({ folderId });
  }

  if (search && search.trim().length > 0) {
    conditions.push({
      title: {
        contains: search.trim(),
        mode: 'insensitive',
      },
    });
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    conditions.push({
      OR: [
        {
          createdAt: {
            lt: decoded.createdAt,
          },
        },
        {
          createdAt: decoded.createdAt,
          id: {
            lt: decoded.id,
          },
        },
      ],
    });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1 && conditions[0]) {
    return conditions[0];
  }

  return {
    AND: conditions,
  };
}
