import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRouter from './auth.js'

const app = express()
const PORT = process.env.PORT || 3000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

// Allow the Vite dev server (on port 5173) to call this API.
app.use(cors({ origin: CLIENT_ORIGIN }))
app.use(express.json())

// Quick way to check the server is alive: open http://localhost:3000/api/health
app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)

app.listen(PORT, () => {
  console.log(`Round Robin API running on http://localhost:${PORT}`)
})
