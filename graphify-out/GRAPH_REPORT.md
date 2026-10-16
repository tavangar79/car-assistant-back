# Graph Report - .  (2026-10-16)

## Corpus Check
- Corpus is ~2,652 words - fits in a single context window. You may not need a graph.

## Summary
- 166 nodes · 268 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.78)
- Token cost: 63,405 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Vehicle Repository Layer|Vehicle Repository Layer]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_Backend Conventions & Agent|Backend Conventions & Agent]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Vehicle Service & Routes|Vehicle Service & Routes]]
- [[_COMMUNITY_Bootstrap & Env|Bootstrap & Env]]
- [[_COMMUNITY_Dev Tooling|Dev Tooling]]
- [[_COMMUNITY_Claude Settings & Plugins|Claude Settings & Plugins]]
- [[_COMMUNITY_App Wiring & Error Handling|App Wiring & Error Handling]]
- [[_COMMUNITY_TS Build Config|TS Build Config]]

## God Nodes (most connected - your core abstractions)
1. `Vehicle` - 20 edges
2. `compilerOptions` - 15 edges
3. `scripts` - 13 edges
4. `VehicleRepository` - 13 edges
5. `CLAUDE.md (Car Assistant API)` - 12 edges
6. `VehicleService` - 10 edges
7. `PrismaVehicleRepository` - 9 edges
8. `InMemoryVehicleRepository` - 9 edges
9. `senior-backend-engineer agent` - 9 edges
10. `vehicleRoutes()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `senior-backend-engineer agent` --references--> `CTO / car-assistant manager repo`  [EXTRACTED]
  .claude/agents/senior-backend-engineer.md → CLAUDE.md
- `senior-backend-engineer agent` --references--> `Use graphify first`  [EXTRACTED]
  .claude/agents/senior-backend-engineer.md → CLAUDE.md
- `Recipe: add a feature module` --implements--> `routes -> service -> repository flow`  [INFERRED]
  .claude/skills/backend-senior/SKILL.md → CLAUDE.md
- `Recipe: add a feature module` --references--> `zod validation via parseOrThrow`  [EXTRACTED]
  .claude/skills/backend-senior/SKILL.md → CLAUDE.md
- `In-memory fake repository` --conceptually_related_to--> `createApp / AppDependencies injection`  [INFERRED]
  .claude/skills/backend-senior/SKILL.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Backend agent guidance stack (agent + skill + CLAUDE.md)** — _claude_agents_senior_backend_engineer, _claude_skills_backend_senior_skill, claude [EXTRACTED 1.00]
- **Testable layered architecture via DI and fakes** — claude_layered_architecture, claude_createapp_dependency_injection, _claude_skills_backend_senior_skill_repository_interface, _claude_skills_backend_senior_skill_in_memory_fake_repository [INFERRED 0.85]
- **Prisma + MongoDB setup constraints** — claude_prisma_6_19_pin, _claude_skills_backend_senior_skill_db_push_no_migrate, docker_compose_mongo [INFERRED 0.85]

## Communities (11 total, 1 thin omitted)

### Community 0 - "Vehicle Repository Layer"
Cohesion: 0.14
Nodes (9): AppDependencies, PrismaVehicleRepository, VehicleRepository, vehicleRoutes(), VehicleService, CreateVehicleInput, UpdateVehicleInput, Vehicle (+1 more)

### Community 1 - "Runtime Dependencies"
Cohesion: 0.07
Nodes (27): author, dependencies, dotenv, express, @prisma/client, zod, description, engines (+19 more)

### Community 2 - "Backend Conventions & Agent"
Cohesion: 0.15
Nodes (23): senior-backend-engineer agent, Report-back API contract, TDD with Vitest/Supertest, backend-senior skill playbook, Prisma db push (no migrate for MongoDB), Error body and status code conventions, Recipe: add a feature module, In-memory fake repository (+15 more)

### Community 3 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, outDir, resolveJsonModule (+8 more)

### Community 4 - "Vehicle Service & Routes"
Cohesion: 0.22
Nodes (7): createVehicleSchema, currentYear, updateVehicleSchema, AppError, NotFoundError, ValidationError, parseOrThrow()

### Community 5 - "Bootstrap & Env"
Cohesion: 0.18
Nodes (9): prisma, Env, envSchema, loadEnv(), createPrismaClient(), app, env, prisma (+1 more)

### Community 6 - "Dev Tooling"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, @eslint/js, prettier, supertest, tsx, @types/express, @types/node (+4 more)

### Community 7 - "Claude Settings & Plugins"
Cohesion: 0.18
Nodes (10): enabledPlugins, mongodb@claude-plugins-official, typescript-lsp@claude-plugins-official, env, MDB_MCP_CONNECTION_STRING, MDB_MCP_READ_ONLY, permissions, allow (+2 more)

### Community 8 - "App Wiring & Error Handling"
Cohesion: 0.50
Nodes (4): createApp(), healthRoutes(), errorHandler(), notFoundHandler()

## Knowledge Gaps
- **69 isolated node(s):** `$schema`, `allow`, `deny`, `typescript-lsp@claude-plugins-official`, `mongodb@claude-plugins-official` (+64 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Dev Tooling` to `Runtime Dependencies`, `Bootstrap & Env`?**
  _High betweenness centrality (0.229) - this node is a cross-community bridge._
- **Why does `prisma` connect `Bootstrap & Env` to `Dev Tooling`?**
  _High betweenness centrality (0.204) - this node is a cross-community bridge._
- **What connects `$schema`, `allow`, `deny` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Vehicle Repository Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.13636363636363635 - nodes in this community are weakly interconnected._
- **Should `Runtime Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Backend Conventions & Agent` be split into smaller, more focused modules?**
  _Cohesion score 0.14855072463768115 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._