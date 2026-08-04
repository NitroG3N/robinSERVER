# Round Robin API


## Current user-testing storage

For this user-testing milestone, accounts are stored locally in `data.json` through `db.js`; Prisma and PostgreSQL are not active in the current server. This is appropriate only while running the API on a persistent local machine.

## Configuration

The server loads its local configuration from the ignored `.env.local` file. `.env.local.example` is the safe template to copy if that file is missing:

```bash
cp .env.local.example .env.local
```

For Vercel, do not upload `.env.local`. Instead, set the values in `.env.production.example` as the API project's Vercel Environment Variables, using a real unique `JWT_SECRET`, then redeploy. `JWT_SECRET` must remain secret; it protects the validity of login tokens.

Start the API:

   ```bash
   npm run dev
   ```

`GET http://localhost:3000/api/health` confirms the API is running.

The local server defaults to port `3000`; setting `PORT` is optional. Do not set `PORT` in Vercel, which supplies the port automatically.

## Authentication API

| Method | Route | Request body |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{ "username", "email", "password" }` |
| POST | `/api/auth/signin` | `{ "login", "password" }` |
| GET | `/api/auth/me` | `Authorization: Bearer <accessToken>` |

Sign-up/sign-in return `{ user, accessToken }`. Passwords are hashed before they are written to `data.json`.

## Deployment note

`data.json` is explicitly packaged with the Vercel function and read at runtime for the current test setup. It can supply pre-seeded accounts such as `anbu` / `testing123`, but Vercel file writes are not durable, so do not rely on deployed sign-ups persisting.

## Client integration

Vite automatically loads `.env.development` for `npm run dev` and `.env.production` for a production build. The client therefore uses `http://localhost:3000` locally and `https://rrobin-server-git-main-rrobin.vercel.app` in Vercel production. Include `Authorization: Bearer ${token}` on protected calls.
