import { Router } from 'express'
import { sql } from '@vercel/postgres'
import { requireAuth } from './authMiddleware.js'

const router = Router()
router.use(requireAuth)

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

// chore "owner" for trading purposes 
function ownerIdOf(chore) {
  if (chore.claimed_by) return chore.claimed_by
  if (chore.origin === 'calendar') return chore.added_by
  return null
}

function shapeTrade(row) {
  return {
    id: row.id,
    status: row.status,
    proposer: { id: row.proposer_id, username: row.proposer_username },
    recipient: { id: row.recipient_id, username: row.recipient_username },
    proposerChore: {
      id: row.proposer_chore_id,
      task: row.proposer_task,
      points: row.proposer_points,
      date: row.proposer_date,
      recurring: row.proposer_recurring,
      intervalDays: row.proposer_interval_days,
    },
    recipientChore: {
      id: row.recipient_chore_id,
      task: row.recipient_task,
      points: row.recipient_points,
      date: row.recipient_date,
      recurring: row.recipient_recurring,
      intervalDays: row.recipient_interval_days,
    },
  }
}

// GET /api/trades?roomId=123
// Every pending trade in this room that involves the current user, either
// as the proposer or the recipient.
router.get('/', async (req, res) => {
  const roomId = Number(req.query.roomId)
  if (!Number.isInteger(roomId)) {
    return res.status(400).json({ error: 'A valid roomId is required.' })
  }
  const ok = await requireMembership(req, res, roomId)
  if (!ok) return

  const { rows } = await sql`
    SELECT
      trades.*,
      to_char(pc.date, 'YYYY-MM-DD') AS proposer_date,
      pc.task AS proposer_task, pc.points AS proposer_points,
      pc.recurring AS proposer_recurring, pc.interval_days AS proposer_interval_days,
      to_char(rc.date, 'YYYY-MM-DD') AS recipient_date,
      rc.task AS recipient_task, rc.points AS recipient_points,
      rc.recurring AS recipient_recurring, rc.interval_days AS recipient_interval_days,
      pu.username AS proposer_username,
      ru.username AS recipient_username
    FROM trades
    JOIN chores pc ON pc.id = trades.proposer_chore_id
    JOIN chores rc ON rc.id = trades.recipient_chore_id
    JOIN users pu ON pu.id = trades.proposer_id
    JOIN users ru ON ru.id = trades.recipient_id
    WHERE trades.room_id = ${roomId}
      AND trades.status = 'pending'
      AND (trades.proposer_id = ${req.user.id} OR trades.recipient_id = ${req.user.id})
    ORDER BY trades.created_at DESC
  `
  return res.json({ trades: rows.map(shapeTrade) })
})

// POST /api/trades   body: { roomId, recipientId, proposerChoreId, recipientChoreId }
// Proposes swapping ownership of two chores: yours for theirs.
router.post('/', async (req, res) => {
  const roomId = Number(req.body.roomId)
  const recipientId = Number(req.body.recipientId)
  const proposerChoreId = Number(req.body.proposerChoreId)
  const recipientChoreId = Number(req.body.recipientChoreId)

  if (![roomId, recipientId, proposerChoreId, recipientChoreId].every(Number.isInteger)) {
    return res.status(400).json({ error: 'A room, a recipient, and both chores are required.' })
  }
  if (recipientId === req.user.id) {
    return res.status(400).json({ error: "You can't propose a trade with yourself." })
  }
  const ok = await requireMembership(req, res, roomId)
  if (!ok) return

  const { rows: recipientMembership } = await sql`
    SELECT 1 FROM room_members WHERE room_id = ${roomId} AND user_id = ${recipientId}
  `
  if (recipientMembership.length === 0) {
    return res.status(400).json({ error: 'That person is not in this room.' })
  }

  const { rows: choreRows } = await sql`
    SELECT * FROM chores WHERE id IN (${proposerChoreId}, ${recipientChoreId})
  `
  const proposerChore = choreRows.find((c) => c.id === proposerChoreId)
  const recipientChore = choreRows.find((c) => c.id === recipientChoreId)

  if (!proposerChore || !recipientChore) {
    return res.status(404).json({ error: 'One of those chores could not be found.' })
  }
  if (proposerChore.room_id !== roomId || recipientChore.room_id !== roomId) {
    return res.status(400).json({ error: 'Both chores must belong to this room.' })
  }
  if (ownerIdOf(proposerChore) !== req.user.id) {
    return res.status(403).json({ error: "That chore isn't assigned to you." })
  }
  if (ownerIdOf(recipientChore) !== recipientId) {
    return res.status(403).json({ error: "That chore isn't assigned to the person you selected." })
  }

  // Only one pending trade between the same two people at a time, so offers
  // don't pile up and contradict each other.
  const { rows: existing } = await sql`
    SELECT 1 FROM trades
    WHERE room_id = ${roomId} AND status = 'pending'
      AND ((proposer_id = ${req.user.id} AND recipient_id = ${recipientId})
        OR (proposer_id = ${recipientId} AND recipient_id = ${req.user.id}))
  `
  if (existing.length > 0) {
    return res.status(409).json({ error: 'There is already a pending trade between you two.' })
  }

  const { rows } = await sql`
    INSERT INTO trades (room_id, proposer_id, recipient_id, proposer_chore_id, recipient_chore_id)
    VALUES (${roomId}, ${req.user.id}, ${recipientId}, ${proposerChoreId}, ${recipientChoreId})
    RETURNING id
  `
  return res.status(201).json({ id: rows[0].id })
})

// POST /api/trades/:id/accept
// Only the recipient can accept. Swaps ownership of the two chores —
// nothing else about either chore (task, points, date, recurring) changes.
router.post('/:id/accept', async (req, res) => {
  const tradeId = Number(req.params.id)
  const { rows } = await sql`SELECT * FROM trades WHERE id = ${tradeId}`
  const trade = rows[0]

  if (!trade) return res.status(404).json({ error: 'Trade not found.' })
  if (trade.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the recipient can accept this trade.' })
  }
  if (trade.status !== 'pending') {
    return res.status(409).json({ error: 'This trade has already been resolved.' })
  }

  const { rows: choreRows } = await sql`
    SELECT * FROM chores WHERE id IN (${trade.proposer_chore_id}, ${trade.recipient_chore_id})
  `
  const proposerChore = choreRows.find((c) => c.id === trade.proposer_chore_id)
  const recipientChore = choreRows.find((c) => c.id === trade.recipient_chore_id)

  if (proposerChore.claimed_by) {
    await sql`UPDATE chores SET claimed_by = ${trade.recipient_id} WHERE id = ${proposerChore.id}`
  } else {
    await sql`UPDATE chores SET added_by = ${trade.recipient_id} WHERE id = ${proposerChore.id}`
  }
  if (recipientChore.claimed_by) {
    await sql`UPDATE chores SET claimed_by = ${trade.proposer_id} WHERE id = ${recipientChore.id}`
  } else {
    await sql`UPDATE chores SET added_by = ${trade.proposer_id} WHERE id = ${recipientChore.id}`
  }

  await sql`UPDATE trades SET status = 'accepted', resolved_at = now() WHERE id = ${tradeId}`
  return res.json({ ok: true })
})

// POST /api/trades/:id/decline
// Either side can decline — the recipient rejecting it, or the proposer
// cancelling their own offer. No chores change.
router.post('/:id/decline', async (req, res) => {
  const tradeId = Number(req.params.id)
  const { rows } = await sql`SELECT * FROM trades WHERE id = ${tradeId}`
  const trade = rows[0]

  if (!trade) return res.status(404).json({ error: 'Trade not found.' })
  if (trade.recipient_id !== req.user.id && trade.proposer_id !== req.user.id) {
    return res.status(403).json({ error: "This isn't your trade to decline." })
  }
  if (trade.status !== 'pending') {
    return res.status(409).json({ error: 'This trade has already been resolved.' })
  }

  await sql`UPDATE trades SET status = 'declined', resolved_at = now() WHERE id = ${tradeId}`
  return res.json({ ok: true })
})

export default router
