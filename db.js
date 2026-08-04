import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

// A tiny JSON-file "database" — no native code, works on any Node version.
// Everything is stored in data.json next to the server. Fine for a dev
// milestone; swap for a real database (Postgres, SQLite, etc.) later.
// Resolve relative to this module, rather than the Vercel function's working directory.
const DB_FILE = fileURLToPath(new URL('./data.json', import.meta.url))

function load() {
  if (!existsSync(DB_FILE)) return { users: [], nextId: 1 }
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf8'))
  } catch {
    return { users: [], nextId: 1 }
  }
}

function save(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2))
}

const data = load()

// Case-insensitive lookup by either username or email (used at sign-in).
export function findUserByLogin(login) {
  const l = String(login).toLowerCase()
  return data.users.find(
    (u) => u.username.toLowerCase() === l || u.email.toLowerCase() === l
  )
}

// Used at sign-up to check whether the username OR email is already taken.
export function findExistingUser(username, email) {
  const un = String(username).toLowerCase()
  const em = String(email).toLowerCase()
  return data.users.find(
    (u) => u.username.toLowerCase() === un || u.email.toLowerCase() === em
  )
}

export function createUser({ username, email, password }) {
  const user = {
    id: data.nextId++,
    username,
    email,
    password, // already hashed by the caller
    created_at: new Date().toISOString(),
  }
  data.users.push(user)
  save(data)
  return user
}
