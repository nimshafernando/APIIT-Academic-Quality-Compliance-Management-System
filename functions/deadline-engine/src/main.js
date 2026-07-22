import { createHmac, timingSafeEqual } from 'node:crypto'
import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite'

const DB = 'aqcms'
const SITE_URL = process.env.SITE_URL || 'https://aqcms-soc.appwrite.network'
const LOGO_URL = `${SITE_URL}/apiitlogo.png`
// Public domain of THIS function — approve/decline links in emails point here.
const ACTIONS_URL = process.env.ACTIONS_URL || 'https://aqcms-actions.appwrite.network'

/* -------------------------------------------- signed email action links ---- */

function signAction(instanceId, stageIndex, userId, action) {
  return createHmac('sha256', process.env.EMAIL_ACTION_SECRET)
    .update(`${instanceId}|${stageIndex}|${userId}|${action}`)
    .digest('hex')
}

function verifyAction(token, instanceId, stageIndex, userId, action) {
  if (!process.env.EMAIL_ACTION_SECRET || !token) return false
  const expected = signAction(instanceId, stageIndex, userId, action)
  const a = Buffer.from(String(token))
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

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

function template({ title, message, recipientName, intendedFor, accent = '#19B9AF', link, fromName, actions }) {
  // Signed by whoever triggered the notification; system mail (reminders,
  // escalations) falls back to a neutral AQCMS signature.
  const signName = fromName?.replace(/\(.*?\)/g, '').trim() || 'AQCMS Notifications'
  const signSub = fromName ? 'via AQCMS · Academic Quality & Compliance, APIIT' : 'Academic Quality & Compliance, APIIT'
  const initial = (signName[0] || 'A').toUpperCase()
  // Soft tint behind the eyebrow chip — explicit per accent (8-digit hex
  // alpha isn't safe in all email clients).
  const accentTint = { '#DC2626': '#FDECEC', '#D97706': '#FCF1E0', '#059669': '#E8F8F2' }[accent] || '#E4F7F5'
  const buttons = actions
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:999px;background:linear-gradient(135deg,#12BC8E,#059669);background-color:#059669;box-shadow:0 8px 20px rgba(5,150,105,0.25);">
              <a href="${actions.approveUrl}" style="display:inline-block;padding:14px 36px;border-radius:999px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;">Approve</a>
            </td>
            <td style="width:14px;font-size:0;">&nbsp;</td>
            <td style="border-radius:999px;background-color:#FDEDED;">
              <a href="${actions.declineUrl}" style="display:inline-block;padding:14px 36px;border-radius:999px;color:#B42318;font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;">Decline</a>
            </td>
          </tr></table>
          <p style="margin:20px 0 0;font-size:13px;"><a href="${link}" style="color:#0FA093;font-weight:600;text-decoration:none;">Review the full submission in AQCMS &#8594;</a></p>
          <p style="margin:14px 0 0;color:#A8B3B2;font-size:11.5px;line-height:1.7;">Declining returns the submission to its author for revision.<br/>These links are personal to you &mdash; please don&rsquo;t forward this email.</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:999px;background:linear-gradient(135deg,#1FCABF,#0FA093);background-color:#19B9AF;box-shadow:0 8px 20px rgba(15,160,147,0.25);">
              <a href="${link}" style="display:inline-block;padding:14px 36px;border-radius:999px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;">Open AQCMS</a>
            </td>
          </tr></table>`
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#EDF2F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EDF2F1;padding:40px 16px 48px;">
    <tr><td align="center">

      <!-- Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 2px 4px rgba(12,29,27,0.04),0 16px 48px rgba(12,29,27,0.10);">

        <!-- Header: APIIT logo on a white tile over the dark teal brand panel -->
        <tr><td style="background:linear-gradient(120deg,#0B1B19 0%,#123230 55%,#155A50 130%);background-color:#0C1D1B;padding:34px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:1%;background:#ffffff;border-radius:14px;padding:9px 13px;">
              <img src="${LOGO_URL}" alt="APIIT" height="28" style="display:block;height:28px;" />
            </td>
            <td style="padding-left:16px;">
              <p style="margin:0;color:#ffffff;font-size:17px;font-weight:800;letter-spacing:2px;">AQCMS</p>
              <p style="margin:3px 0 0;color:#7FBDB4;font-size:11px;font-weight:600;letter-spacing:0.8px;">SCHOOL OF COMPUTING</p>
            </td>
            <td align="right" style="vertical-align:top;">
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:10.5px;letter-spacing:1.2px;">APIIT</p>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 40px 36px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:999px;background-color:${accentTint};padding:6px 14px;">
              <p style="margin:0;color:${accent};font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px;">Academic Quality &amp; Compliance</p>
            </td>
          </tr></table>
          <h1 style="margin:20px 0 0;color:#0E1B1A;font-size:24px;font-weight:800;line-height:1.25;letter-spacing:-0.3px;">${title}</h1>
          <p style="margin:14px 0 0;color:#5B6B69;font-size:14.5px;line-height:1.7;">Hi ${recipientName || 'there'},</p>

          <!-- Message panel -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 28px;"><tr>
            <td style="width:3px;border-radius:3px;background-color:${accent};font-size:0;">&nbsp;</td>
            <td style="padding:18px 22px;background-color:#F6FAF9;border-radius:0 16px 16px 0;">
              <p style="margin:0;color:#33413F;font-size:14.5px;line-height:1.75;">${message}</p>
            </td>
          </tr></table>

          ${buttons}

          <!-- Signature -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:36px;border-top:1px solid #ECF1F0;">
            <tr><td style="padding-top:24px;">
              <p style="margin:0 0 14px;color:#5B6B69;font-size:13.5px;">Kind regards,</p>
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="width:42px;height:42px;border-radius:999px;background:linear-gradient(135deg,#DDF5F1,#BCEAE3);background-color:#DDF5F1;text-align:center;vertical-align:middle;">
                  <p style="margin:0;color:#0E8A7D;font-size:16px;font-weight:800;line-height:42px;">${initial}</p>
                </td>
                <td style="padding-left:13px;">
                  <p style="margin:0;color:#0E1B1A;font-size:14.5px;font-weight:700;">${signName}</p>
                  <p style="margin:2px 0 0;color:#8CA09D;font-size:12px;">${signSub}</p>
                </td>
              </tr></table>
            </td></tr>
          </table>
          ${intendedFor ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="padding:13px 18px;background-color:#FFF9F0;border:1px solid #F5E3C3;border-radius:14px;"><p style="margin:0;color:#8A6116;font-size:12px;line-height:1.6;"><strong>Demo redirect</strong> &mdash; this email was intended for <strong>${intendedFor}</strong> and reached you because the sending domain is still in sandbox mode.</p></td></tr></table>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;background-color:#FAFCFB;border-top:1px solid #ECF1F0;" align="center">
          <p style="margin:0;color:#9FAFAC;font-size:11px;line-height:1.8;letter-spacing:0.2px;">
            APIIT &middot; Inspire love for learning<br/>
            Academic Quality &amp; Compliance Management System<br/>
            <span style="color:#BCC8C6;">You received this because notifications are enabled for your AQCMS account.</span>
          </p>
        </td></tr>
      </table>

      <p style="margin:22px 0 0;color:#AEBDBA;font-size:11px;letter-spacing:0.4px;">&copy; APIIT &middot; Colombo</p>
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

  // Approval requests get one-click Approve/Decline buttons: signed links to
  // this function's public domain, bound to instance+stage+recipient so they
  // can't be reused for anything else.
  let actions = null
  if (doc.type === 'approval_pending' && doc.relatedId && process.env.EMAIL_ACTION_SECRET) {
    try {
      const inst = await db.getDocument(DB, 'workflow_instances', doc.relatedId)
      if (inst.status === 'in_progress') {
        const mk = (action) =>
          `${ACTIONS_URL}/?action=${action}&instance=${inst.$id}&stage=${inst.currentStageIndex}` +
          `&user=${doc.userId}&token=${signAction(inst.$id, inst.currentStageIndex, doc.userId, action)}`
        actions = { approveUrl: mk('approve'), declineUrl: mk('decline') }
      }
    } catch {
      /* relatedId isn't a workflow instance (e.g. a task) — no buttons */
    }
  }

  const html = template({
    title: SUBJECTS[doc.type] || 'You have a new notification',
    message: doc.message,
    recipientName: profile.name?.replace(/\(.*?\)/g, '').trim().split(' ')[0],
    intendedFor: redirect && redirect !== profile.email ? `${profile.name} <${profile.email}>` : '',
    accent: ACCENTS[doc.type] || '#19B9AF',
    link,
    fromName: doc.fromName || '',
    actions,
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

/* -------------------------------------- email approve/decline endpoint ---- */

// Minimal branded result page shown in the browser after clicking a button.
function actionPage(ok, title, detail, link) {
  const tone = ok ? { bg: '#E8F8F2', fg: '#067A57', label: 'Action completed' } : { bg: '#FDEDED', fg: '#B42318', label: 'Nothing was changed' }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — AQCMS</title></head>
<body style="margin:0;background:linear-gradient(160deg,#EDF2F1,#E2ECEA);background-color:#EDF2F1;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:0 auto;padding:9vh 20px 40px;">
    <div style="background:#fff;border-radius:24px;padding:44px 40px;box-shadow:0 2px 4px rgba(12,29,27,.04),0 16px 48px rgba(12,29,27,.10);text-align:center;">
      <p style="display:inline-block;margin:0 0 20px;padding:7px 16px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;">${tone.label}</p>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0E1B1A;letter-spacing:-0.3px;">${title}</h1>
      <p style="margin:0 0 30px;font-size:14.5px;color:#5B6B69;line-height:1.7;">${detail}</p>
      <a href="${link}" style="display:inline-block;padding:14px 36px;border-radius:999px;background:linear-gradient(135deg,#1FCABF,#0FA093);background-color:#19B9AF;color:#fff;font-weight:700;font-size:14px;letter-spacing:0.3px;text-decoration:none;box-shadow:0 8px 20px rgba(15,160,147,.25);">Open AQCMS</a>
    </div>
    <p style="margin:22px 0 0;text-align:center;font-size:11px;color:#AEBDBA;letter-spacing:0.4px;">AQCMS &middot; Academic Quality &amp; Compliance, APIIT</p>
  </div>
</body></html>`
}

// GET ?action=approve|decline&instance=..&stage=..&user=..&token=.. — the
// token (HMAC over all four values) proves the link came from an email WE
// sent to THAT approver for THAT stage; mirrors approveStage/returnForRevision
// in src/lib/workflow.js.
async function handleEmailAction(db, req, res, log, error) {
  const page = (ok, title, detail, link) =>
    res.send(actionPage(ok, title, detail, link), ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
  try {
    const { action, instance: instanceId, stage, user: userId, token } = req.query || {}
    if (!['approve', 'decline'].includes(action) || !instanceId || stage === undefined || !userId)
      return page(false, 'Invalid link', 'This action link is malformed.', SITE_URL)
    if (!verifyAction(token, instanceId, stage, userId, action))
      return page(false, 'Link not valid', 'This action link is invalid or has expired.', SITE_URL)

    let inst
    try {
      inst = await db.getDocument(DB, 'workflow_instances', instanceId)
    } catch {
      return page(false, 'Not found', 'This submission no longer exists.', SITE_URL)
    }

    const stageIdx = Number(stage)
    const viewLink = `${SITE_URL}/workflows/${instanceId}`
    if (inst.status !== 'in_progress' || inst.currentStageIndex !== stageIdx)
      return page(false, 'Already actioned', `"${inst.title}" has moved on since this email was sent — nothing was changed. It is currently: ${inst.status === 'approved' ? 'fully approved' : inst.currentStageLabel || inst.status}.`, viewLink)

    const prof = await db.listDocuments(DB, 'profiles', [Query.equal('userId', userId), Query.limit(1)])
    const actor = prof.documents[0]
    const actorName = actor?.name || 'Approver'
    const stages = JSON.parse(inst.stagesJson || '[]')
    const label = stages[stageIdx]?.label || `Stage ${stageIdx + 1}`

    // Still the right person? Assigned approver wins; unassigned stages need
    // the stage role on the actor's profile.
    const assigned = (inst.approverIds?.[stageIdx] || '').split(',').filter(Boolean)
    const allowed = assigned.length ? assigned.includes(userId) : (actor?.roles || []).includes(stages[stageIdx]?.role)
    if (!allowed) return page(false, 'Not authorised', 'You are no longer an approver for this stage.', viewLink)

    const notifyUser = (uid, type, message, fromName) =>
      db.createDocument(
        DB,
        'notifications',
        ID.unique(),
        { userId: uid, type, message, relatedId: instanceId, read: false, fromName },
        [Permission.read(Role.user(uid)), Permission.update(Role.user(uid)), Permission.delete(Role.user(uid))],
      )
    const logAct = (act, comment) =>
      db.createDocument(DB, 'workflow_actions', ID.unique(), {
        instanceId, userId, userName: actorName, action: act, stageIndex: stageIdx, stageLabel: label, comment,
      })

    if (action === 'decline') {
      await db.updateDocument(DB, 'workflow_instances', instanceId, { status: 'returned' })
      await logAct('return', 'Declined via email — contact the approver for details.')
      await notifyUser(inst.submittedBy, 'returned', `"${inst.title}" was returned for revision by ${actorName} (declined via email).`, actorName)
      log(`email action: ${actorName} declined ${instanceId} @ stage ${stageIdx}`)
      return page(true, 'Submission declined', `"${inst.title}" has been returned to ${inst.submittedByName || 'the submitter'} for revision. They have been notified.`, viewLink)
    }

    const nextIdx = stageIdx + 1
    const isFinal = nextIdx >= stages.length
    await db.updateDocument(DB, 'workflow_instances', instanceId, {
      status: isFinal ? 'approved' : 'in_progress',
      currentStageIndex: isFinal ? stageIdx : nextIdx,
      currentStageRole: isFinal ? '' : stages[nextIdx].role,
      currentStageLabel: isFinal ? 'Completed' : stages[nextIdx].label || stages[nextIdx].role,
    })
    await logAct('approve', 'Approved via email')

    if (isFinal) {
      await notifyUser(inst.submittedBy, 'approved', `"${inst.title}" has received final sign-off. The record is now locked.`, actorName)
    } else {
      let recipients = (inst.approverIds?.[nextIdx] || '').split(',').filter(Boolean)
      if (!recipients.length) {
        const holders = await db.listDocuments(DB, 'profiles', [Query.contains('roles', stages[nextIdx].role), Query.equal('status', 'active'), Query.limit(100)])
        recipients = [...new Set(holders.documents.map((p) => p.userId))]
      }
      const nextLabel = stages[nextIdx].label || stages[nextIdx].role
      for (const uid of recipients) await notifyUser(uid, 'approval_pending', `"${inst.title}" (${inst.moduleCode}) is awaiting your ${nextLabel}.`, actorName)
      await notifyUser(inst.submittedBy, 'stage_approved', `"${inst.title}" passed ${label} and moved to ${nextLabel}.`, actorName)
    }
    log(`email action: ${actorName} approved ${instanceId} @ stage ${stageIdx}`)
    return page(
      true,
      isFinal ? 'Final sign-off recorded' : 'Stage approved',
      isFinal ? `"${inst.title}" is now fully approved and locked.` : `"${inst.title}" has moved on to ${stages[nextIdx].label || 'the next stage'}. Everyone involved has been notified.`,
      viewLink,
    )
  } catch (err) {
    error(String(err))
    return page(false, 'Something went wrong', err?.message || 'The action could not be completed. Please use AQCMS directly.', SITE_URL)
  }
}

/* --------------------------------------------------------------- main ----- */

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY)
  const db = new Databases(client)

  /* ---- Mode 0: HTTP — signed approve/decline links from emails ----
     The function domain is public (execute: any); the HMAC token is the
     authorisation. Anonymous hits WITHOUT an action must never fall through
     to cron mode — only the scheduler or an authenticated execution runs it. */
  if (req.headers['x-appwrite-trigger'] === 'http') {
    if (req.query?.action) return handleEmailAction(db, req, res, log, error)
    if (!req.headers['x-appwrite-user-id']) {
      return res.send(
        actionPage(false, 'Nothing here', 'This endpoint only handles signed action links from AQCMS emails.', SITE_URL),
        404,
        { 'content-type': 'text/html; charset=utf-8' },
      )
    }
  }

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
