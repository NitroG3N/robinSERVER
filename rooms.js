import { Router } from 'express'
import { sql } from '@vercel/postgres'
import { requireAuth } from './authMiddleware.js'

const router = Router()

// Every route below runs requireAuth first, so req.user is always the logged in user making the request
router.use(requireAuth)

// Matches the "123 456" format the client already displays.
function generateInviteCode() {
  const a = Math.floor(100 + Math.random() * 900)
  const b = Math.floor(100 + Math.random() * 900)
  return `${a} ${b}`
}

// Tries random codes until it finds one not already in use.
async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode()
    const { rows } = await sql`SELECT 1 FROM rooms WHERE invite_code = ${code}`
    if (rows.length === 0) return code
  }
  throw new Error('Could not generate a unique invite code, please try again.')
}

// POST /api/rooms   body: { name }
// Creates a new room owned by the current user, and adds them as its first member 
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

  // ON CONFLICT DO NOTHING
  await sql`
    INSERT INTO room_members (room_id, user_id)
    VALUES (${room.id}, ${req.user.id})
    ON CONFLICT (room_id, user_id) DO NOTHING
  `

  return res.json({ room })
})

// POST /api/rooms/:id/regenerate-code
// Issues a new invite code for a room, invalidating the old one. Only the room owner can do this
router.post('/:id/regenerate-code', async (req, res) => {
  const roomId = Number(req.params.id)
  if (!Number.isInteger(roomId)) {
    return res.status(400).json({ error: 'Invalid room id.' })
  }

  const { rows: roomRows } = await sql`SELECT * FROM rooms WHERE id = ${roomId}`
  const room = roomRows[0]

  if (!room) {
    return res.status(404).json({ error: 'Room not found.' })
  }
  if (room.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the group owner can regenerate the invite code.' })
  }

  try {
    const newCode = await generateUniqueInviteCode()
    const { rows } = await sql`
      UPDATE rooms SET invite_code = ${newCode} WHERE id = ${roomId} RETURNING *
    `
    return res.json({ room: rows[0] })
  } catch (err) {
    console.error('Failed to regenerate invite code:', err)
    return res.status(500).json({ error: 'Could not regenerate the code. Please try again.' })
  }
})

router.get('/:id/members', async (req, res) => {
  const roomId = Number(req.params.id)
  if (!Number.isInteger(roomId)) {
    return res.status(400).json({ error: 'Invalid room id.' })
  }

  const { rows: membership } = await sql`
    SELECT 1 FROM room_members WHERE room_id = ${roomId} AND user_id = ${req.user.id}
  `
  if (membership.length === 0) {
    return res.status(403).json({ error: "You're not a member of this room." })
  }

  const { rows } = await sql`
    SELECT users.id, users.username FROM room_members
    JOIN users ON users.id = room_members.user_id
    WHERE room_members.room_id = ${roomId}
    ORDER BY room_members.joined_at ASC
  `
  return res.json({ members: rows })
})


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
