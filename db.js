import { sql } from '@vercel/postgres'

// Real persistence via Postgres (Neon, connected through Vercel). Replaces
// the old JSON-file approach, which couldn't survive Vercel's read-only
// filesystem or handle multiple users reliably.
//
// Note: every function here is now async (real network calls to the
// database), so every call site needs an `await` — see auth.js and rooms.js.

// Case-insensitive lookup by username OR email (used at sign-in).
export async function findUserByLogin(login) {
  const { rows } = await sql`
    SELECT * FROM users
    WHERE lower(username) = lower(${login}) OR lower(email) = lower(${login})
    LIMIT 1
  `
  return rows[0] || null
}

// Used at sign-up to check whether the username OR email is already taken.
export async function findExistingUser(username, email) {
  const { rows } = await sql`
    SELECT * FROM users
    WHERE lower(username) = lower(${username}) OR lower(email) = lower(${email})
    LIMIT 1
  `
  return rows[0] || null
}

export async function createUser({ username, email, password }) {
  const { rows } = await sql`
    INSERT INTO users (username, email, password)
    VALUES (${username}, ${email}, ${password})
    RETURNING *
  `
  return rows[0]
}

// Looks a user up by id — used by the auth middleware to attach the current
// user to each request based on their JWT.
export async function findUserById(id) {
  const { rows } = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}
