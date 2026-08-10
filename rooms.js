import { Router } from 'express'
import { sql } from '@vercel/postgres'
import { requireAuth } from './authMiddleware.js'

const router = Router()

// Every route below runs requireAuth first, so req.user is always the
// logged-in user making the request — never trust a userId from the body.
router.use(requireAuth)

// Matches the "123 456" format the client already displays.
function generateInviteCode() {
  const a = Math.floor(100 + Math.random() * 900)
  const b = Math.floor(100 + Math.random() * 900)
  return `${a} ${b}`
}

// Tries random codes until it finds one not already in use. Astronomically
// unlikely to loop more than once or twice, but guards against the rare
// collision instead of assuming it can't happen.
async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode()
    const { rows } = await sql`SELECT 1 FROM rooms WHERE invite_code = ${code}`
    if (rows.length === 0) return code
  }
  throw new Error('Could not generate a unique invite code, please try again.')
}

// POST /api/rooms   body: { name }
// Creates a new room owned by the current user, and adds them as its first
// member. Returns the room including its real, database-backed invite code.
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim()
  if (!name) {
    return res.status(400).json({ error: 'A room name is required.' })
  }

  try {
    const inviteCode = await generateUniqueInviteCode()

    const { rows } = await sql`
      INSERT INTO rooms (name, invite_code, owner_id)
      VALUES (${name}, ${inviteCode}, ${req.user.id})
      RETURNING *
    `
    const room = rows[0]

    await sql`
      INSERT INTO room_members (room_id, user_id)
      VALUES (${room.id}, ${req.user.id})
    `

    return res.status(201).json({ room })
  } catch (err) {
    console.error('Failed to create room:', err)
    return res.status(500).json({ error: 'Could not create the room. Please try again.' })
  }
})

// POST /api/rooms/join   body: { code }
// Looks up a room by its invite code and adds the current user as a member.
router.post('/join', async (req, res) => {
  const code = (req.body.code || '').trim()
  if (!code) {
    return res.status(400).json({ error: 'An invite code is required.' })
  }

  const { rows } = await sql`SELECT * FROM rooms WHERE invite_code = ${code}`
  const room = rows[0]

  if (!room) {
    return res.status(404).json({ error: 'No room found with that invite code.' })
  }

  // ON CONFLICT DO NOTHING: joining a room you're already in just succeeds
  // quietly instead of erroring, since the end result the user wants
  // ("I'm in this room") is already true.
  await sql`
    INSERT INTO room_members (room_id, user_id)
    VALUES (${room.id}, ${req.user.id})
    ON CONFLICT (room_id, user_id) DO NOTHING
  `

  return res.json({ room })
})

// GET /api/rooms/mine
// Lists every room the current user belongs to (owned or joined).
router.get('/mine', async (req, res) => {
  const { rows } = await sql`
    SELECT rooms.* FROM rooms
    JOIN room_members ON room_members.room_id = rooms.id
    WHERE room_members.user_id = ${req.user.id}
    ORDER BY rooms.created_at ASC
  `
  return res.json({ rooms: rows })
})

export default router
