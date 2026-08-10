import jwt from 'jsonwebtoken'
import { findUserById } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret'

// Protects a route: requires a valid "Authorization: Bearer <token>" header
// (the accessToken your client got back from /signup or /signin). On success,
// attaches the logged-in user as req.user for the route handler to use.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'You must be signed in.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await findUserById(payload.sub)
    if (!user) {
      return res.status(401).json({ error: 'Your session is no longer valid.' })
    }
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }
}
