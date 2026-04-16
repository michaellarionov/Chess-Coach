# Claude Backend Proxy Setup

This project now expects Claude requests to go through a backend endpoint:

- `POST /api/anthropic/messages`

## Local development

1. Copy `.env.backend.example` to `.env.backend` (or `.env`) and set `ANTHROPIC_API_KEY`.
2. Start backend:
   - `npm run api:dev`
3. Start frontend in another terminal:
   - `npm run dev`

In dev, Vite proxies `/api/anthropic/*` to `http://localhost:8787`.

## Production deployment

You must deploy the backend separately (Render, Railway, Fly.io, etc.) because GitHub Pages is static-only.

1. Deploy `backend/server.js` as a Node service.
2. Set backend env vars:
   - `ANTHROPIC_API_KEY=<your key>`
   - `CORS_ORIGINS=https://<your-user>.github.io`
3. In your frontend deployment env, set:
   - `VITE_API_BASE_URL=https://<your-backend-domain>`
4. Rebuild/redeploy frontend so the new env var is baked in.

## Security notes

- Do not put Anthropic keys in `VITE_*` vars for production.
- Add auth + per-user rate limiting before opening to public traffic.
