# Round Robin API


## Run PostgreSQL locally on macOS

Install PostgreSQL with Homebrew and start it as a background service:

```bash
brew install postgresql@16
brew services start postgresql@16
```

Create an application-specific database user and database:

```bash
psql postgres
```

Then run these commands in the `psql` prompt:

```sql
CREATE ROLE roundrobin WITH LOGIN PASSWORD 'password123';
CREATE DATABASE round_robin OWNER roundrobin;
\q
```

If PostgreSQL is not available, confirm/restart its service:

```bash
brew services list
brew services restart postgresql@16
```

## Local setup

1. Copy `.env.example` to `.env`, then configure it for the local database:

   ```env
   DATABASE_URL="postgresql://roundrobin:password123@localhost:5432/round_robin?schema=public"
   JWT_SECRET="replace-with-a-long-random-secret"
   CLIENT_ORIGIN="http://localhost:5173"
   PORT=3000
   ```

2. Generate Prisma's client and create tables directly from `schema.prisma`. This fresh-development setup does not create migration files:

   ```bash
   npm run prisma:generate
   npx prisma db push
   ```

3. Start the API:

   ```bash
   npm run dev
   ```

`GET http://localhost:3000/api/health` confirms the API is running.

## Authentication API

| Method | Route | Request body |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{ "username", "email", "password" }` |
| POST | `/api/auth/signin` | `{ "login", "password" }` |
| GET | `/api/auth/me` | `Authorization: Bearer <accessToken>` |

Sign-up/sign-in return `{ user, accessToken }`. The short-lived JWT contains only the user id in `sub`; group role and authorization should always be read from the database, so role changes take effect immediately.

## Client integration

The client login forms call the auth endpoints at `VITE_API_URL` (default: `http://localhost:3000`) and store the returned access token for the development milestone. Include `Authorization: Bearer ${token}` on protected calls. Before production, move to an httpOnly secure cookie with refresh-token rotation to reduce XSS exposure.
