---
name: backend-senior
description: Conventions and step-by-step recipes for the Car Assistant backend (Express 5, TypeScript ESM, Prisma 6.19, MongoDB, zod, Vitest/Supertest). Use when adding or changing an endpoint, service, Prisma model, validation, or backend test in backend/.
---

# Backend senior playbook

Goal: code that is **simple, readable, and testable**. Read `backend/CLAUDE.md` first.

## Recipe: add a feature module (e.g. `trips`)

1. **Contract.** Write `src/modules/trips/trip.types.ts`:
   - zod `createTripSchema` / `updateTripSchema = createTripSchema.partial()`
   - `type CreateTripInput = z.infer<...>` and a plain `interface Trip`.
2. **Model.** Add the `Trip` model to `prisma/schema.prisma`:
   `id String @id @default(auto()) @map("_id") @db.ObjectId`, timestamps, and `@@map("trips")`.
   Then run `npm run db:generate` (and `npm run db:push` when Mongo is running).
3. **Repository.** In `trip.repository.ts`, write `interface TripRepository` (domain-shaped methods only) and
   `class PrismaTripRepository implements TripRepository`.
4. **Fake.** Add `src/test/in-memory-trip.repository.ts`, which implements the same interface with a `Map`.
5. **Service test first.** In `trip.service.test.ts`, test against the in-memory repo. Cover the happy path, not found,
   and business rules.
6. **Service.** In `trip.service.ts`, write `class TripService { constructor(private readonly repository: TripRepository) }`.
   Throw `NotFoundError` / `AppError`. Never import Express or Prisma here.
7. **Routes.** In `trip.routes.ts`, write `export function tripRoutes(service: TripService): Router`. Each handler does
   `parseOrThrow(schema, req.body)`, calls the service, then calls `res.status(...).json(...)`.
8. **Wire.** Add `tripRepository: TripRepository` to `AppDependencies` in `app.ts`, mount
   `app.use('/api/trips', tripRoutes(new TripService(deps.tripRepository)))`, and pass
   `new PrismaTripRepository(prisma)` in `server.ts`.
9. **Route test.** In `trip.routes.test.ts`, write Supertest tests against `createApp({ ...fakes })` covering 201/200/400/404/204.
10. **Verify.** `npm test && npm run typecheck && npm run lint`.

## Conventions
- Status codes: 200 read/update, 201 create, 204 delete, 400 validation, 404 missing, 500 unknown.
- Error body: `{ "error": { "message": string, "details"?: unknown } }`.
- JSON fields are camelCase. Ids are strings (24-hex ObjectId).
- Use one class or function per responsibility, and keep files short. Name by domain (`TripService`), not by pattern (`TripManager`).
- Express 5 handles rejected promises, so don't wrap handlers in try/catch.
- Config comes only from `loadEnv()`. Never read `process.env` elsewhere.
- Prisma + MongoDB needs a replica set (see `docker-compose.yml`). There's no `prisma migrate` for MongoDB, so use `db push`.

## Testing rules
- Unit-test services with in-memory fakes, not mocks of Prisma.
- Use Supertest on `createApp(...)` for HTTP behaviour (validation, status codes, JSON shape).
- Arrange / act / assert, with one behaviour per test and descriptive `it('...')` names.
- Tests never touch a real database or network.

## Avoid
- Business logic in routes, or Prisma calls in services.
- Generic base repositories, decorators, or DI containers. Plain constructor injection is enough.
- `any`. Use zod inference or explicit types.
