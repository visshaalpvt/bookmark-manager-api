# Bookmark Manager GraphQL API

A high-performance, strictly-typed GraphQL API for organizing, searching, and managing folders and bookmarks. Built with **Bun**, **TypeScript** (Strict Mode, zero `any`), **GraphQL Yoga** (Schema-First), **Prisma ORM**, and **PostgreSQL**.

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Quickstart (Local Setup)](#quickstart-local-setup)
3. [Environment Variables](#environment-variables)
4. [Database & Migrations](#database--migrations)
5. [Testing & Quality Assurance](#testing--quality-assurance)
6. [GraphQL API Reference](#graphql-api-reference)
7. [Pagination Algorithm Deep Dive](#pagination-algorithm-deep-dive)
8. [Error Handling & Validation](#error-handling--validation)
9. [How I'd Extend This (Architecture Discussion)](#how-id-extend-this-architecture-discussion)

---

## 1. Tech Stack

- **Runtime**: [Bun](https://bun.sh) (v1.4+)
- **Language**: TypeScript (v5.6+, `strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`)
- **GraphQL Engine**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) (Schema-First)
- **Database & ORM**: PostgreSQL 16 + [Prisma ORM](https://www.prisma.io/)
- **Validation**: [Zod](https://zod.dev/)
- **Containerization**: Docker & Docker Compose

---

## 2. Quickstart (Local Setup)

Clone the repository and run the application end-to-end:

```bash
# 0. Copy environment variables
cp .env.example .env

# 1. Start the PostgreSQL container
docker compose up -d

# 2. Install dependencies
bun install

# 3. Generate Prisma client & apply database migrations
bun run gendb

# 4. Start the GraphQL development server
bun run dev
```

The GraphQL API and GraphiQL Interactive Explorer will be available at:
👉 **`http://localhost:4000/graphql`**

---

## 3. Environment Variables

Configuration is loaded via `.env` (a template is provided in `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/bookmark_manager?schema=public` |
| `PORT` | HTTP server port | `4000` |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |

---

## 4. Database & Migrations

### Domain Models
- **`Folder`**: Primary entity for grouping bookmarks (`id`, `name`, `createdAt`).
- **`Bookmark`**: Stores bookmark records (`id`, `title`, `url`, `tags`, `folderId`, `createdAt`).

### Relations & Indices
- **Foreign Key**: `Bookmark.folderId -> Folder.id` with `onDelete: Restrict`.
  - *Rationale*: Defensive data protection — deleting a folder that contains bookmarks is rejected by the database, preventing accidental bulk data loss from typos and requiring clients to explicitly reassign or delete bookmarks first.
- **Indices**:
  - `@@index([folderId])` for fast folder-scoped lookups.
  - `@@index([createdAt, id])` composite index for optimal cursor-based pagination traversal.

### Database Commands
- Apply migrations and generate Prisma client:
  ```bash
  bun run gendb
  ```
- Reset database (for local dev testing):
  ```bash
  bunx prisma migrate reset
  ```

---

## 5. Testing & Quality Assurance

The test suite includes **comprehensive unit tests** (testing Zod validation rules, pagination encoding/decoding, resolver business logic, and error formatting) and **integration tests** executing against the database.

```bash
# Run all checks: Typecheck + Unit Tests + Integration Tests
bun run sanity

# Run only unit tests
bun run test:unit

# Run only integration tests
bun run test:integration

# Type check without running tests
bun run lint
```

---

## 6. GraphQL API Reference

### Queries

#### 1. List Folders
```graphql
query GetFolders {
  folders {
    id
    name
    createdAt
    bookmarks {
      id
      title
      url
    }
  }
}
```

#### 2. Get Folder by ID (with Nested Bookmarks)
```graphql
query GetFolder($id: ID!) {
  folder(id: $id) {
    id
    name
    createdAt
    bookmarks {
      id
      title
      url
      tags
    }
  }
}
```
*Note: Returns `null` if folder does not exist.*

#### 3. Paginated Bookmarks with Search & Filter
```graphql
query GetBookmarks($folderId: ID, $search: String, $take: Int, $cursor: String) {
  bookmarks(folderId: $folderId, search: $search, take: $take, cursor: $cursor) {
    edges {
      cursor
      node {
        id
        title
        url
        tags
        createdAt
        folder {
          id
          name
        }
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
```

---

### Mutations

#### 1. Create Folder
```graphql
mutation CreateFolder($name: String!) {
  createFolder(name: $name) {
    id
    name
    createdAt
  }
}
```

#### 2. Create Bookmark
```graphql
mutation CreateBookmark($title: String!, $url: String!, $tags: [String!], $folderId: ID!) {
  createBookmark(title: $title, url: $url, tags: $tags, folderId: $folderId) {
    id
    title
    url
    tags
    folderId
    createdAt
  }
}
```

#### 3. Update Bookmark
```graphql
mutation UpdateBookmark($id: ID!, $title: String, $url: String, $tags: [String!]) {
  updateBookmark(id: $id, title: $title, url: $url, tags: $tags) {
    id
    title
    url
    tags
  }
}
```

#### 4. Delete Bookmark
```graphql
mutation DeleteBookmark($id: ID!) {
  deleteBookmark(id: $id)
}
```

#### 5. Move Bookmark
```graphql
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
```

---

## 7. Pagination Algorithm Deep Dive

### Deterministic Composite Cursor
Traditional offset-based pagination (`OFFSET N LIMIT M`) degrades linearly in performance ($O(N)$ scanning) and suffers from page drifting when records are inserted or deleted concurrently.

To solve this, our API uses **keyset cursor pagination** based on a composite tuple `(createdAt, id)`:
1. **Cursor Format**: A Base64-encoded JSON payload containing the record's ISO timestamp and UUID:
   $$\text{cursor} = \text{base64}\Big(\text{JSON}(\{ \text{createdAt}: \text{ISOString}, \text{id}: \text{UUID} \})\Big)$$
2. **Stable Sorting**: Results are ordered by `createdAt DESC, id DESC`. The `id` tiebreaker guarantees a total, deterministic ordering even if multiple bookmarks share the exact same millisecond timestamp.
3. **Database Querying**:
   When a cursor is provided, the query translates into the following SQL predicate:
   ```sql
   WHERE ("createdAt" < $cursorDate) 
      OR ("createdAt" = $cursorDate AND "id" < $cursorId)
   ORDER BY "createdAt" DESC, "id" DESC
   LIMIT $take + 1;
   ```
4. **HasNextPage Calculation**:
   By requesting `take + 1` records, the server determines `hasNextPage = records.length > take` in a single query without executing an expensive separate `COUNT(*)` query. The extra record is sliced off before returning `edges` and `pageInfo.endCursor`.
5. **Page Boundaries**:
   - `take`: Default `20`, Min `1`, Max `100` (enforced via Zod validation).

---

## 8. Error Handling & Validation

Every request is sanitized and validated using **Zod** before reaching the database. Errors are mapped into structured `GraphQLError` responses with standard `extensions.code`:

| Error Code | HTTP Scenario | Description |
|---|---|---|
| `BAD_USER_INPUT` | 400 | Invalid payload: empty titles/names, malformed or non-HTTP URLs, `take` out of range, or corrupted cursor format. |
| `NOT_FOUND` | 404 | Target entity not found: non-existent `folderId` on bookmark creation, or missing `bookmarkId`/`folderId` on update, delete, or move. |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected system failures (masked to protect internal stack traces). |

---

## 9. How I'd Extend This (Architecture Discussion)

### 1. Authentication & Authorization
- **Multi-tenancy**: Introduce a `User` model with 1-to-many relationships to `Folder` and `Bookmark`.
- **JWT / OIDC Auth**: Integrate standard Bearer token validation in the GraphQL Yoga context to extract `userId`.
- **Authorization**: Row-level access control ensuring users can only read or mutate their own folders/bookmarks. Folder-level sharing can be modeled via a `FolderPermission` table (`userId`, `folderId`, `role: READ | WRITE | ADMIN`).

### 2. Caching Strategy
- **Layered Caching**:
  - **Edge Caching**: HTTP caching for public folders via `Cache-Control` headers and Cloudflare / Fastly.
  - **Redis Cache-Aside**: Cache folder hierarchy and hot bookmark queries (keyed by `folderId:page_cursor`).
  - **Granular Invalidation**: Invalidate relevant Redis keys on `createBookmark`, `updateBookmark`, or `moveBookmark` mutations.

### 3. Advanced Search
- **PostgreSQL Full-Text Search**: Add a generated `tsvector` column on `(title || ' ' || array_to_string(tags, ' '))` with a GIN index to support weighted ranking and stemming.
- **Elasticsearch / Meilisearch**: For large-scale multi-million bookmark systems, synchronize records via CDC (Change Data Capture / Debezium) into Meilisearch for typo-tolerant, instant search with facet filtering by tags.

### 4. Observability & Telemetry
- **OpenTelemetry**: Trace resolver execution timings, database query latencies, and downstream calls.
- **Structured Logging**: Use `pino` with request correlation IDs injected into context.
- **Prometheus Metrics**: Expose `/metrics` tracking GraphQL operation counts, error rates by `extensions.code`, and P95/P99 latency percentiles.

### 5. API Versioning & Schema Evolution
- **Schema Evolution**: Use GraphQL `@deprecated(reason: "...")` directives for non-breaking deprecations.
- **Breaking Changes**: Field renaming or type shifts phased through additive fields before removing legacy fields.

### 6. Scaling & High Availability
- **Connection Pooling**: Place [PgBouncer](https://www.pgbouncer.org/) between Yoga instances and PostgreSQL to handle thousands of concurrent client connections.
- **Read Replicas**: Route read queries (`Query.folders`, `Query.bookmarks`) to read replicas while directing mutations to the primary database.
- **Horizontal Scaling**: Stateless Yoga containers deployed across multiple pods behind a load balancer.
