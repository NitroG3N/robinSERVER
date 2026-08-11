import { sql } from '@vercel/postgres'
// filesystem or handle multiple users reliably. I USED AI TO HELP ME WITH THIS 
export async function findUserByLogin(login) {
  const { rows } = await sql`
    SELECT * FROM users
    WHERE lower(username) = lower(${login}) OR lower(email) = lower(${login})
    LIMIT 1
  `
  return rows[0] || null
}

// used at sign up to check whether the username/ email is already taken.
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

// Looks a user up by id, used by the auth middleware to attach the current user to each request based on their JWT.
export async function findUserById(id) {
  const { rows } = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}
