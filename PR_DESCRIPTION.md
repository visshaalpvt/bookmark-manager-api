# Pull Request: Bookmark Manager GraphQL API Implementation

## 🎯 Summary of Changes
This pull request introduces the complete implementation of the **Bookmark Manager GraphQL API** using Bun, TypeScript (strict mode with zero `any`), GraphQL Yoga (schema-first architecture), PostgreSQL, and Prisma ORM.

---

## 🛠 What Was Implemented

### 1. Database & Schema Design
- **Prisma Schema (`prisma/schema.prisma`)**:
  - `Folder`: Primary key UUID, name, createdAt timestamp, one-to-many relation with `Bookmark`.
  - `Bookmark`: Primary key UUID, title, URL, string array tags, foreign key `folderId`, createdAt timestamp.
  - **Cascading Deletions**: Configured `onDelete: Cascade` on the `folderId` relation so deleting a folder cleanly deletes its bookmarks.
  - **Database Indices**: Added index on `folderId` and a composite index on `(createdAt, id)` for efficient cursor pagination lookups.
  - Generated standard migrations in `prisma/migrations/`.

### 2. Schema-First GraphQL API (`src/schema/schema.graphql`)
- **Queries**:
  - `folders`: Returns all folders.
  - `folder(id: ID!)`: Returns a single folder with nested bookmarks, or `null` if not found.
  - `bookmarks(folderId, search, take, cursor)`: Returns paginated `BookmarkConnection` (`edges` with nodes and cursors, plus `pageInfo` with `endCursor` and `hasNextPage`).
- **Mutations**:
  - `createFolder(name: String!)`: Validates and creates a folder.
  - `createBookmark(title, url, tags, folderId)`: Validates inputs, verifies folder exists, creates bookmark.
  - `updateBookmark(id, title, url, tags)`: Validates partial updates, verifies bookmark exists.
  - `deleteBookmark(id)`: Validates existence and deletes bookmark.
  - `moveBookmark(id, folderId)`: Verifies bookmark and target folder both exist, updates `folderId`.
- **Field Resolvers**:
  - `Folder.bookmarks`: Resolves nested bookmarks ordered chronologically.
  - `Bookmark.folder`: Resolves parent folder entity.

### 3. Input Validation & Error Handling
- **Zod Schemas (`src/validation/schemas.ts`)**:
  - Strict validation for titles/names (rejects empty and whitespace-only strings).
  - Strict URL validation (enforces well-formed HTTP/HTTPS URLs).
  - Strict pagination limits (`take` min 1, max 100, default 20).
- **Structured GraphQL Errors (`src/errors/errors.ts`)**:
  - `BAD_USER_INPUT`: Returned for validation failures and corrupted pagination cursors.
  - `NOT_FOUND`: Returned when referencing non-existent folders or bookmarks.
  - `INTERNAL_SERVER_ERROR`: Returned for unexpected exceptions, masked to prevent leaking internal stack traces.

### 4. Deterministic Cursor Pagination (`src/utils/pagination.ts`)
- Implemented Base64 JSON composite cursor `{"createdAt": "<ISOString>", "id": "<UUID>"}`.
- Uses `createdAt DESC, id DESC` with SQL predicate `(createdAt < cursorDate) OR (createdAt = cursorDate AND id < cursorId)` to ensure 100% stable pagination across duplicate timestamps.
- Fetches `take + 1` to compute `hasNextPage` without requiring a separate `COUNT(*)` query.

### 5. Automated Testing Suite
- **Unit Tests (`tests/unit/`)**: 47 passing unit tests covering validation rules, cursor encoding/decoding, pagination boundaries, and resolver logic with positive and negative assertion paths.
- **Integration Tests (`tests/integration/`)**: End-to-end integration tests executing GraphQL queries/mutations against PostgreSQL (folder creation, bookmark creation, multi-page cursor traversal, search, move, and cascade delete).

---

## ⚖️ Key Design Decisions & Tradeoffs

1. **Composite Cursor `(createdAt, id)` vs ID-only Cursor**:
   - *Decision*: Composite cursor.
   - *Rationale*: Sorting by `createdAt` allows intuitive chronological ordering (newest bookmarks first). However, multiple records can share identical millisecond timestamps. Adding `id` as a deterministic tiebreaker prevents skipping records or infinite loops at page boundaries.

2. **Restrict Deletion (`onDelete: Restrict`) vs Cascade (`onDelete: Cascade`)**:
   - *Decision*: `onDelete: Restrict`.
   - *Rationale*: For a bookmark manager, bookmarks are valuable user assets. Using `Restrict` provides defensive data-loss protection against inadvertent folder deletions/typos, requiring API clients to explicitly reassign (`moveBookmark`) or delete bookmarks before deleting a folder container.

3. **Schema-First vs Code-First**:
   - *Decision*: Schema-First (`schema.graphql` + separate resolvers).
   - *Rationale*: Keeps GraphQL schema as the explicit single source of truth for client contracts, cleanly decoupling API types from ORM models.

4. **Substring Search via ILIKE**:
   - *Decision*: Case-insensitive substring match via Prisma's `mode: 'insensitive'`.
   - *Rationale*: Fits the assignment scope without introducing external search dependencies like Elasticsearch.

---

## 🔮 What I Would Improve With More Time

1. **User Authentication & Multi-Tenancy**: Add JWT authentication and user ownership to folders and bookmarks with row-level security.
2. **Full-Text Search**: Implement Postgres `tsvector` with GIN indices for weighted full-text search across titles, URLs, and tags.
3. **Redis Caching**: Add cache-aside caching for folder listings and hot bookmark pages with mutation-based cache invalidation.
4. **Metrics & Tracing**: Integrate OpenTelemetry for distributed tracing and Prometheus metrics tracking query latencies.
