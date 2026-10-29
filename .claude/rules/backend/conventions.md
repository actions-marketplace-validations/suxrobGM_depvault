---
description: Backend conventions for Elysia.js API development
paths: [apps/backend/src/**]
---

# Backend Conventions

## Folder Structure

```text
src/
├── app.ts              # Elysia bootstrap, plugin + controller registration
├── env.ts              # Environment config with TypeBox validation
├── common/
│   ├── di/             # tsyringe container
│   ├── errors/         # HttpError classes (400, 401, 403, 404, 409)
│   ├── middleware/      # auth guard, role guard, project guard, error handler
│   ├── plugins/        # swagger + cors Elysia plugins
│   ├── utils/          # password, logger, date, billing helpers
│   ├── services/       # email service
│   └── database/       # Prisma client singleton with pg adapter
├── modules/            # Feature modules (domain-driven)
│   └── vault/          # E2E encryption key management
├── jobs/               # Background/scheduled tasks
├── types/              # Shared Elysia schemas (pagination, request, response)
└── constants/
```

## Module Pattern

- 3-file core: `controller.ts`, `service.ts`, `schema.ts`
- Optional: `repository.ts` (complex queries), `mapper.ts` (response mapping), `ws.ts` (WebSocket)
- Every module exports an Elysia plugin, registered in `src/app.ts`. Modules have no `index.ts`; import the concrete file (`@/modules/auth/auth.controller`)

## DI Pattern

- Services: `@singleton()` or `@injectable()` class, constructor-injects `PrismaClient`. Injected classes must be **value** imports (`emitDecoratorMetadata`), so Biome's `useImportType` is off for the whole backend; `verbatimModuleSyntax` still makes tsc require `import type` for pure types
- Repositories: `@singleton()` class with pure Prisma queries
- Controllers: resolve service via `container.resolve(ServiceClass)`

## Error Handling

- Throw from services: `NotFoundError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`; plan limits throw `PlanLimitError` (a 403 tagged `reason: "PLAN_LIMIT"` + `X-Error-Reason` header)
- Never throw raw `Error`. Use typed HTTP errors from `common/errors/`

## Auth & Guards

- Auth guard: `.use(authGuard)` verifies JWT, injects `user` and `clientIp` (from `withClientIp`; public routes use that plugin directly)
- Role guard: `.use(roleGuard("ADMIN"))` checks system role
- Project role: `.use(authGuard)` then `{ projectRole: "EDITOR" }` in a route's options checks membership of `params.id` + minimum role (non-members get 404), injects `projectMember`. Ownership is the OWNER membership; there is no `Project.ownerId`
- Rate limit: `.use(rateLimiter)` then `{ rateLimit: { max: 5, windowMs: HOUR_MS } }` in a route's options; counted per route template + client IP. It runs at `transform`, so a guard that should not skip the count must use `resolve`, not `derive` (see `ciTokenGuard`)
- Public endpoints: only `/auth/register`, `/auth/login`, `/auth/github`, `/auth/github/callback`

## Schemas

- TypeBox (`t.*`) for all request/response validation; group type aliases at end of file
- All service return types declared in `.schema.ts`, no inline object types

## Testing

- Bun's test runner (`bun test`). Unit-test services with a mocked PrismaClient; integration-test endpoints via Elysia's `.handle()`
- Co-locate as `{module}.service.test.ts` / `{module}.controller.test.ts`
- Naming: `describe("ServiceName")` → `describe("methodName")` → `it("should ...")`
