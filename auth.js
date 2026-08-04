import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { findUserByLogin, findExistingUser, createUser } from './db.js'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret'
const TOKEN_TTL = '7d'

// Never send the password hash back to the browser.
function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email }
}

function makeToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  )
}

// POST /api/auth/signup   body: { username, email, password }
router.post('/signup', async (req, res) => {
  const username = (req.body.username || '').trim()
  const email = (req.body.email || '').trim().toLowerCase()
  const password = req.body.password || ''

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are all required.' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }

  if (findExistingUser(username, email)) {
    return res.status(409).json({ error: 'That username or email is already taken.' })
  }

  const hash = await bcrypt.hash(password, 10)
  const user = createUser({ username, email, password: hash })

  return res.status(201).json({ accessToken: makeToken(user), user: publicUser(user) })
})

// POST /api/auth/signin   body: { login, password }   (login = username OR email)
router.post('/signin', async (req, res) => {
  const login = (req.body.login || '').trim()
  const password = req.body.password || ''

  if (!login || !password) {
    return res.status(400).json({ error: 'Please enter your login and password.' })
  }

  const user = findUserByLogin(login)

  // Same generic message whether the user doesn't exist or the password is
  // wrong — avoids revealing which usernames are registered.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials.' })
  }

  return res.json({ accessToken: makeToken(user), user: publicUser(user) })
})

export default router
