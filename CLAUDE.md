# car-assistant-back — Car Assistant API

## Communication style
- Keep answers short and simple. Answer first, with no preamble or recap.
- Elaborate only when asked.
- Always flag risky or destructive actions in one line.

Express 5 + TypeScript (ESM) + Prisma 6.19 + MongoDB. Tests use Vitest + Supertest.
Repo: https://github.com/tavangar79/car-assistant-back.git. It's a standalone project, used as a submodule
by the car-assistant manager repo, whose CTO sends tasks with an API contract.

> **Why Prisma 6.19?** Prisma 7 has no MongoDB connector, and Prisma 8 (Mongo-native) is still a
> release candidate. Don't upgrade Prisma without checking MongoDB support first.

## Before you start
- **Use graphify first:** `graphify query "<question>"`. If `graphify-out/` is missing, run `/graphify .`.
  After meaningful changes, refresh it with `/graphify . --update`.
- Load the `backend-senior` skill for the full conventions and recipes.
- **John** (`john` agent, `.claude/agents/john.md`) owns backend work.
- Tooling in this repo: the `typescript-lsp` plugin, and the `mongodb` plugin (read-only, local DB).
  Use Context7 for library docs.

## Commands
| Task              | Command                                      |
|-------------------|----------------------------------------------|
| Start MongoDB     | `npm run db:up` (Docker; replica set rs0)    |
| Sync schema       | `npm run db:push` then `npm run db:generate` |
| Dev server        | `npm run dev` → http://localhost:3000        |
| Tests             | `npm test`                                   |
| Types / lint      | `npm run typecheck` · `npm run lint`         |
| Build             | `npm run build`                              |
| Seed catalog      | `npm run catalog:seed` (adds missing global rows only) |
| Grant admin       | `npm run admin:grant -- <phone>`             |
| Revoke admin      | `npm run admin:revoke -- <phone>`            |

**Definition of done:** `npm test && npm run typecheck && npm run lint` all pass.

## Structure
```
src/
  app.ts                 createApp(deps): wires routes; no I/O, so it's easy to test
  server.ts              composition root: env + Prisma + listen
  config/env.ts          zod-validated env
  lib/prisma.ts          PrismaClient factory
  shared/                errors, error handler, validation helper
  modules/<feature>/
    <feature>.types.ts       zod schemas + TS types (the API contract)
    <feature>.repository.ts  interface + Prisma implementation
    <feature>.service.ts     business rules; depends on the repository interface
    <feature>.routes.ts      thin HTTP layer: parse → call service → respond
    *.test.ts                colocated tests
  test/                  in-memory fakes shared by tests
prisma/schema.prisma
```

## Rules
- All steps and code must be **simple, readable and testable**. Don't add speculative abstractions.
- Flow is always **routes → service → repository**. Routes hold no business logic, and services never import Express or Prisma.
- Validate every request body with zod via `parseOrThrow`. Throw `AppError` subclasses, and the error handler formats them.
- Express 5 forwards async errors automatically, so don't use try/catch in routes.
- New dependencies go through `AppDependencies` in `app.ts`, so tests can pass fakes.
- Relative imports use the `.ts` extension (`rewriteRelativeImportExtensions`).
- Every new service method gets a unit test with the in-memory repo, and every endpoint gets a Supertest test.
- MongoDB ids are 24-hex ObjectIds. Treat malformed ids as "not found", not as a server error.
