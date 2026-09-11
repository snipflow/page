import { z } from 'zod'
import { parseMimeType, requireTimestamp } from '../domain/validation.ts'

const byteSizeSchema = z.number().int().safe().nonnegative()
const timestampSchema = (field: 'createdAt' | 'expiresAt') =>
  z.string().refine(
    (value) => {
      try {
        requireTimestamp(field, value)
        return true
      } catch {
        return false
      }
    },
    { message: 'Timestamp must be valid and include a timezone' },
  )

const contentTypeSchema = z
  .string()
  .refine((value) => parseMimeType(value) !== null, 'Invalid MIME type')

export const healthResponseSchema = z.object({
  ok: z.literal(true),
})

export const authResponseSchema = healthResponseSchema.extend({
  authed: z.literal(true),
})

export const snipIndexSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  contentType: contentTypeSchema,
  filename: z.string().nullable().optional(),
  size: byteSizeSchema,
  createdAt: timestampSchema('createdAt'),
  expiresAt: timestampSchema('expiresAt').nullable(),
})

export const createSnipResponseSchema = snipIndexSchema.extend({
  source: z.string().min(1).max(256),
})

export const listSnipsResponseSchema = z.object({
  items: z.array(snipIndexSchema).max(100),
  cursor: z.string().min(1).optional(),
})

export const statsResponseSchema = z.object({
  count: byteSizeSchema,
  totalSize: byteSizeSchema,
  storageLimit: byteSizeSchema,
})

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1).optional(),
    issues: z.array(z.unknown()).optional(),
  }),
})
