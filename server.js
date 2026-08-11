import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import authRouter from './auth.js'
import roomsRouter from './rooms.js'
import choresRouter from './choreRoutes.js'
import tradesRouter from './trades.js'

// Local values live in the ignored .env.local file.
dotenv.config({ path: '.env.local' })

const app = express()
const PORT = process.env.PORT || 3000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'https://rrobin-client-git-main-rrobin.vercel.app'


app.use(cors({ origin: CLIENT_ORIGIN }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/chores', choresRouter)
app.use('/api/trades', tradesRouter)


if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Round Robin API running on http://localhost:${PORT}`)
  })
}

export default app
