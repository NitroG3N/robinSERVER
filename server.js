import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import authRouter from './auth.js'
import roomsRouter from './rooms.js'
import choresRouter from './chores.js'
import tradesRouter from './trades.js'

// Local values live in the ignored .env.local file. In Vercel, its dashboard
// provides process.env values and dotenv does not overwrite them.
dotenv.config({ path: '.env.local' })

const app = express()
const PORT = process.env.PORT || 3000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'https://rrobin-client-git-main-rrobin.vercel.app'

// Allow the deployed React client to call this API.
app.use(cors({ origin: CLIENT_ORIGIN }))
app.use(express.json())

// Quick way to check the server is alive: open http://localhost:3000/api/health
app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/chores', choresRouter)
app.use('/api/trades', tradesRouter)

// Vercel runs this file as a serverless function and calls the exported
// app directly for each request — it never calls app.listen(). Only start
// a real listener when running locally (or on a non-Vercel host).
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Round Robin API running on http://localhost:${PORT}`)
  })
}

export default app
