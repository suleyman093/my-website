# Mueyyensayt

Mueyyensayt is a multiplayer geography game with parties, regular mode, team duel, chat, shared match state, server-backed auth, and persistent multiplayer storage.

## Local development

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start the API server:

```powershell
npm run server
```

3. In a second terminal, start Vite:

```powershell
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173).

## Production-style local run

This builds the frontend and serves the built app from the Node server:

```powershell
npm run serve:prod
```

Then open [http://localhost:8787](http://localhost:8787).

## Environment variables

- `PORT`: API/server port. Default: `8787`
- `NODE_ENV`: `development` or `production`
- `APP_ORIGIN`: comma-separated allowed frontend origins for CORS in dev or split deployments
- `PUBLIC_BASE_URL`: public URL for the Node server, used in logs/health metadata
- `DB_PATH`: SQLite database file path for local fallback. Default: `server/data/app.sqlite`
- `DATABASE_URL`: Postgres connection string for permanent hosted storage
- `GOOGLE_MAPS_API_KEY`: server-side key used for random Street View round generation
- `VITE_API_PROXY_TARGET`: Vite dev proxy target for `/api`
- `VITE_GOOGLE_MAPS_API_KEY`: frontend key used by Google Maps / Street View in the browser
- `COOKIE_SAME_SITE`: cookie SameSite policy, usually `Lax` or `None`
- `COOKIE_SECURE`: `true` when cookies should require HTTPS
- `PGSSLMODE`: use `require` in production Postgres deployments if needed

## Health checks

- `GET /api/health`
- `GET /api/ready`

`/api/ready` returns `503` when production-critical config is unsafe or incomplete, such as:
- missing `APP_ORIGIN` in production
- insecure cookie settings in production
- missing built frontend assets in production
- unhealthy database state

## Storage model

- Local development defaults to SQLite via `DB_PATH`.
- If `DATABASE_URL` is set, the server switches to Postgres-backed persistence automatically.
- Existing legacy JSON files are migrated on first boot when the target database is empty.

## Deployment notes

- In production, the Node server can serve the built frontend from `dist/`.
- Session auth is cookie-based.
- Party matches generate hidden round plans on the server using Street View metadata when `GOOGLE_MAPS_API_KEY` is configured.
- If you later split frontend and backend onto different origins, set `APP_ORIGIN` accordingly and usually use `COOKIE_SAME_SITE=None` with `COOKIE_SECURE=true`.
- The server performs startup/runtime checks and will log warnings or errors for unsafe production config.

## Render deployment

This repo includes [render.yaml](/C:/Users/Suleyman/my-website/render.yaml) for a Render Blueprint deployment with:
- one Node web service
- one Render Postgres database
- no persistent disk requirement

Before deploying on Render:
1. Push the repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Set these secret env vars during creation:
   - `GOOGLE_MAPS_API_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `PUBLIC_BASE_URL`
   - `APP_ORIGIN`
4. Let Render provision the `mueyyensayt-db` Postgres database and inject `DATABASE_URL` automatically.

Important:
- This is the recommended permanent storage path on Render if you do not want a persistent disk.
- Local SQLite remains available for development and fallback.

## Docker

Build and run:

```powershell
docker build -t mueyyensayt .
docker run -p 8787:8787 --env-file .env mueyyensayt
```
