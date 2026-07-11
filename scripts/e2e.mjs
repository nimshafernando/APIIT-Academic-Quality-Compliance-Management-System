// Deep end-to-end suite: full lifecycles + edge cases for every AQCMS module,
// exercised through real user sessions against the live Appwrite backend.
// All created test data is cleaned up afterwards with the admin API key.
//
// Usage: node scripts/e2e.mjs
import 'dotenv/config'
import { Client, Account, Databases, Storage, Functions, Users, ID, Query, Permission, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env
const DB = 'aqcms'
const BUCKET = 'evidence'

const admin = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
const adminDb = new Databases(admin)
const adminStorage = new Storage(admin)
const adminUsers = new Users(admin)

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
const blocked = async (fn) => {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}

const sessions = {}
async function as(who) {
  if (!sessions[who]) {
    const s = await adminUsers.createSession(`demo-${who}`)
    const c = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setSession(s.secret)
    sessions[who] = { db: new Databases(c), storage: new Storage(c), fns: new Functions(c), account: new Account(c) }
  }
  return sessions[who]
}

const cleanup = { docs: [], files: [], users: [] }
const track = (col, id) => (cleanup.docs.push([col, id]), id)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Poll until the event-triggered function stamps permissions (or timeout).
async function eventually(fn, timeoutMs = 45000) {
  const start = Date.now()
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err
      await sleep(3000)
    }
  }
}

const STAGES = [
  { order: 0, role: 'verifier', label: 'Internal Verification (IVF)' },
  { order: 1, role: 'moduleleader', label: 'Module Leader Approval' },
  { order: 2, role: 'levelcoord', label: 'Level Coordinator Approval' },
  { order: 3, role: 'hod', label: 'HOD Final Sign-off' },
]

// Matches lib/workflow.js: clients may only grant their own identity; the
// approver roles hold collection-level update permission.
const instancePerms = (submitter) => [Permission.read(Role.users()), Permission.update(Role.user(submitter))]

try {
  /* ================================================================== A === */
  console.log('A) Full workflow lifecycle (submit → verify → ML → LC return → resubmit → LC → HOD)')
  {
    const lect = await as('lecturer')
    const file = await lect.storage.createFile(BUCKET, ID.unique(), InputFile.fromBuffer(Buffer.from('e2e evidence'), 'e2e-evidence.txt'), [Permission.read(Role.users())])
    cleanup.files.push(file.$id)

    const inst = await lect.db.createDocument(DB, 'workflow_instances', 'e2e-wf', {
      templateId: 'tpl-assessment', templateName: 'Assessment Preparation & Verification',
      stagesJson: JSON.stringify(STAGES),
      subjectId: 'sub-cloud-assess', subjectName: 'E2E Test Subject',
      moduleId: 'mod-com2521', moduleCode: 'COM2521', moduleName: 'Cloud Infrastructure & Design',
      levelId: 'lvl-5', levelName: 'Level 5',
      title: 'E2E TEST — full lifecycle', currentStageIndex: 0, currentStageRole: 'verifier',
      currentStageLabel: STAGES[0].label, status: 'in_progress',
      submittedBy: 'demo-lecturer', submittedByName: 'Tharindu Weerasinghe (Lecturer)',
      fileIds: [file.$id], fileNames: ['e2e-evidence.txt'],
    }, instancePerms('demo-lecturer'))
    track('workflow_instances', inst.$id)
    await lect.db.createDocument(DB, 'workflow_actions', track('workflow_actions', 'e2e-act-0'), { instanceId: inst.$id, userId: 'demo-lecturer', userName: 'Lecturer', action: 'submit', stageIndex: 0, stageLabel: 'Submission', comment: 'E2E' })
    ok('lecturer submits with evidence file', inst.status === 'in_progress' && inst.currentStageRole === 'verifier')

    const ver = await as('verifier')
    await ver.db.updateDocument(DB, 'workflow_instances', inst.$id, { currentStageIndex: 1, currentStageRole: 'moduleleader', currentStageLabel: STAGES[1].label })
    await ver.db.createDocument(DB, 'workflow_actions', track('workflow_actions', 'e2e-act-1'), { instanceId: inst.$id, userId: 'demo-verifier', userName: 'Verifier', action: 'approve', stageIndex: 0, stageLabel: STAGES[0].label, comment: 'IVF ok' })
    ok('verifier approves stage 0 → moduleleader', true)

    const ml = await as('moduleleader')
    await ml.db.updateDocument(DB, 'workflow_instances', inst.$id, { currentStageIndex: 2, currentStageRole: 'levelcoord', currentStageLabel: STAGES[2].label })
    ok('module leader approves stage 1 → levelcoord', true)

    const lc = await as('levelcoord')
    await lc.db.updateDocument(DB, 'workflow_instances', inst.$id, { status: 'returned' })
    await lc.db.createDocument(DB, 'workflow_actions', track('workflow_actions', 'e2e-act-2'), { instanceId: inst.$id, userId: 'demo-levelcoord', userName: 'LC', action: 'return', stageIndex: 2, stageLabel: STAGES[2].label, comment: 'Fix rubric' })
    let cur = await lect.db.getDocument(DB, 'workflow_instances', inst.$id)
    ok('LC returns for revision (status=returned, stage preserved)', cur.status === 'returned' && cur.currentStageIndex === 2)

    await lect.db.updateDocument(DB, 'workflow_instances', inst.$id, { status: 'in_progress' })
    cur = await lect.db.getDocument(DB, 'workflow_instances', inst.$id)
    ok('lecturer resubmits (re-enters at returning stage)', cur.status === 'in_progress' && cur.currentStageRole === 'levelcoord')

    await lc.db.updateDocument(DB, 'workflow_instances', inst.$id, { currentStageIndex: 3, currentStageRole: 'hod', currentStageLabel: STAGES[3].label })
    const hod = await as('hod')
    await hod.db.updateDocument(DB, 'workflow_instances', inst.$id, { status: 'approved', currentStageRole: '', currentStageLabel: 'Completed' })
    cur = await lect.db.getDocument(DB, 'workflow_instances', inst.$id)
    ok('HOD final sign-off → approved', cur.status === 'approved')

    const evidence = await ver.storage.getFile(BUCKET, file.$id)
    ok('reviewer can access the evidence file', evidence.$id === file.$id)
  }

  /* ================================================================== B === */
  console.log('\nB) Workflow security edges')
  {
    const acad = await as('acadadmin')
    ok('academic admin BLOCKED from updating instance', await blocked(() => acad.db.updateDocument(DB, 'workflow_instances', 'e2e-wf', { title: 'hacked' })))
    const lect = await as('lecturer')
    ok('audit trail is append-only (update blocked)', await blocked(() => lect.db.updateDocument(DB, 'workflow_actions', 'e2e-act-1', { comment: 'tampered' })))
    ok('audit trail is append-only (delete blocked)', await blocked(() => lect.db.deleteDocument(DB, 'workflow_actions', 'e2e-act-1')))
    ok('submitter cannot delete an instance', await blocked(() => lect.db.deleteDocument(DB, 'workflow_instances', 'e2e-wf')))
  }

  /* ================================================================== C === */
  console.log('\nC) Subject file slots: upload → review → return → new version + restricted files')
  {
    const lect = await as('lecturer')
    const slot = await lect.db.createDocument(DB, 'document_slots', 'e2e-slot', {
      subjectId: 'e2e-subject', subjectName: 'E2E Subject', moduleId: 'mod-com2521', moduleCode: 'COM2521',
      moduleName: 'Cloud Infrastructure & Design', levelName: 'Level 5', name: 'E2E Test Slot',
      category: 'Assessment', required: true, restricted: false, status: 'not_started', version: 0,
    })
    track('document_slots', slot.$id)

    const f1 = await lect.storage.createFile(BUCKET, ID.unique(), InputFile.fromBuffer(Buffer.from('v1'), 'e2e-v1.txt'), [Permission.read(Role.users())])
    cleanup.files.push(f1.$id)
    await lect.db.createDocument(DB, 'document_versions', track('document_versions', 'e2e-ver-1'), { slotId: slot.$id, version: 1, fileId: f1.$id, fileName: 'e2e-v1.txt', uploadedBy: 'demo-lecturer', uploadedByName: 'Lecturer' })
    await lect.db.updateDocument(DB, 'document_slots', slot.$id, { status: 'submitted', currentFileId: f1.$id, currentFileName: 'e2e-v1.txt', version: 1 })
    ok('lecturer uploads v1 → submitted', true)

    const ml = await as('moduleleader')
    await ml.db.updateDocument(DB, 'document_slots', slot.$id, { status: 'returned', reviewNote: 'Please fix task 2' })
    const f2 = await lect.storage.createFile(BUCKET, ID.unique(), InputFile.fromBuffer(Buffer.from('v2'), 'e2e-v2.txt'), [Permission.read(Role.users())])
    cleanup.files.push(f2.$id)
    await lect.db.createDocument(DB, 'document_versions', track('document_versions', 'e2e-ver-2'), { slotId: slot.$id, version: 2, fileId: f2.$id, fileName: 'e2e-v2.txt', uploadedBy: 'demo-lecturer', uploadedByName: 'Lecturer', note: 'Revision after return' })
    await lect.db.updateDocument(DB, 'document_slots', slot.$id, { status: 'submitted', currentFileId: f2.$id, currentFileName: 'e2e-v2.txt', version: 2, reviewNote: '' })
    await ml.db.updateDocument(DB, 'document_slots', slot.$id, { status: 'approved' })
    const finalSlot = await lect.db.getDocument(DB, 'document_slots', slot.$id)
    const versions = await lect.db.listDocuments(DB, 'document_versions', [Query.equal('slotId', slot.$id), Query.limit(10)])
    ok('return → revise → v2 approved with full history', finalSlot.status === 'approved' && finalSlot.version === 2 && versions.total === 2)

    ok('version history is immutable', await blocked(() => lect.db.updateDocument(DB, 'document_versions', 'e2e-ver-1', { fileName: 'tampered' })))

    // DOC-03 restricted file: uploader-only at upload; the deadline-engine
    // function stamps reviewer-label read access on the slot update event.
    const restricted = await lect.storage.createFile(BUCKET, ID.unique(), InputFile.fromBuffer(Buffer.from('exam paper'), 'e2e-exam.txt'), [
      Permission.read(Role.user('demo-lecturer')),
    ])
    cleanup.files.push(restricted.$id)
    const rslot = await lect.db.createDocument(DB, 'document_slots', 'e2e-slot-restricted', {
      subjectId: 'e2e-subject', subjectName: 'E2E Subject', moduleId: 'mod-com2521', moduleCode: 'COM2521',
      moduleName: 'Cloud Infrastructure & Design', levelName: 'Level 5', name: 'E2E Exam Slot',
      category: 'Examination', required: true, restricted: true, status: 'submitted',
      currentFileId: restricted.$id, currentFileName: 'e2e-exam.txt', version: 1, updatedBy: 'demo-lecturer',
    })
    track('document_slots', rslot.$id)
    const ver = await as('verifier')
    const canVer = await eventually(() => ver.storage.getFile(BUCKET, restricted.$id)).then(() => true).catch(() => false)
    ok('restricted exam file: verifier CAN read (after event-stamped grant)', canVer)
    const mod = await as('moderator')
    const canMod = await mod.storage.getFile(BUCKET, restricted.$id).then(() => true).catch(() => false)
    ok('restricted exam file: moderator CANNOT read', !canMod)
    const lectStill = await lect.storage.getFile(BUCKET, restricted.$id).then(() => true).catch(() => false)
    ok('restricted exam file: uploader still has access', lectStill)
  }

  /* ================================================================== D === */
  console.log('\nD) Tasks & deadline rules')
  {
    const hod = await as('hod')
    // Created with no grants — the deadline-engine event stamps owner access.
    const task = await hod.db.createDocument(DB, 'tasks', 'e2e-task', {
      title: 'E2E manual task', description: '', ownerUserId: 'demo-lecturer', ownerName: 'Lecturer',
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), status: 'open', source: 'manual', escalated: false,
    })
    track('tasks', task.$id)
    const lect = await as('lecturer')
    const seen = await eventually(() => lect.db.getDocument(DB, 'tasks', task.$id)).then(() => true).catch(() => false)
    ok('HOD assigns task → lecturer sees it (event-stamped permissions)', seen)
    await lect.db.updateDocument(DB, 'tasks', task.$id, { status: 'done', completedByName: 'Lecturer', completedAt: new Date().toISOString() })
    await lect.db.updateDocument(DB, 'tasks', task.$id, { status: 'open' })
    ok('owner can complete + reopen the task', true)
    const mod = await as('moderator')
    ok('unrelated user CANNOT see the task', await blocked(() => mod.db.getDocument(DB, 'tasks', task.$id)))
    ok('owner CANNOT delete the task', await blocked(() => lect.db.deleteDocument(DB, 'tasks', task.$id)))

    ok('lecturer BLOCKED from creating deadline rules', await blocked(() => lect.db.createDocument(DB, 'deadline_rules', 'e2e-rule-x', { name: 'x', anchor: 'semester_start', offsetDays: 0, assignRole: 'lecturer', active: true })))
    await hod.db.createDocument(DB, 'deadline_rules', track('deadline_rules', 'e2e-rule'), { name: 'E2E rule', anchor: 'semester_start', offsetDays: -7, assignRole: 'lecturer', active: false })
    ok('HOD can create deadline rules (TASK-02)', true)
  }

  /* ================================================================== E === */
  console.log('\nE) Deadline engine dedupe (second run today = no duplicate reminders)')
  {
    const hod = await as('hod')
    const exec = await hod.fns.createExecution('deadline-engine', '{}', false)
    let body = {}
    try { body = JSON.parse(exec.responseBody || '{}') } catch {}
    ok('engine runs in cron mode', exec.responseStatusCode === 200 && body.mode === 'cron', exec.responseBody?.slice(0, 150))
    ok('no duplicate reminders on same-day rerun', (body.reminders || 0) === 0 && (body.overdueNotices || 0) === 0, `reminders=${body.reminders} overdue=${body.overdueNotices}`)
    ok('no duplicate escalations', (body.escalations || 0) === 0, `escalations=${body.escalations}`)
  }

  /* ================================================================== F === */
  console.log('\nF) Case confidentiality & lifecycle')
  {
    const ml = await as('moduleleader')
    ok('module leader CANNOT read lecturer’s mentoring case', await blocked(() => ml.db.getDocument(DB, 'cases', 'case-mentoring-1')))
    const lect = await as('lecturer')
    const c = await lect.db.getDocument(DB, 'cases', 'case-mentoring-1')
    const notes = JSON.parse(c.notesJson || '[]')
    await lect.db.updateDocument(DB, 'cases', c.$id, { notesJson: JSON.stringify([...notes, { by: 'E2E', at: new Date().toISOString(), text: 'e2e note' }]) })
    await lect.db.updateDocument(DB, 'cases', c.$id, { notesJson: JSON.stringify(notes) }) // revert
    ok('case creator can append notes', true)
    const hod = await as('hod')
    await hod.db.updateDocument(DB, 'cases', c.$id, { status: 'in_review' })
    await hod.db.updateDocument(DB, 'cases', c.$id, { status: 'open' }) // revert
    ok('HOD can manage case status', true)

    // New case created from the browser flow: self-only grants, then the
    // event-stamp gives the HOD restricted oversight.
    await lect.db.createDocument(DB, 'cases', track('cases', 'e2e-case'), {
      type: 'ec', studentRef: 'E2E001', title: 'E2E EC case', details: 'test', status: 'open',
      createdBy: 'demo-lecturer', createdByName: 'Lecturer', notesJson: '[]',
    }, [Permission.read(Role.user('demo-lecturer')), Permission.update(Role.user('demo-lecturer'))])
    const hodSees = await eventually(() => hod.db.getDocument(DB, 'cases', 'e2e-case')).then(() => true).catch(() => false)
    ok('client-created case → HOD gains oversight via event stamp', hodSees)
  }

  /* ================================================================== G === */
  console.log('\nG) Appraisal boundaries')
  {
    const lect = await as('lecturer')
    ok('staff member CANNOT edit own appraisal (read-only)', await blocked(() => lect.db.updateDocument(DB, 'appraisals', 'apr-lect-2025', { outcomeRating: 'exceeds' })))
    const ml = await as('moduleleader')
    const mlAppr = await ml.db.listDocuments(DB, 'appraisals', [Query.limit(100)])
    ok('module leader sees ONLY own appraisal', mlAppr.total === 1 && mlAppr.documents[0].staffUserId === 'demo-moduleleader', `got ${mlAppr.total}`)

    // HOD creates an appraisal from the browser flow: HOD-label grants only,
    // the event stamp adds the staff member's read-only access.
    const hod = await as('hod')
    await hod.db.createDocument(DB, 'appraisals', track('appraisals', 'e2e-appr'), {
      staffUserId: 'demo-verifier', staffName: 'Aisha Farook (Internal Verifier)', cycle: 'E2E',
      goals: 'test', reviewComments: '', outcomeRating: 'meets', status: 'draft', updatedByName: 'HOD',
    }, [Permission.read(Role.label('hod')), Permission.update(Role.label('hod')), Permission.delete(Role.label('hod'))])
    const verSelf = await as('verifier')
    const staffSees = await eventually(() => verSelf.db.getDocument(DB, 'appraisals', 'e2e-appr')).then(() => true).catch(() => false)
    ok('staff member gains read-only access via event stamp', staffSees)
    ok('staff member still cannot edit it', await blocked(() => verSelf.db.updateDocument(DB, 'appraisals', 'e2e-appr', { outcomeRating: 'exceeds' })))
  }

  /* ================================================================== H === */
  console.log('\nH) Governance boundaries')
  {
    const lect = await as('lecturer')
    ok('lecturer BLOCKED from creating risks', await blocked(() => lect.db.createDocument(DB, 'risk_register', 'e2e-risk-x', { title: 'x', status: 'open' })))
    const hod = await as('hod')
    await hod.db.createDocument(DB, 'risk_register', track('risk_register', 'e2e-risk'), { title: 'E2E risk', severity: 'low', status: 'open' })
    ok('HOD can create risks', true)
    const docs = await lect.db.listDocuments(DB, 'governance_docs', [Query.limit(10)])
    ok('all staff can read governance documents (handbook)', docs.total >= 1)
    ok('lecturer BLOCKED from adding governance documents', await blocked(() => lect.db.createDocument(DB, 'governance_docs', 'e2e-doc-x', { name: 'x', category: 'other', version: 1 })))
  }

  /* ================================================================== I === */
  console.log('\nI) Structure write boundaries')
  {
    const hod = await as('hod')
    ok('HOD is read-only on core structure (create programme blocked)', await blocked(() => hod.db.createDocument(DB, 'programmes', 'e2e-prog-x', { name: 'x', awardingBody: 'y' })))
    const mod = await as('moderator')
    ok('moderator BLOCKED from creating subjects', await blocked(() => mod.db.createDocument(DB, 'subjects', 'e2e-sub-x', { name: 'x', moduleId: 'mod-com2521', category: 'Other' })))
    const sa = await as('superadmin')
    await sa.db.createDocument(DB, 'modules', track('modules', 'e2e-module'), { code: 'E2E999', name: 'E2E Module', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering', levelId: 'lvl-4', levelName: 'Level 4' })
    ok('super admin can create modules', true)
  }

  /* ================================================================== J === */
  console.log('\nJ) Auth & account-management edges')
  {
    const anon = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID)
    ok('wrong password is rejected', await blocked(() => new Account(anon).createEmailPasswordSession('lecturer@apiit.lk', 'WrongPass123')))

    const sa = await as('superadmin')
    const call = async (payload) => {
      const exec = await sa.fns.createExecution('manage-users', JSON.stringify(payload), false)
      let body = {}
      try { body = JSON.parse(exec.responseBody || '{}') } catch {}
      return { status: exec.responseStatusCode, body }
    }
    const weak = await call({ action: 'create', name: 'X', email: 'e2e-weak@apiit.lk', password: 'short', roles: ['lecturer'] })
    ok('weak password (<8 chars) rejected', weak.status === 400, `status=${weak.status}`)
    const badRole = await call({ action: 'create', name: 'X', email: 'e2e-badrole@apiit.lk', password: 'GoodPass123', roles: ['superhacker'] })
    ok('invalid role rejected', badRole.status === 400, `status=${badRole.status}`)
    const dup = await call({ action: 'create', name: 'X', email: 'lecturer@apiit.lk', password: 'GoodPass123', roles: ['lecturer'] })
    ok('duplicate email rejected', dup.status >= 400, `status=${dup.status}`)
    const selfOff = await call({ action: 'deactivate', userId: 'demo-superadmin' })
    ok('self-deactivation blocked', selfOff.status === 400, `status=${selfOff.status}`)

    const made = await call({ action: 'create', name: 'E2E Temp User', email: 'e2e-temp@apiit.lk', password: 'TempPass123', roles: ['lecturer'] })
    ok('valid account creation succeeds', made.status === 200 && made.body.ok, JSON.stringify(made.body).slice(0, 120))
    if (made.body.userId) {
      cleanup.users.push(made.body.userId)
      if (made.body.profileId) cleanup.docs.push(['profiles', made.body.profileId])
      await call({ action: 'deactivate', userId: made.body.userId })
      const deadLogin = await blocked(() => new Account(anon).createEmailPasswordSession('e2e-temp@apiit.lk', 'TempPass123'))
      ok('deactivated account cannot log in', deadLogin)
    }
  }

  /* ================================================================== K === */
  console.log('\nK) Notifications')
  {
    const lect = await as('lecturer')
    const own = await lect.db.listDocuments(DB, 'notifications', [Query.limit(1)])
    if (own.documents[0]) {
      const n = own.documents[0]
      const orig = n.read
      await lect.db.updateDocument(DB, 'notifications', n.$id, { read: !orig })
      await lect.db.updateDocument(DB, 'notifications', n.$id, { read: orig })
      ok('recipient can toggle read state on own notification', true)
    } else {
      ok('recipient can toggle read state on own notification', false, 'no notifications found')
    }
  }
} finally {
  console.log('\nCleaning up test data…')
  // Notifications created for the e2e workflow (by relatedId)
  try {
    const testNotifs = await adminDb.listDocuments(DB, 'notifications', [Query.equal('relatedId', 'e2e-wf'), Query.limit(100)])
    for (const n of testNotifs.documents) cleanup.docs.push(['notifications', n.$id])
  } catch { /* best-effort */ }
  for (const [col, id] of cleanup.docs.reverse()) await adminDb.deleteDocument(DB, col, id).catch(() => {})
  for (const id of cleanup.files) await adminStorage.deleteFile(BUCKET, id).catch(() => {})
  for (const id of cleanup.users) await adminUsers.delete(id).catch(() => {})
  console.log('  done')
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
