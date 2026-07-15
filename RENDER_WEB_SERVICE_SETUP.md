# Render deployment — Web Service only

Service Map Atlas must run as a **Render Web Service**, not as a Static Site.

The Express server now serves both:

- the `/api/*` backend routes
- the built React Atlas frontend

## Render settings

- **Service type:** Web Service
- **Runtime:** Node
- **Repository:** `Occumed79/Service-Map-Atlas`
- **Branch:** `main`
- **Root directory:** leave blank
- **Build command:**

  `pnpm install --frozen-lockfile && pnpm run build:render`

  Render's Node environment already provides `pnpm`. Do not run `corepack enable`; it attempts to replace `/usr/bin/pnpm` and fails because that filesystem path is read-only.

- **Start command:**

  `pnpm start`

- **Health check path:** `/api/health`

## Required environment variables

- `NODE_ENV=production`
- `DATABASE_URL=<Neon pooled connection string>`
- `SESSION_SECRET=<long random secret>`

`FRONTEND_URL` should normally be omitted because the frontend and API are served from the same Render Web Service. Set it only when intentionally allowing a separate trusted frontend origin.

## Important

Do not configure this repository as a Render Static Site. A Static Site can display a compiled frontend, but it cannot correctly host the Express API, session authentication, Neon-backed admin tools, search analytics, or service-request workflow contained in this application.
