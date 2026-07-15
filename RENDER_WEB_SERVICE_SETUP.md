# Service Map Atlas — two connected Render Web Services

Service Map Atlas uses **two separate Render Web Services** connected to the same Neon database.

- **Client Atlas service:** client credential checkpoint, worldwide service coverage map, tracked searches, and service requests.
- **Atlas Admin service:** the dark luminous administration panel for providers, requests, analytics, users, and invitations.

Neither service offers a user-facing choice between client and admin modes. Each Render URL opens only its intended experience.

Both services use the same GitHub repository and `main` branch, but different environment variables determine which application is built and which API routes are exposed.

## Shared Render settings

Use these settings for both services:

- **Service type:** Web Service
- **Runtime:** Node
- **Repository:** `Occumed79/Service-Map-Atlas`
- **Branch:** `main`
- **Root directory:** leave blank
- **Build command:**

  `pnpm install --frozen-lockfile && pnpm run build:render`

- **Start command:**

  `pnpm start`

- **Health check path:** `/api/health`

Render already provides `pnpm`. Do not run `corepack enable`.

## Service 1 — Client Atlas

Keep the existing Render service as the client-facing Atlas.

Environment variables:

- `NODE_ENV=production`
- `APP_MODE=client`
- `VITE_APP_MODE=client`
- `DATABASE_URL=<the Service-Map-Atlas Neon pooled connection string>`
- `SESSION_SECRET=<a client-service-specific long random value>`

Behavior:

- `/` opens the client credential checkpoint or authenticated Atlas.
- No admin navigation, admin route, provider directory, analytics panel, user management, or invitation management is included in the client router.
- Client searches are stored with authenticated user and employer attribution.
- Client map data remains sanitized and never returns provider identities or direct provider contacts.

## Service 2 — Atlas Admin

Create a second Render Web Service from the same repository and branch.

Environment variables:

- `NODE_ENV=production`
- `APP_MODE=admin`
- `VITE_APP_MODE=admin`
- `DATABASE_URL=<the exact same Service-Map-Atlas Neon pooled connection string>`
- `SESSION_SECRET=<a different admin-service-specific long random value>`

Behavior:

- `/` opens the separate Atlas Administration login.
- Successful authorized login opens the dark luminous admin panel.
- Only `admin` and `super_admin` accounts may enter.
- The admin service exposes provider, request, analytics, user, and invitation management APIs.
- The client map and its client-facing navigation are not exposed by the admin router.

## Neon connection

Both Render services intentionally connect to the same Neon database so that:

- providers entered in Atlas Admin become sanitized coverage areas in the Client Atlas;
- client searches appear in Atlas Admin analytics;
- client service requests appear in Atlas Admin requests;
- invitations created in Atlas Admin create client credentials for the Client Atlas;
- employer accounts connect client activity to the correct company.

## Important

Do not configure either application as a Render Static Site. Both require the Express API, PostgreSQL sessions, authentication, Neon queries, and server-side role enforcement.
