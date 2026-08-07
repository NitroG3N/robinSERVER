import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { fileURLToPath } from 'url'

// A tiny JSON-file "database" — no native code, works on any Node version.
// Fine for local dev, but NOT fine as a long-term Vercel solution: see the
// warning below. Swap for a real database (Postgres, SQLite/Turso, Vercel
// KV, etc.) when you get a chance.

const SOURCE_FILE = fileURLToPath(new URL('./data.json', import.meta.url))

// Vercel's deployed filesystem is READ-ONLY except for /tmp. Writing to the
// original data.json path on Vercel throws EROFS and crashes the request.
// As a stopgap, we write to /tmp instead when running on Vercel so sign-up
// doesn't 500. IMPORTANT: /tmp is wiped between deployments and is not
// guaranteed to be shared across serverless function instances, so data
// saved this way is NOT reliably persistent in production. This unblocks
// local dev and testing, but you'll want a real database before relying on
// this for actual users.
const DB_FILE = process.env.VERCEL ? '/tmp/data.json' : SOURCE_FILE

function ensureTmpSeeded() {
  if (process.env.VERCEL && !existsSync(DB_FILE) && existsSync(SOURCE_FILE)) {
    try {
      copyFileSync(SOURCE_FILE, DB_FILE)
    } catch {
      // ignore — load() below will fall back to an empty db
    }
  }
}

function load() {
  ensureTmpSeeded()
  if (!existsSync(DB_FILE)) return { users: [], nextId: 1 }
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf8'))
  } catch {
    return { users: [], nextId: 1 }
  }
}

function save(data) {
  try {
    writeFileSync(DB_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('Failed to persist data.json:', err)
  }
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
