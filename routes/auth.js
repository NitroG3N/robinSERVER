const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Prisma } = require('@prisma/client')
const prisma = require('../lib/prisma')

const router = express.Router()
const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret) {
  throw new Error('JWT_SECRET must be set. Copy .env.example to .env and set a secure secret.')
}

const publicUser = ({ id, username, email, createdAt }) => ({ id, username, email, createdAt })

const signAccessToken = (userId) => jwt.sign(
  { sub: userId },
  jwtSecret,
  { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
)

function requireAuth(req, res, next) {
  const authorization = req.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) return res.status(401).json({ error: 'Authentication required.' })

  try {
    const payload = jwt.verify(token, jwtSecret)
    req.userId = payload.sub
    return next()
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }
}

router.post('/signup', async (req, res, next) => {
  try {
    const username = req.body.username?.trim()
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' })
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 3–30 characters.' })
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { username, email, passwordHash },
    })

    return res.status(201).json({ user: publicUser(user), accessToken: signAccessToken(user.id) })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'That username or email is already in use.' })
    }
    return next(error)
  }
})

router.post('/signin', async (req, res, next) => {
  try {
    const login = req.body.login?.trim()
    const password = req.body.password

    if (!login || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' })
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: login.toLowerCase() },
          { username: login },
        ],
      },
    })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username/email or password.' })
    }

    return res.json({ user: publicUser(user), accessToken: signAccessToken(user.id) })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) return res.status(401).json({ error: 'Account not found.' })
    return res.json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
