import { databases, DB_ID, COL, ID, notify } from './appwrite'

// Create a task document with the standard permission set:
// the owner can see/complete it; HOD + Super Admin labels have oversight.
export async function createTask(data, creator) {
  // Created without permission grants — the deadline-engine function stamps
  // owner + HOD/Super-Admin permissions on the create event (clients cannot
  // grant permissions to other users).
  const doc = await databases.createDocument(DB_ID, COL.TASKS, ID.unique(), {
    status: 'open',
    source: 'manual',
    createdByName: creator?.name || '',
    escalated: false,
    ...data,
  })
  if (creator && creator.$id !== data.ownerUserId) {
    await notify(
      data.ownerUserId,
      'task_due',
      `New task assigned by ${creator.name}: "${data.title}" — due ${new Date(data.dueDate).toLocaleDateString('en-GB')}.`,
      doc.$id,
    )
  }
  return doc
}

export function daysUntil(iso) {
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((midnight(new Date(iso)) - midnight(new Date())) / 86400000)
}

export function dueLabel(iso) {
  const d = daysUntil(iso)
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, tone: 'overdue' }
  if (d === 0) return { text: 'Due today', tone: 'today' }
  if (d === 1) return { text: 'Due tomorrow', tone: 'soon' }
  if (d <= 7) return { text: `Due in ${d} days`, tone: 'soon' }
  return { text: `Due in ${d} days`, tone: 'later' }
}
