import { Router } from 'express'
import { sql } from '@vercel/postgres'
import { requireAuth } from './authMiddleware.js'

const router = Router()
router.use(requireAuth)

// Confirms the current user actually belongs to a room before letting them
// touch anything in it. Returns the room_id on success, or null (after
// sending a response) on failure.
async function requireMembership(req, res, roomId) {
  const { rows } = await sql`
    SELECT 1 FROM room_members WHERE room_id = ${roomId} AND user_id = ${req.user.id}
  `
  if (rows.length === 0) {
    res.status(403).json({ error: "You're not a member of this room." })
    return false
  }
  return true
}

// Looks up a chore and confirms the current user is a member of the room it
// belongs to. Returns the chore row on success, or null (after sending a
// response) on failure — so route handlers can just `if (!chore) return`.
async function loadOwnedChore(req, res, choreId) {
  const { rows } = await sql`SELECT * FROM chores WHERE id = ${choreId}`
  const chore = rows[0]
  if (!chore) {
    res.status(404).json({ error: 'Chore not found.' })
    return null
  }
  const ok = await requireMembership(req, res, chore.room_id)
  if (!ok) return null
  return chore
}

// Turns the raw DB rows (chore + its completions + its exclusions) into the
// shape the client already expects (see src/utils/chores.js on the client).
function shapeChores(choreRows, completionRows, exclusionRows) {
  const completionsByChore = {}
  for (const row of completionRows) {
    ;(completionsByChore[row.chore_id] ||= {})[row.date_key] = new Date(row.completed_at).getTime()
  }
  const exclusionsByChore = {}
  for (const row of exclusionRows) {
    ;(exclusionsByChore[row.chore_id] ||= []).push(row.date_key)
  }

  return choreRows.map((c) => {
    const completedDates = completionsByChore[c.id] || {}
    return {
      id: c.id,
      task: c.task,
      points: c.points,
      date: c.date, // already formatted as 'YYYY-MM-DD' by the query below
      recurring: c.recurring,
      intervalDays: c.interval_days,
      origin: c.origin,
      addedBy: c.added_by_username,
      claimedBy: c.claimed_by_username,
      addedById: c.added_by,
      claimedById: c.claimed_by,
      excludedDates: exclusionsByChore[c.id] || [],
      completedDates,
      // For a one-off (non-recurring) chore, "completed" means its single
      // date has a completion entry.
      completedAt: !c.recurring && c.date ? completedDates[c.date] || null : null,
    }
  })
}

// GET /api/chores?roomId=123
router.get('/', async (req, res) => {
  const roomId = Number(req.query.roomId)
  if (!Number.isInteger(roomId)) {
    return res.status(400).json({ error: 'A valid roomId is required.' })
  }
  const ok = await requireMembership(req, res, roomId)
  if (!ok) return

  const { rows: choreRows } = await sql`
    SELECT
      chores.*,
      to_char(chores.date, 'YYYY-MM-DD') AS date,
      added.username AS added_by_username,
      claimed.username AS claimed_by_username
    FROM chores
    JOIN users added ON added.id = chores.added_by
    LEFT JOIN users claimed ON claimed.id = chores.claimed_by
    WHERE chores.room_id = ${roomId}
    ORDER BY chores.created_at ASC
  `

  const { rows: completionRows } = await sql`
    SELECT chore_completions.* FROM chore_completions
    JOIN chores ON chores.id = chore_completions.chore_id
    WHERE chores.room_id = ${roomId}
  `
  const { rows: exclusionRows } = await sql`
    SELECT chore_exclusions.* FROM chore_exclusions
    JOIN chores ON chores.id = chore_exclusions.chore_id
    WHERE chores.room_id = ${roomId}
  `

  return res.json({ chores: shapeChores(choreRows, completionRows, exclusionRows) })
})

// POST /api/chores   body: { roomId, task, points, date, recurring, intervalDays, origin }
// origin: 'calendar' (added straight to the calendar, visible to everyone
// immediately) or 'board' (posted to the Claim Board, unclaimed and
// invisible on the calendar until someone claims it).
router.post('/', async (req, res) => {
  const roomId = Number(req.body.roomId)
  const task = (req.body.task || '').trim()
  const points = Number(req.body.points) || 0
  const date = req.body.date || null
  const recurring = Boolean(req.body.recurring)
  const intervalDays = recurring ? Number(req.body.intervalDays) || 1 : null
  const origin = req.body.origin === 'calendar' ? 'calendar' : 'board'

  if (!Number.isInteger(roomId) || !task) {
    return res.status(400).json({ error: 'A room and a chore name are required.' })
  }
  const ok = await requireMembership(req, res, roomId)
  if (!ok) return

  const { rows } = await sql`
    INSERT INTO chores (room_id, task, points, date, recurring, interval_days, origin, added_by)
    VALUES (${roomId}, ${task}, ${points}, ${date}, ${recurring}, ${intervalDays}, ${origin}, ${req.user.id})
    RETURNING id
  `

  const { rows: fresh } = await sql`
    SELECT chores.*, to_char(chores.date, 'YYYY-MM-DD') AS date,
           added.username AS added_by_username, NULL AS claimed_by_username
    FROM chores JOIN users added ON added.id = chores.added_by
    WHERE chores.id = ${rows[0].id}
  `
  return res.status(201).json({ chore: shapeChores(fresh, [], [])[0] })
})

// POST /api/chores/:id/claim
router.post('/:id/claim', async (req, res) => {
  const chore = await loadOwnedChore(req, res, Number(req.params.id))
  if (!chore) return
  if (chore.claimed_by) {
    return res.status(409).json({ error: 'Someone already claimed this chore.' })
  }

  await sql`UPDATE chores SET claimed_by = ${req.user.id} WHERE id = ${chore.id}`
  return res.json({ ok: true })
})

// POST /api/chores/:id/unclaim
router.post('/:id/unclaim', async (req, res) => {
  const chore = await loadOwnedChore(req, res, Number(req.params.id))
  if (!chore) return
  if (chore.claimed_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only unclaim chores you claimed.' })
  }

  await sql`UPDATE chores SET claimed_by = NULL WHERE id = ${chore.id}`
  return res.json({ ok: true })
})

// POST /api/chores/:id/schedule   body: { date }
// Assigns a date to a claimed-but-undated ("loose") chore.
router.post('/:id/schedule', async (req, res) => {
  const chore = await loadOwnedChore(req, res, Number(req.params.id))
  if (!chore) return
  const date = req.body.date
  if (!date) {
    return res.status(400).json({ error: 'A date is required.' })
  }

  await sql`UPDATE chores SET date = ${date} WHERE id = ${chore.id}`
  return res.json({ ok: true })
})

// POST /api/chores/:id/complete   body: { dateKey }
router.post('/:id/complete', async (req, res) => {
  const chore = await loadOwnedChore(req, res, Number(req.params.id))
  if (!chore) return
  const dateKey = req.body.dateKey
  if (!dateKey) {
    return res.status(400).json({ error: 'A dateKey is required.' })
  }

  await sql`
    INSERT INTO chore_completions (chore_id, date_key)
    VALUES (${chore.id}, ${dateKey})
    ON CONFLICT (chore_id, date_key) DO NOTHING
  `
  return res.json({ ok: true })
})

// POST /api/chores/:id/exclude   body: { dateKey }
// Removes a single occurrence of a (usually recurring) chore without
// completing it or deleting the whole series.
router.post('/:id/exclude', async (req, res) => {
  const chore = await loadOwnedChore(req, res, Number(req.params.id))
  if (!chore) return
  const dateKey = req.body.dateKey
  if (!dateKey) {
    return res.status(400).json({ error: 'A dateKey is required.' })
  }

  await sql`
    INSERT INTO chore_exclusions (chore_id, date_key)
    VALUES (${chore.id}, ${dateKey})
    ON CONFLICT (chore_id, date_key) DO NOTHING
  `
  return res.json({ ok: true })
})

// DELETE /api/chores/:id
router.delete('/:id', async (req, res) => {
  const chore = await loadOwnedChore(req, res, Number(req.params.id))
  if (!chore) return

  await sql`DELETE FROM chores WHERE id = ${chore.id}`
  return res.json({ ok: true })
})

export default router
