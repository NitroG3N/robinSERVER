require('dotenv').config()

const express = require('express')
const cors = require('cors')
const authRouter = require('./routes/auth')

const app = express()
const port = Number(process.env.PORT || 3000)
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(port, () => {
  console.log(`Round Robin API listening on http://localhost:${port}`)
})
