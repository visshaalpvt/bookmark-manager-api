import { z } from 'zod';
import { UserInputError } from '../errors/errors';

export const createFolderInputSchema = z.object({
  name: z
    .string({ required_error: 'Folder name is required' })
    .trim()
    .min(1, 'Folder name cannot be empty or whitespace-only')
    .max(255, 'Folder name cannot exceed 255 characters'),
});

const urlSchema = z
  .string({ required_error: 'URL is required' })
  .trim()
  .min(1, 'URL cannot be empty')
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid HTTP or HTTPS URL' }
  );

export const createBookmarkInputSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title cannot be empty or whitespace-only')
    .max(500, 'Title cannot exceed 500 characters'),
  url: urlSchema,
  tags: z
    .array(z.string().trim().min(1, 'Tag cannot be empty'))
    .optional()
    .default([]),
  folderId: z
    .string({ required_error: 'folderId is required' })
    .trim()
    .min(1, 'folderId cannot be empty'),
});

export const updateBookmarkInputSchema = z.object({
  id: z
    .string({ required_error: 'id is required' })
    .trim()
    .min(1, 'id cannot be empty'),
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty or whitespace-only')
    .max(500, 'Title cannot exceed 500 characters')
    .optional(),
  url: urlSchema.optional(),
  tags: z
    .array(z.string().trim().min(1, 'Tag cannot be empty'))
    .optional(),
});

export const moveBookmarkInputSchema = z.object({
  id: z
    .string({ required_error: 'id is required' })
    .trim()
    .min(1, 'id cannot be empty'),
  folderId: z
    .string({ required_error: 'folderId is required' })
    .trim()
    .min(1, 'folderId cannot be empty'),
});

export const paginationInputSchema = z.object({
  take: z
    .number()
    .int('take must be an integer')
    .min(1, 'take must be at least 1')
    .max(100, 'take cannot exceed 100')
    .optional()
    .default(20),
  cursor: z.string().trim().min(1).optional(),
  folderId: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
});

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const formattedErrors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    const message = formattedErrors.map((e) => `${e.field ? `${e.field}: ` : ''}${e.message}`).join('; ');
    throw new UserInputError(message, { issues: formattedErrors });
  }
  return result.data;
}
