# Occu-Med Global Coverage Atlas

A premium enterprise-grade global medical service coverage platform — interactive map atlas for occupational health providers, with invite-based auth, full admin system, and search analytics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path `/api`)
- `pnpm --filter @workspace/occu-med run dev` — run the frontend (port 18353, path `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — express-session secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, react-leaflet (v5), Leaflet, Tailwind CSS, shadcn/ui, Framer Motion, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `lib/api-client-react`)
- Sessions: express-session + connect-pg-simple
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — DB schema (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for all API shapes)
- `lib/api-client-react/src/generated/` — generated React Query hooks + Zod schemas (do not edit)
- `artifacts/occu-med/src/` — React frontend
  - `pages/home.tsx` — main map page
  - `pages/login.tsx` — login page
  - `pages/accept-invite.tsx` — invitation acceptance
  - `pages/admin/` — all admin sub-pages
  - `lib/auth.tsx` — AuthProvider + useAuth hook
  - `components/admin-layout.tsx` — admin sidebar layout
- `artifacts/api-server/src/routes/` — all API route handlers

## Architecture decisions

- **OpenAPI-first**: all API shapes defined in `lib/api-spec/openapi.yaml`, code generated from it. Never hand-write API types.
- **Session auth**: express-session stored in PostgreSQL via connect-pg-simple; no JWT.
- **react-leaflet v5**: do NOT install `react-leaflet-cluster` (requires v4). Markers are rendered plain without clustering.
- **Deep imports forbidden**: import types from `@workspace/api-client-react` root, never from `/src/generated/api.schemas` subpath.
- **No console.log in server**: use `req.log` in handlers, singleton `logger` elsewhere.

## Product

- **Home map**: dark globe view with glowing teal provider markers; search by location, filter by service category, click markers for popup with "Request Service" CTA.
- **Service request modal**: anyone can submit a coordination request (no login required).
- **Admin panel** (`/admin`): dashboard, provider management, service requests, search analytics, user management, invitation management.
- **Invite-only registration**: users can only join via emailed invitation link.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `react-leaflet-cluster` conflicts with react-leaflet v5 — do not install it.
- Generated hooks (`useGetMe`, `useGetInvitation`) require `queryKey` in their query options — always include it.
- Import types from `@workspace/api-client-react` root, not from the deep `/src/generated/` subpath.
- DB push command: `pnpm --filter @workspace/db run push` (from workspace root).

## Seed / Demo Data

- Admin login: `admin@occumed.com` / `Admin1234!`
- 46 active provider locations in DB (US + international: London, Sydney, Frankfurt, Singapore, Mexico City, Toronto)
- 17 service categories seeded

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
