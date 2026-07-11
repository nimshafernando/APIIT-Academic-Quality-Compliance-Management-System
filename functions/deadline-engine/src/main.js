import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite'

const DB = 'aqcms'
const SITE_URL = process.env.SITE_URL || 'https://aqcms-soc.appwrite.network'
const LOGO_URL = `${SITE_URL}/apiitlogo.png`

// One function, two jobs (free plan allows only 2 functions total):
//  1. EVENT trigger (notifications.*.create) → send a branded email for every
//     notification the moment it is created (approvals, returns, reminders…).
//  2. CRON (daily 06:00 UTC) → task reminders 7/3/1 days before due date,
//     overdue notices, and HOD escalation after the grace period (SRS NOTIF-01/02).
const REMIND_AT_DAYS = [7, 3, 1]
const ESCALATE_AFTER_DAYS = 3

/* ------------------------------------------------------------- email ------ */

const SUBJECTS = {
  approval_pending: 'Awaiting your approval',
  stage_approved: 'A stage was approved',
  approved: 'Final sign-off complete',
  returned: 'Returned for revision',
  task_due: 'Deadline reminder',
  task_overdue: 'Task overdue',
  escalation: 'Overdue escalation',
  case: 'New case logged',
  appraisal: 'Appraisal update',
}

const ACCENTS = {
  task_overdue: '#DC2626',
  escalation: '#DC2626',
  returned: '#D97706',
  task_due: '#D97706',
  approved: '#059669',
  stage_approved: '#059669',
}

function template({ title, message, recipientName, intendedFor, accent = '#19B9AF', link }) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#F5F7F7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F7F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(12,29,27,0.10);">

        <!-- Header: APIIT logo on a white tile over the dark teal brand panel -->
        <tr><td style="background:linear-gradient(135deg,#0C1D1B 0%,#12302D 60%,#14443F 100%);background-color:#0C1D1B;padding:28px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:#ffffff;border-radius:12px;padding:8px 12px;">
              <img src="${LOGO_URL}" alt="APIIT" height="30" style="display:block;height:30px;" />
            </td>
            <td style="padding-left:14px;">
              <p style="margin:0;color:#ffffff;font-size:16px;font-weight:800;letter-spacing:0.5px;">AQCMS</p>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.55);font-size:11px;">School of Computing</p>
            </td>
          </tr></table>
        </td></tr>

        <!-- Accent bar -->
        <tr><td style="height:4px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 6px;color:#9CA3AF;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Academic Quality &amp; Compliance</p>
          <h1 style="margin:0 0 16px;color:#111827;font-size:21px;font-weight:800;line-height:1.3;">${title}</h1>
          <p style="margin:0 0 8px;color:#4B5563;font-size:14px;">Hi ${recipientName || 'there'},</p>
          <div style="margin:16px 0 24px;padding:16px 18px;background-color:#F5F7F7;border-left:4px solid ${accent};border-radius:0 10px 10px 0;">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${message}</p>
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:linear-gradient(135deg,#1FCABF,#19B9AF,#0FA093);background-color:#19B9AF;">
              <a href="${link}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open AQCMS</a>
            </td>
          </tr></table>

          <!-- Signature -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #EEF1F1;">
            <tr><td style="padding-top:18px;">
              <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">Kind regards,</p>
              <p style="margin:6px 0 0;color:#111827;font-size:14px;font-weight:700;">Dr. Chaman Wijesiriwardana</p>
              <p style="margin:1px 0 0;color:#6B7280;font-size:12px;">Head of Computing · School of Computing, APIIT</p>
            </td></tr>
          </table>
          ${intendedFor ? `<p style="margin:24px 0 0;padding:10px 14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;color:#9A3412;font-size:12px;"><strong>Demo redirect:</strong> this email was intended for <strong>${intendedFor}</strong> and was delivered to you because the Resend sandbox only sends to the account owner.</p>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background-color:#FAFBFB;border-top:1px solid #EEF1F1;">
          <p style="margin:0;color:#9CA3AF;font-size:11px;line-height:1.6;">
            APIIT — Inspire love for learning · Academic Quality &amp; Compliance Management System<br/>
            You received this because notifications are enabled for your AQCMS account.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendNotificationEmail(db, doc, log, error) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { skipped: 'no api key' }

  const prof = await db.listDocuments(DB, 'profiles', [Query.equal('userId', doc.userId), Query.limit(1)])
  const profile = prof.documents[0]
  if (!profile?.email) return { skipped: 'recipient has no email' }

  const redirect = process.env.EMAIL_DEMO_REDIRECT
  const to = redirect || profile.email
  const subject = `${SUBJECTS[doc.type] || 'New notification'} — AQCMS`
  const link = doc.relatedId ? `${SITE_URL}/workflows/${doc.relatedId}` : `${SITE_URL}/notifications`

  const html = template({
    title: SUBJECTS[doc.type] || 'You have a new notification',
    message: doc.message,
    recipientName: profile.name?.replace(/\(.*?\)/g, '').trim().split(' ')[0],
    intendedFor: redirect && redirect !== profile.email ? `${profile.name} <${profile.email}>` : '',
    accent: ACCENTS[doc.type] || '#19B9AF',
    link,
  })

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'AQCMS <onboarding@resend.dev>', to, subject, html }),
  })
  const result = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    error(`Resend rejected: ${JSON.stringify(result)}`)
    return { failed: result }
  }
  log(`emailed ${to} (type=${doc.type}, id=${result.id})`)
  return { emailId: result.id, to }
}

/* --------------------------------------------------------------- main ----- */

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY)
  const db = new Databases(client)

  /* ---- Mode 1: document events ----
     Browser clients can only grant document permissions to their OWN identity,
     so cross-user grants (notification recipients, task owners, HOD oversight,
     appraisal staff access, restricted files) are stamped here server-side. */
  if (req.headers['x-appwrite-trigger'] === 'event') {
    const eventName = req.headers['x-appwrite-event'] || ''
    let doc
    try {
      doc = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    } catch {
      return res.json({ error: 'Invalid event payload' }, 400)
    }
    if (!doc?.$id) return res.json({ ok: true, skipped: 'no payload' })

    const perm = {
      read: (r) => `read("${r}")`,
      update: (r) => `update("${r}")`,
      del: (r) => `delete("${r}")`,
    }
    const hasUserRead = (d, userId) => (d.$permissions || []).some((p) => p.startsWith('read') && p.includes(`user:${userId}`))

    try {
      if (eventName.includes('collections.notifications.')) {
        // Grant the recipient access (skip if already permissioned, e.g. cron-created)
        if (!hasUserRead(doc, doc.userId)) {
          await db.updateDocument(DB, 'notifications', doc.$id, {}, [
            perm.read(`user:${doc.userId}`),
            perm.update(`user:${doc.userId}`),
            perm.del(`user:${doc.userId}`),
          ])
        }
        const result = await sendNotificationEmail(db, doc, log, error)
        return res.json({ ok: !result.failed, mode: 'notification', ...result }, result.failed ? 502 : 200)
      }

      if (eventName.includes('collections.tasks.')) {
        if (!hasUserRead(doc, doc.ownerUserId)) {
          await db.updateDocument(DB, 'tasks', doc.$id, {}, [
            perm.read(`user:${doc.ownerUserId}`),
            perm.update(`user:${doc.ownerUserId}`),
            perm.update('label:hod'),
            perm.update('label:superadmin'),
            perm.del('label:hod'),
            perm.del('label:superadmin'),
          ])
          log(`task ${doc.$id} permissions granted to owner ${doc.ownerUserId}`)
        }
        return res.json({ ok: true, mode: 'task-perms' })
      }

      if (eventName.includes('collections.cases.')) {
        // Creator keeps access; HOD gains restricted oversight (SUP-02/03)
        await db.updateDocument(DB, 'cases', doc.$id, {}, [
          perm.read(`user:${doc.createdBy}`),
          perm.update(`user:${doc.createdBy}`),
          perm.read('label:hod'),
          perm.update('label:hod'),
          perm.del('label:hod'),
        ])
        log(`case ${doc.$id} permissions set (creator + HOD)`)
        return res.json({ ok: true, mode: 'case-perms' })
      }

      if (eventName.includes('collections.appraisals.')) {
        // HOD manages; the staff member gets read-only (APR-03)
        await db.updateDocument(DB, 'appraisals', doc.$id, {}, [
          perm.read('label:hod'),
          perm.update('label:hod'),
          perm.del('label:hod'),
          perm.read(`user:${doc.staffUserId}`),
        ])
        log(`appraisal ${doc.$id} permissions set (HOD + staff read)`)
        return res.json({ ok: true, mode: 'appraisal-perms' })
      }

      if (eventName.includes('collections.document_slots.')) {
        // Restricted evidence (exam papers): file readable by reviewers + uploader only
        if (doc.restricted && doc.currentFileId) {
          const { Storage } = await import('node-appwrite')
          const storage = new Storage(client)
          const filePerms = [
            ...['verifier', 'moduleleader', 'levelcoord', 'hod', 'superadmin'].map((r) => perm.read(`label:${r}`)),
            ...(doc.updatedBy ? [perm.read(`user:${doc.updatedBy}`)] : []),
          ]
          const file = await storage.getFile('evidence', doc.currentFileId)
          await storage.updateFile('evidence', doc.currentFileId, file.name, filePerms)
          log(`restricted file ${doc.currentFileId} locked to reviewers + uploader`)
        }
        return res.json({ ok: true, mode: 'slot-file-perms', restricted: !!doc.restricted })
      }

      return res.json({ ok: true, skipped: `unhandled event ${eventName}` })
    } catch (err) {
      error(String(err))
      return res.json({ error: err?.message || 'event handling failed' }, 500)
    }
  }

  /* ---- Mode 2: cron / manual → task reminders, overdue, escalation ---- */
  const todayStr = new Date().toISOString().slice(0, 10)
  const now = new Date()
  const daysUntil = (iso) => Math.ceil((new Date(iso) - now) / 86400000)

  const listAll = async (collection, queries) => {
    const docs = []
    let cursor = null
    for (;;) {
      const q = [...queries, Query.limit(100)]
      if (cursor) q.push(Query.cursorAfter(cursor))
      const r = await db.listDocuments(DB, collection, q)
      docs.push(...r.documents)
      if (r.documents.length < 100) break
      cursor = r.documents[r.documents.length - 1].$id
    }
    return docs
  }

  // In-app notification — its create event triggers Mode 1, which emails it.
  const notify = (userId, type, message, relatedId = '') =>
    db.createDocument(
      DB,
      'notifications',
      ID.unique(),
      { userId, type, message, relatedId, read: false },
      [Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))],
    )

  try {
    const openTasks = await listAll('tasks', [Query.equal('status', 'open')])
    const hodProfiles = await listAll('profiles', [Query.contains('roles', 'hod'), Query.equal('status', 'active')])
    let reminders = 0
    let overdueNotices = 0
    let escalations = 0

    for (const task of openTasks) {
      const d = daysUntil(task.dueDate)
      const due = new Date(task.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

      if (d >= 0 && REMIND_AT_DAYS.includes(d) && task.lastReminded !== todayStr) {
        await notify(task.ownerUserId, 'task_due', `Reminder: "${task.title}" is due ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`} (${due}).`, task.$id)
        await db.updateDocument(DB, 'tasks', task.$id, { lastReminded: todayStr })
        reminders++
      }

      if (d < 0 && task.lastReminded !== todayStr) {
        const overdueDays = -d
        await notify(task.ownerUserId, 'task_overdue', `OVERDUE: "${task.title}" was due ${due} (${overdueDays} day${overdueDays === 1 ? '' : 's'} ago).`, task.$id)
        await db.updateDocument(DB, 'tasks', task.$id, { lastReminded: todayStr })
        overdueNotices++

        if (overdueDays >= ESCALATE_AFTER_DAYS && !task.escalated) {
          const esc = `Escalation: "${task.title}" (owner: ${task.ownerName || task.ownerUserId}) is ${overdueDays} days overdue with no action.`
          for (const hod of hodProfiles) await notify(hod.userId, 'escalation', esc, task.$id)
          await db.updateDocument(DB, 'tasks', task.$id, { escalated: true })
          escalations++
        }
      }
    }

    const summary = `deadline-engine: ${openTasks.length} open tasks · ${reminders} reminders · ${overdueNotices} overdue notices · ${escalations} escalations`
    log(summary)
    return res.json({ ok: true, mode: 'cron', openTasks: openTasks.length, reminders, overdueNotices, escalations })
  } catch (err) {
    error(String(err))
    return res.json({ error: err?.message || 'deadline-engine failed' }, 500)
  }
}
