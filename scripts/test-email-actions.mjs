// End-to-end test of the email approve/decline endpoint on deadline-engine.
import 'dotenv/config'
import { createHmac } from 'node:crypto'
import { Client, Databases, Query, Permission, Role } from 'node-appwrite'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, EMAIL_ACTION_SECRET } = process.env
const ACTIONS_URL = 'https://aqcms-actions.appwrite.network'
const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
const db = new Databases(client)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✔' : '✘'} ${name}${cond ? '' : ` ${extra}`}`)
  cond ? pass++ : fail++
}
const sign = (inst, stage, user, action) =>
  createHmac('sha256', EMAIL_ACTION_SECRET).update(`${inst}|${stage}|${user}|${action}`).digest('hex')
const url = (action, inst, stage, user, token) =>
  `${ACTIONS_URL}/?action=${action}&instance=${inst}&stage=${stage}&user=${user}&token=${token || sign(inst, stage, user, action)}`

// 0) Wait until the NEW function code is live (root returns the 404 HTML page,
//    old code would answer cron JSON)
console.log('Waiting for new deployment to serve the domain…')
let live = false
for (let i = 0; i < 40; i++) {
  const r = await fetch(ACTIONS_URL, { redirect: 'manual' }).catch(() => null)
  const body = r ? await r.text() : ''
  if (r && r.status === 404 && body.includes('signed action links')) { live = true; break }
  await sleep(5000)
}
if (!live) { console.error('New deployment never came live — aborting.'); process.exit(1) }
console.log('  ✔ new code is live (anonymous root hit gets 404 page, not cron)\n')

// 1) Disposable instance: verifier (assigned) → hod (role-wide)
const ID_ = 'emailtest-wf'
const stages = [
  { order: 0, role: 'verifier', label: 'Internal Verification (IVF)' },
  { order: 1, role: 'hod', label: 'HOD Sign-off' },
]
try { await db.deleteDocument('aqcms', 'workflow_instances', ID_) } catch {}
await db.createDocument('aqcms', 'workflow_instances', ID_, {
  templateId: 'tpl-two-tier', templateName: 'EMAIL ACTION TEST', stagesJson: JSON.stringify(stages),
  subjectId: 'sub-cloud-assess', subjectName: 'Cloud — Assessment', moduleId: 'mod-com2521', moduleCode: 'COM2521',
  moduleName: 'Cloud Infrastructure & Design', levelId: 'lvl-5', levelName: 'Level 5',
  title: 'EMAIL ACTION TEST — disposable', currentStageIndex: 0, currentStageRole: 'verifier',
  currentStageLabel: 'Internal Verification (IVF)', status: 'in_progress',
  submittedBy: 'demo-lecturer', submittedByName: 'Tharindu Weerasinghe (Lecturer)',
  fileIds: [], fileNames: [], approverIds: ['demo-verifier', ''], approverNames: ['Aisha Farook (Internal Verifier)', ''],
}, [Permission.read(Role.users())])
console.log('Test instance created.\n')

// 2) Tampered token rejected
{
  const r = await fetch(url('approve', ID_, 0, 'demo-verifier', 'deadbeef'.repeat(8)))
  ok('tampered token rejected (400)', r.status === 400, `got ${r.status}`)
}

// 3) Wrong person rejected (valid token but lecturer isn't the stage approver)
{
  const r = await fetch(url('approve', ID_, 0, 'demo-lecturer'))
  const t = await r.text()
  ok('non-approver rejected', r.status === 400 && t.includes('Not authorised'), `got ${r.status}`)
}

// 4) Assigned verifier approves stage 0 via link
{
  const r = await fetch(url('approve', ID_, 0, 'demo-verifier'))
  const t = await r.text()
  ok('assigned approver: approve link works', r.status === 200 && t.includes('Stage approved'), `got ${r.status}`)
  const inst = await db.getDocument('aqcms', 'workflow_instances', ID_)
  ok('instance advanced to HOD stage', inst.currentStageIndex === 1 && inst.currentStageRole === 'hod')
  const ntf = await db.listDocuments('aqcms', 'notifications', [Query.equal('relatedId', ID_), Query.limit(100)])
  ok('next approver + submitter notified with fromName', ntf.documents.some((n) => n.userId === 'demo-hod' && n.fromName?.includes('Aisha')) && ntf.documents.some((n) => n.userId === 'demo-lecturer' && n.type === 'stage_approved'))
}

// 5) Stale link (stage 0 again) is a no-op
{
  const r = await fetch(url('approve', ID_, 0, 'demo-verifier'))
  const t = await r.text()
  ok('stale link → "already actioned", no double-approve', r.status === 400 && t.includes('Already actioned'), `got ${r.status}`)
}

// 6) HOD declines stage 1 via link (role-wide stage, authorised by profile role)
{
  const r = await fetch(url('decline', ID_, 1, 'demo-hod'))
  const t = await r.text()
  ok('decline link returns submission for revision', r.status === 200 && t.includes('declined'), `got ${r.status} ${t.slice(0, 100)}`)
  const inst = await db.getDocument('aqcms', 'workflow_instances', ID_)
  ok('instance status = returned', inst.status === 'returned')
  const acts = await db.listDocuments('aqcms', 'workflow_actions', [Query.equal('instanceId', ID_), Query.limit(100)])
  ok('audit trail logged approve + return', acts.documents.some((a) => a.action === 'approve') && acts.documents.some((a) => a.action === 'return'))
}

// 7) Cleanup
{
  await db.deleteDocument('aqcms', 'workflow_instances', ID_)
  for (const col of ['notifications', 'workflow_actions']) {
    const key = col === 'notifications' ? 'relatedId' : 'instanceId'
    const rows = await db.listDocuments('aqcms', col, [Query.equal(key, ID_), Query.limit(100)])
    for (const d of rows.documents) await db.deleteDocument('aqcms', col, d.$id)
  }
  console.log('\nCleaned up test data.')
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
