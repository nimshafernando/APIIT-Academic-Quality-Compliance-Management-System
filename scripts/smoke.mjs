// End-to-end smoke test against the live Appwrite backend.
// Logs in as demo users and verifies RBAC, queue queries, the approve/revert
// flow, and the manage-users function. Read-mostly: any mutation is reverted.
//
// Usage: node scripts/smoke.mjs
import 'dotenv/config'
import { Client, Account, Databases, Functions, Users, Query } from 'node-appwrite'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env
const DB = 'aqcms'
const PASSWORD = 'Apiit@123'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  ✔ ${name}`)
  } else {
    fail++
    console.log(`  ✘ ${name} ${extra}`)
  }
}

const adminForSessions = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
const usersSvc = new Users(adminForSessions)

// Server SDKs only receive session secrets when authenticated with an API key,
// so password login is verified once below, and per-user sessions are minted
// via the Users service (equivalent client permissions).
async function loginAs(email) {
  const userId = `demo-${email.split('@')[0]}`
  const session = await usersSvc.createSession(userId)
  const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setSession(session.secret)
  return { client, account: new Account(client), db: new Databases(client), fns: new Functions(client) }
}

console.log('0) Password login works (browser-style)')
try {
  const anon = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID)
  const s = await new Account(anon).createEmailPasswordSession('lecturer@apiit.lk', PASSWORD)
  ok('email/password session created for lecturer@apiit.lk', !!s.$id)
  await usersSvc.deleteSession('demo-lecturer', s.$id).catch(() => {})
} catch (err) {
  ok('email/password session created for lecturer@apiit.lk', false, err.message)
}

console.log('1) Login + labels for every demo account')
const LABELS = {
  'superadmin@apiit.lk': 'superadmin',
  'hod@apiit.lk': 'hod',
  'levelcoord@apiit.lk': 'levelcoord',
  'moduleleader@apiit.lk': 'moduleleader',
  'lecturer@apiit.lk': 'lecturer',
  'moderator@apiit.lk': 'moderator',
  'verifier@apiit.lk': 'verifier',
  'acadadmin@apiit.lk': 'academicadmin',
}
for (const [email, label] of Object.entries(LABELS)) {
  try {
    const { account } = await loginAs(email)
    const me = await account.get()
    ok(`${email} logs in with label "${label}"`, (me.labels || []).includes(label), `labels=${me.labels}`)
  } catch (err) {
    ok(`${email} logs in`, false, err.message)
  }
}

console.log('\n2) Lecturer visibility & isolation')
{
  const lect = await loginAs('lecturer@apiit.lk')
  const mine = await lect.db.listDocuments(DB, 'workflow_instances', [Query.equal('submittedBy', 'demo-lecturer'), Query.limit(100)])
  ok('lecturer sees own 7 submissions', mine.total === 7, `got ${mine.total}`)
  const notifs = await lect.db.listDocuments(DB, 'notifications', [Query.limit(100)])
  ok(
    'lecturer sees ONLY own notifications',
    notifs.total >= 2 && notifs.documents.every((n) => n.userId === 'demo-lecturer'),
    `got ${notifs.total}, foreign=${notifs.documents.filter((n) => n.userId !== 'demo-lecturer').length}`,
  )
  try {
    await lect.db.createDocument(DB, 'programmes', 'smoke-prog', { name: 'X', awardingBody: 'Y' })
    ok('lecturer BLOCKED from creating programmes', false, 'create succeeded!')
    await lect.db.deleteDocument(DB, 'programmes', 'smoke-prog').catch(() => {})
  } catch {
    ok('lecturer BLOCKED from creating programmes', true)
  }
}

console.log('\n3) Verifier approval queue + approve/revert (server-side label permission)')
{
  const ver = await loginAs('verifier@apiit.lk')
  const queue = await ver.db.listDocuments(DB, 'workflow_instances', [
    Query.equal('status', 'in_progress'),
    Query.equal('currentStageRole', 'verifier'),
    Query.limit(100),
  ])
  ok('verifier queue contains wf-cloud-brief', queue.documents.some((d) => d.$id === 'wf-cloud-brief'), `got ${queue.documents.map((d) => d.$id)}`)
  // Approve stage 0 → advances to moduleleader, then revert
  await ver.db.updateDocument(DB, 'workflow_instances', 'wf-cloud-brief', {
    currentStageIndex: 1,
    currentStageRole: 'moduleleader',
    currentStageLabel: 'Module Leader Approval',
  })
  const after = await ver.db.getDocument(DB, 'workflow_instances', 'wf-cloud-brief')
  ok('verifier can advance the stage (update permission via label)', after.currentStageIndex === 1)
  await ver.db.updateDocument(DB, 'workflow_instances', 'wf-cloud-brief', {
    currentStageIndex: 0,
    currentStageRole: 'verifier',
    currentStageLabel: 'Internal Verification (IVF)',
  })
  ok('reverted wf-cloud-brief to stage 0', true)
}

console.log('\n4) Moderator / HOD / Level Coordinator queues')
{
  const mod = await loginAs('moderator@apiit.lk')
  const q1 = await mod.db.listDocuments(DB, 'workflow_instances', [Query.equal('status', 'in_progress'), Query.equal('currentStageRole', 'moderator'), Query.limit(100)])
  ok('moderator queue has the moderation case', q1.documents.some((d) => d.$id === 'wf-cloud-moderation'))
  const hod = await loginAs('hod@apiit.lk')
  const q2 = await hod.db.listDocuments(DB, 'workflow_instances', [Query.equal('status', 'in_progress'), Query.equal('currentStageRole', 'hod'), Query.limit(100)])
  ok('HOD queue has the final sign-off item', q2.documents.some((d) => d.$id === 'wf-prog-marking'))
  // Live usage adds instances beyond the seeded 7 — assert the seeded ones
  // are all visible school-wide rather than an exact count.
  const all = await hod.db.listDocuments(DB, 'workflow_instances', [Query.limit(100)])
  const seeded = ['wf-cloud-brief', 'wf-cloud-exam', 'wf-ux-resit', 'wf-web-lss', 'wf-prog-marking', 'wf-cloud-moderation', 'wf-cloud-descriptor']
  const visible = new Set(all.documents.map((d) => d.$id))
  ok('HOD sees all seeded instances school-wide', seeded.every((id) => visible.has(id)), `got ${all.total}`)
  const lc = await loginAs('levelcoord@apiit.lk')
  const q3 = await lc.db.listDocuments(DB, 'workflow_instances', [Query.equal('status', 'in_progress'), Query.equal('currentStageRole', 'levelcoord'), Query.limit(100)])
  ok('Level Coordinator queue has the re-sit pack', q3.documents.some((d) => d.$id === 'wf-ux-resit'))
  // Per-module routing: instances snapshot WHO approves each stage (the
  // module's own ML/IV/LC), so only that person may act — not every role holder.
  const routed = await hod.db.getDocument(DB, 'workflow_instances', 'wf-cloud-exam')
  ok('instance carries resolved per-stage approvers', routed.approverIds?.[0] === 'demo-verifier' && routed.approverIds?.[1] === 'demo-moduleleader')
}

console.log('\n5) Academic Admin structure permissions')
{
  const acad = await loginAs('acadadmin@apiit.lk')
  try {
    await acad.db.createDocument(DB, 'intakes', 'smoke-intake', { batchCode: 'SMOKE-TEST', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering' })
    ok('academic admin CAN create intakes (delegated area)', true)
    await acad.db.deleteDocument(DB, 'intakes', 'smoke-intake')
  } catch (err) {
    ok('academic admin CAN create intakes (delegated area)', false, err.message)
  }
  try {
    await acad.db.createDocument(DB, 'academic_years', 'smoke-ay', { label: 'X', startDate: new Date().toISOString(), endDate: new Date().toISOString() })
    ok('academic admin BLOCKED from core taxonomy (academic years)', false, 'create succeeded!')
    await acad.db.deleteDocument(DB, 'academic_years', 'smoke-ay').catch(() => {})
  } catch {
    ok('academic admin BLOCKED from core taxonomy (academic years)', true)
  }
}

console.log('\n6) manage-users function (create + deactivate + cleanup)')
{
  const sa = await loginAs('superadmin@apiit.lk')
  const exec = await sa.fns.createExecution(
    'manage-users',
    JSON.stringify({ action: 'create', name: 'Smoke Test User', email: 'smoketest@apiit.lk', password: 'Smoke@1234', roles: ['lecturer'] }),
    false,
  )
  let body = {}
  try { body = JSON.parse(exec.responseBody || '{}') } catch {}
  ok('superadmin can create a user via function', exec.responseStatusCode === 200 && body.ok, `status=${exec.responseStatusCode} body=${exec.responseBody?.slice(0, 200)}`)

  // Non-admin must be rejected
  const lect = await loginAs('lecturer@apiit.lk')
  try {
    const exec2 = await lect.fns.createExecution('manage-users', JSON.stringify({ action: 'create', name: 'X', email: 'x@x.lk', password: 'Xxxxxxxx1', roles: ['lecturer'] }), false)
    ok('lecturer BLOCKED from executing manage-users', exec2.responseStatusCode === 401 || exec2.responseStatusCode === 403, `status=${exec2.responseStatusCode}`)
  } catch {
    ok('lecturer BLOCKED from executing manage-users', true)
  }

  // Cleanup with API key
  if (body.userId) {
    const adminClient = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
    const users = new Users(adminClient)
    const adb = new Databases(adminClient)
    await users.delete(body.userId).catch(() => {})
    if (body.profileId) await adb.deleteDocument(DB, 'profiles', body.profileId).catch(() => {})
    console.log('  • smoke user cleaned up')
  }
}

console.log('\n7) Tasks & deadlines')
{
  const lect = await loginAs('lecturer@apiit.lk')
  const mine = await lect.db.listDocuments(DB, 'tasks', [Query.equal('ownerUserId', 'demo-lecturer'), Query.limit(100)])
  ok('lecturer sees own tasks (2)', mine.total === 2, `got ${mine.total}`)
  const hod = await loginAs('hod@apiit.lk')
  const all = await hod.db.listDocuments(DB, 'tasks', [Query.limit(100)])
  ok('HOD sees all tasks school-wide (5)', all.total === 5, `got ${all.total}`)
}

console.log('\n8) Case confidentiality (SUP-02/03)')
{
  const lect = await loginAs('lecturer@apiit.lk')
  const lectCases = await lect.db.listDocuments(DB, 'cases', [Query.limit(100)])
  ok('lecturer sees only own cases (2)', lectCases.total === 2, `got ${lectCases.total}`)
  const hod = await loginAs('hod@apiit.lk')
  const hodCases = await hod.db.listDocuments(DB, 'cases', [Query.limit(100)])
  ok('HOD sees all cases (3)', hodCases.total === 3, `got ${hodCases.total}`)
  const sa = await loginAs('superadmin@apiit.lk')
  const saCases = await sa.db.listDocuments(DB, 'cases', [Query.limit(100)]).catch(() => ({ total: 0 }))
  ok('Super Admin sees NO case content', saCases.total === 0, `got ${saCases.total}`)
}

console.log('\n9) Appraisal confidentiality (APR-03)')
{
  const lect = await loginAs('lecturer@apiit.lk')
  const own = await lect.db.listDocuments(DB, 'appraisals', [Query.limit(100)]).catch(() => ({ total: -1 }))
  ok('lecturer sees only own appraisal (1)', own.total === 1, `got ${own.total}`)
  const sa = await loginAs('superadmin@apiit.lk')
  const saAppr = await sa.db.listDocuments(DB, 'appraisals', [Query.limit(100)]).catch(() => ({ total: 0 }))
  ok('Super Admin CANNOT read appraisals', saAppr.total === 0, `got ${saAppr.total}`)
  const hod = await loginAs('hod@apiit.lk')
  const hodAppr = await hod.db.listDocuments(DB, 'appraisals', [Query.limit(100)])
  ok('HOD sees all appraisals (2)', hodAppr.total === 2, `got ${hodAppr.total}`)
}

console.log('\n10) Governance access (HOD only)')
{
  const hod = await loginAs('hod@apiit.lk')
  const risks = await hod.db.listDocuments(DB, 'risk_register', [Query.limit(100)])
  ok('HOD reads risk register (2)', risks.total === 2, `got ${risks.total}`)
  const lect = await loginAs('lecturer@apiit.lk')
  const lectRisks = await lect.db.listDocuments(DB, 'risk_register', [Query.limit(100)]).catch(() => ({ total: 0 }))
  ok('lecturer BLOCKED from risk register', lectRisks.total === 0, `got ${lectRisks.total}`)
}

console.log('\n11) Subject file slots')
{
  const lect = await loginAs('lecturer@apiit.lk')
  const slots = await lect.db.listDocuments(DB, 'document_slots', [Query.equal('subjectId', 'sub-cloud-assess'), Query.limit(100)])
  ok('COM2521 subject file has 6 slots', slots.total === 6, `got ${slots.total}`)
  const versions = await lect.db.listDocuments(DB, 'document_versions', [Query.equal('slotId', 'slot-cloud-incourse'), Query.limit(100)])
  ok('in-course slot has 2 versions', versions.total === 2, `got ${versions.total}`)
}

console.log('\n12) deadline-engine (reminders + escalation)')
{
  const hod = await loginAs('hod@apiit.lk')
  const exec = await hod.fns.createExecution('deadline-engine', '{}', false)
  let body = {}
  try { body = JSON.parse(exec.responseBody || '{}') } catch {}
  ok('deadline-engine runs OK', exec.responseStatusCode === 200 && body.ok, `status=${exec.responseStatusCode} body=${exec.responseBody?.slice(0, 200)}`)
  // State-based (idempotent): the seeded overdue task must have been noticed
  // today and escalated — whether by this run or an earlier run today.
  const overdueTask = await hod.db.getDocument(DB, 'tasks', 'task-emr-overdue')
  const today = new Date().toISOString().slice(0, 10)
  ok('overdue task was flagged today', overdueTask.lastReminded === today, `lastReminded=${overdueTask.lastReminded}`)
  ok('overdue task escalated to HOD', overdueTask.escalated === true, `escalated=${overdueTask.escalated}`)
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
