// Demo data seeder for AQCMS. Run AFTER scripts/setup.mjs.
// Creates one demo account per role, sample academic structure, workflow
// templates from the APIITEMS Procedure Manual, and in-flight submissions so
// every dashboard shows live data on first login.
//
// All demo accounts share the password: Apiit@123
//
// Usage: node scripts/seed.mjs
import 'dotenv/config'
import { Client, Users, Databases, Storage, ID, Query, Permission, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
  console.error('Missing APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY in .env')
  process.exit(1)
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
const users = new Users(client)
const db = new Databases(client)
const storage = new Storage(client)

const DB_ID = 'aqcms'
const PASSWORD = 'Apiit@123'
const exists = (err) => err?.code === 409

// Create-or-skip helper using deterministic document IDs so reruns are safe.
async function put(collection, id, data, permissions = undefined) {
  try {
    await db.createDocument(DB_ID, collection, id, data, permissions)
    console.log(`  ✔ ${collection}/${id}`)
  } catch (err) {
    if (!exists(err)) throw err
    console.log(`  • ${collection}/${id} exists`)
  }
}

// ---------------------------------------------------------------- users ----
const DEMO_USERS = [
  { id: 'demo-superadmin', name: 'Sanjay Perera (Super Admin)', email: 'superadmin@apiit.lk', roles: ['superadmin'] },
  { id: 'demo-hod', name: 'Dr. Chaman Wijesiriwardana (HOD)', email: 'hod@apiit.lk', roles: ['hod'] },
  { id: 'demo-levelcoord', name: 'Kumari Jayasuriya (Level Coordinator)', email: 'levelcoord@apiit.lk', roles: ['levelcoord', 'lecturer'] },
  { id: 'demo-moduleleader', name: 'Ruwan Fernando (Module Leader)', email: 'moduleleader@apiit.lk', roles: ['moduleleader', 'lecturer'] },
  { id: 'demo-lecturer', name: 'Tharindu Weerasinghe (Lecturer)', email: 'lecturer@apiit.lk', roles: ['lecturer'] },
  { id: 'demo-moderator', name: 'Shanika Rathnayake (Moderator)', email: 'moderator@apiit.lk', roles: ['moderator', 'lecturer'] },
  { id: 'demo-verifier', name: 'Aisha Farook (Internal Verifier)', email: 'verifier@apiit.lk', roles: ['verifier', 'lecturer'] },
  { id: 'demo-acadadmin', name: 'Dilini Gunawardena (Academic Admin)', email: 'acadadmin@apiit.lk', roles: ['academicadmin'] },
]

async function seedUsers() {
  console.log('\nUsers & profiles:')
  for (const u of DEMO_USERS) {
    try {
      await users.create(u.id, u.email, undefined, PASSWORD, u.name)
      console.log(`  ✔ user ${u.email}`)
    } catch (err) {
      if (!exists(err)) throw err
      console.log(`  • user ${u.email} exists`)
    }
    await users.updateLabels(u.id, u.roles)
    await put(
      'profiles',
      `prof-${u.id}`,
      { userId: u.id, name: u.name, email: u.email, roles: u.roles, status: 'active', mustChangePassword: false },
      [Permission.read(Role.users()), Permission.update(Role.user(u.id)), Permission.update(Role.label('superadmin'))],
    )
  }
}

// ------------------------------------------------------------ structure ----
async function seedStructure() {
  console.log('\nAcademic structure:')
  await put('academic_years', 'ay-2025', { label: '2025/26', startDate: '2025-09-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z' })
  await put('academic_years', 'ay-2026', { label: '2026/27', startDate: '2026-09-01T00:00:00.000Z', endDate: '2027-06-30T00:00:00.000Z' })

  await put('programmes', 'prog-se', { name: 'BSc (Hons) Software Engineering', awardingBody: 'University of Staffordshire', degreeType: 'Undergraduate' })
  await put('programmes', 'prog-cs-ncuk', { name: 'BSc (Hons) Computer Science', awardingBody: 'NCUK', degreeType: 'Undergraduate' })

  await put('levels', 'lvl-4', { name: 'Level 4', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering' })
  await put('levels', 'lvl-5', { name: 'Level 5', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering' })
  await put('levels', 'lvl-6', { name: 'Level 6', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering' })
  await put('levels', 'lvl-fnd', { name: 'Foundation', programmeId: 'prog-cs-ncuk', programmeName: 'BSc (Hons) Computer Science' })

  await put('semesters', 'sem-1-2025', { name: 'Semester 1', academicYearId: 'ay-2025', academicYearLabel: '2025/26', startDate: '2025-09-15T00:00:00.000Z', endDate: '2026-01-30T00:00:00.000Z' })
  await put('semesters', 'sem-2-2025', { name: 'Semester 2', academicYearId: 'ay-2025', academicYearLabel: '2025/26', startDate: '2026-02-09T00:00:00.000Z', endDate: '2026-06-26T00:00:00.000Z' })
  await put('semesters', 'sem-1-2026', { name: 'Semester 1', academicYearId: 'ay-2026', academicYearLabel: '2026/27', startDate: '2026-09-14T00:00:00.000Z', endDate: '2027-01-29T00:00:00.000Z' })

  await put('intakes', 'int-se-2025-sep', { batchCode: 'SE-2025-SEP', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering', academicYearId: 'ay-2025', academicYearLabel: '2025/26', semesterId: 'sem-1-2025', semesterName: 'Semester 1', cohortSize: 120 })
  await put('intakes', 'int-se-2026-sep', { batchCode: 'SE-2026-SEP', programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering', academicYearId: 'ay-2026', academicYearLabel: '2026/27', semesterId: 'sem-1-2026', semesterName: 'Semester 1', cohortSize: 140 })
  await put('intakes', 'int-cs-2026-jan', { batchCode: 'CS-NCUK-2026-JAN', programmeId: 'prog-cs-ncuk', programmeName: 'BSc (Hons) Computer Science', academicYearId: 'ay-2025', academicYearLabel: '2025/26', semesterId: 'sem-2-2025', semesterName: 'Semester 2', cohortSize: 60 })

  const mod = (id, code, name, levelId, levelName, variant = 'Local') =>
    put('modules', id, { code, name, programmeId: 'prog-se', programmeName: 'BSc (Hons) Software Engineering', levelId, levelName, variant })
  await mod('mod-com2521', 'COM2521', 'Cloud Infrastructure & Design', 'lvl-5', 'Level 5')
  await mod('mod-com2612', 'COM2612', 'Interface Design and User Experience', 'lvl-5', 'Level 5')
  await mod('mod-com1580', 'COM1580', 'Web Development', 'lvl-4', 'Level 4')
  await mod('mod-com1451', 'COM1451', 'Programming Fundamentals', 'lvl-4', 'Level 4')
  await mod('mod-com3610', 'COM3610', 'Final Year Project', 'lvl-6', 'Level 6')
  await put('modules', 'mod-csf101', { code: 'CSF101', name: 'Computing Foundations', programmeId: 'prog-cs-ncuk', programmeName: 'BSc (Hons) Computer Science', levelId: 'lvl-fnd', levelName: 'Foundation', variant: 'NCUK' })

  const offer = (id, moduleId, moduleCode, moduleName, levelId, levelName) =>
    put('module_offerings', id, {
      moduleId, moduleCode, moduleName, levelId, levelName,
      intakeId: 'int-se-2025-sep', batchCode: 'SE-2025-SEP',
      semesterId: 'sem-2-2025', semesterName: 'Semester 2',
      moduleLeaderId: 'demo-moduleleader', moduleLeaderName: 'Ruwan Fernando (Module Leader)',
      lecturerIds: ['demo-lecturer'], lecturerNames: ['Tharindu Weerasinghe (Lecturer)'],
    })
  await offer('off-com2521', 'mod-com2521', 'COM2521', 'Cloud Infrastructure & Design', 'lvl-5', 'Level 5')
  await offer('off-com2612', 'mod-com2612', 'COM2612', 'Interface Design and User Experience', 'lvl-5', 'Level 5')
  await offer('off-com1580', 'mod-com1580', 'COM1580', 'Web Development', 'lvl-4', 'Level 4')
  await offer('off-com1451', 'mod-com1451', 'COM1451', 'Programming Fundamentals', 'lvl-4', 'Level 4')

  const subj = (id, name, moduleId, moduleCode, moduleName, levelId, levelName, category) =>
    put('subjects', id, { name, moduleId, moduleCode, moduleName, levelId, levelName, category })
  await subj('sub-cloud-assess', 'Cloud Infrastructure & Design — Assessment', 'mod-com2521', 'COM2521', 'Cloud Infrastructure & Design', 'lvl-5', 'Level 5', 'Assessment')
  await subj('sub-cloud-lm', 'Cloud Infrastructure & Design — Learning Materials', 'mod-com2521', 'COM2521', 'Cloud Infrastructure & Design', 'lvl-5', 'Level 5', 'Learning Material')
  await subj('sub-ux-assess', 'Interface Design & UX — Assessment', 'mod-com2612', 'COM2612', 'Interface Design and User Experience', 'lvl-5', 'Level 5', 'Assessment')
  await subj('sub-web-lss', 'Web Development — Lesson Sequence', 'mod-com1580', 'COM1580', 'Web Development', 'lvl-4', 'Level 4', 'Learning Material')
  await subj('sub-prog-marking', 'Programming Fundamentals — Marking', 'mod-com1451', 'COM1451', 'Programming Fundamentals', 'lvl-4', 'Level 4', 'Assessment')
  await subj('sub-cloud-mod', 'Cloud Infrastructure & Design — Moderation', 'mod-com2521', 'COM2521', 'Cloud Infrastructure & Design', 'lvl-5', 'Level 5', 'Moderation')
}

// ----------------------------------------------------------- assignments ----
async function seedAssignments() {
  console.log('\nScoped role assignments:')
  const asg = (id, userId, userName, role, scopeType, scopeId = '', scopeLabel = 'School-wide') =>
    put('role_assignments', id, { userId, userName, role, scopeType, scopeId, scopeLabel, active: true })

  await asg('asg-hod', 'demo-hod', 'Dr. Chaman Wijesiriwardana (HOD)', 'hod', 'global')
  await asg('asg-superadmin', 'demo-superadmin', 'Sanjay Perera (Super Admin)', 'superadmin', 'global')
  await asg('asg-lc-l5', 'demo-levelcoord', 'Kumari Jayasuriya (Level Coordinator)', 'levelcoord', 'level', 'lvl-5', 'Level 5 — BSc (Hons) Software Engineering')
  await asg('asg-lc-l4', 'demo-levelcoord', 'Kumari Jayasuriya (Level Coordinator)', 'levelcoord', 'level', 'lvl-4', 'Level 4 — BSc (Hons) Software Engineering')
  await asg('asg-ml', 'demo-moduleleader', 'Ruwan Fernando (Module Leader)', 'moduleleader', 'module', 'mod-com2521', 'COM2521 — Cloud Infrastructure & Design')
  await asg('asg-lect', 'demo-lecturer', 'Tharindu Weerasinghe (Lecturer)', 'lecturer', 'global')
  await asg('asg-mod-cycle', 'demo-moderator', 'Shanika Rathnayake (Moderator)', 'moderator', 'module', 'mod-com2521', 'COM2521 — Moderation Cycle Sem 2 2025/26')
  await asg('asg-iv', 'demo-verifier', 'Aisha Farook (Internal Verifier)', 'verifier', 'module', 'mod-com2521', 'COM2521 — Cloud Infrastructure & Design')
  await asg('asg-iv2', 'demo-verifier', 'Aisha Farook (Internal Verifier)', 'verifier', 'module', 'mod-com2612', 'COM2612 — Interface Design and User Experience')
  await asg('asg-acad', 'demo-acadadmin', 'Dilini Gunawardena (Academic Admin)', 'academicadmin', 'programme', 'prog-se', 'BSc (Hons) Software Engineering')
}

// ------------------------------------------------------------- templates ----
const TPL_FULL = [
  { order: 0, role: 'verifier', label: 'Internal Verification (IVF)' },
  { order: 1, role: 'moduleleader', label: 'Module Leader Approval' },
  { order: 2, role: 'levelcoord', label: 'Level Coordinator Approval' },
  { order: 3, role: 'hod', label: 'HOD Final Sign-off' },
]
const TPL_LSS = [{ order: 0, role: 'moduleleader', label: 'Module Leader Approval' }]
const TPL_MODERATION = [
  { order: 0, role: 'moderator', label: 'Internal Moderation (IMF)' },
  { order: 1, role: 'hod', label: 'HOD Sign-off' },
]
const TPL_TWO_TIER = [
  { order: 0, role: 'moduleleader', label: 'Module Leader Approval' },
  { order: 1, role: 'hod', label: 'HOD Sign-off' },
]

async function seedTemplates() {
  console.log('\nWorkflow templates:')
  await put('workflow_templates', 'tpl-assessment', { name: 'Assessment Preparation & Verification', description: 'ACAD-PROC-07/08 — subject file verification & sign-off chain', active: true, stagesJson: JSON.stringify(TPL_FULL) })
  await put('workflow_templates', 'tpl-lss', { name: 'Lesson Sequence Sheet Approval', description: 'ACAD-PROC-05 — learning material preparation', active: true, stagesJson: JSON.stringify(TPL_LSS) })
  await put('workflow_templates', 'tpl-moderation', { name: 'Internal Moderation of Assessments', description: 'ACAD-PROC-12 — IMF completed by assigned Moderator', active: true, stagesJson: JSON.stringify(TPL_MODERATION) })
  await put('workflow_templates', 'tpl-two-tier', { name: 'Marking & End of Module Report (2-tier)', description: 'ACAD-PROC-11 — for categories without a Level Coordinator stage', active: true, stagesJson: JSON.stringify(TPL_TWO_TIER) })
}

// -------------------------------------------------------------- instances ----
function instancePermissions(submitterId, stages) {
  const stageRoles = [...new Set(stages.map((s) => s.role))]
  return [
    Permission.read(Role.users()),
    Permission.update(Role.user(submitterId)),
    Permission.update(Role.label('superadmin')),
    Permission.update(Role.label('hod')),
    Permission.delete(Role.label('superadmin')),
    ...stageRoles.map((r) => Permission.update(Role.label(r))),
  ]
}

const LECT = { id: 'demo-lecturer', name: 'Tharindu Weerasinghe (Lecturer)' }

async function seedInstance(id, { template, stages, subject, title, stageIndex, status, actions, notifications }) {
  const stage = stages[stageIndex]
  await put(
    'workflow_instances',
    id,
    {
      templateId: template.id,
      templateName: template.name,
      stagesJson: JSON.stringify(stages),
      subjectId: subject.id,
      subjectName: subject.name,
      moduleId: subject.moduleId,
      moduleCode: subject.moduleCode,
      moduleName: subject.moduleName,
      levelId: subject.levelId,
      levelName: subject.levelName,
      title,
      currentStageIndex: stageIndex,
      currentStageRole: status === 'approved' ? '' : stage.role,
      currentStageLabel: status === 'approved' ? 'Completed' : stage.label,
      status,
      submittedBy: LECT.id,
      submittedByName: LECT.name,
      fileIds: [],
      fileNames: [],
    },
    instancePermissions(LECT.id, stages),
  )
  let n = 0
  for (const a of actions) {
    await put('workflow_actions', `${id}-act-${n++}`, { instanceId: id, ...a })
  }
  n = 0
  for (const nf of notifications || []) {
    await put('notifications', `${id}-ntf-${n++}`, { ...nf, relatedId: id, read: false }, [
      Permission.read(Role.user(nf.userId)),
      Permission.update(Role.user(nf.userId)),
      Permission.delete(Role.user(nf.userId)),
    ])
  }
}

async function seedInstances() {
  console.log('\nSample workflow instances:')
  const subCloud = { id: 'sub-cloud-assess', name: 'Cloud Infrastructure & Design — Assessment', moduleId: 'mod-com2521', moduleCode: 'COM2521', moduleName: 'Cloud Infrastructure & Design', levelId: 'lvl-5', levelName: 'Level 5' }
  const subUx = { id: 'sub-ux-assess', name: 'Interface Design & UX — Assessment', moduleId: 'mod-com2612', moduleCode: 'COM2612', moduleName: 'Interface Design and User Experience', levelId: 'lvl-5', levelName: 'Level 5' }
  const subWeb = { id: 'sub-web-lss', name: 'Web Development — Lesson Sequence', moduleId: 'mod-com1580', moduleCode: 'COM1580', moduleName: 'Web Development', levelId: 'lvl-4', levelName: 'Level 4' }
  const subMark = { id: 'sub-prog-marking', name: 'Programming Fundamentals — Marking', moduleId: 'mod-com1451', moduleCode: 'COM1451', moduleName: 'Programming Fundamentals', levelId: 'lvl-4', levelName: 'Level 4' }
  const subMod = { id: 'sub-cloud-mod', name: 'Cloud Infrastructure & Design — Moderation', moduleId: 'mod-com2521', moduleCode: 'COM2521', moduleName: 'Cloud Infrastructure & Design', levelId: 'lvl-5', levelName: 'Level 5' }

  const submitAct = (title) => ({ userId: LECT.id, userName: LECT.name, action: 'submit', stageIndex: 0, stageLabel: 'Submission', comment: title })

  // 1) Waiting on the Internal Verifier (stage 0 of the full chain)
  await seedInstance('wf-cloud-brief', {
    template: { id: 'tpl-assessment', name: 'Assessment Preparation & Verification' },
    stages: TPL_FULL,
    subject: subCloud,
    title: 'In-course Assessment Brief v1 — Semester 2',
    stageIndex: 0,
    status: 'in_progress',
    actions: [submitAct('In-course Assessment Brief v1 — Semester 2')],
    notifications: [{ userId: 'demo-verifier', type: 'approval_pending', message: '"In-course Assessment Brief v1 — Semester 2" (COM2521) is awaiting your Internal Verification (IVF).' }],
  })

  // 2) Passed IV, waiting on Module Leader (stage 1)
  await seedInstance('wf-cloud-exam', {
    template: { id: 'tpl-assessment', name: 'Assessment Preparation & Verification' },
    stages: TPL_FULL,
    subject: subCloud,
    title: 'Examination Paper & Marking Scheme — Semester 2',
    stageIndex: 1,
    status: 'in_progress',
    actions: [
      submitAct('Examination Paper & Marking Scheme — Semester 2'),
      { userId: 'demo-verifier', userName: 'Aisha Farook (Internal Verifier)', action: 'approve', stageIndex: 0, stageLabel: 'Internal Verification (IVF)', comment: 'IVF completed — mapping to learning outcomes verified.' },
    ],
    notifications: [{ userId: 'demo-moduleleader', type: 'approval_pending', message: '"Examination Paper & Marking Scheme — Semester 2" (COM2521) is awaiting your Module Leader Approval.' }],
  })

  // 3) Waiting on Level Coordinator (stage 2)
  await seedInstance('wf-ux-resit', {
    template: { id: 'tpl-assessment', name: 'Assessment Preparation & Verification' },
    stages: TPL_FULL,
    subject: subUx,
    title: 'Re-sit Assessment Pack — Semester 2',
    stageIndex: 2,
    status: 'in_progress',
    actions: [
      submitAct('Re-sit Assessment Pack — Semester 2'),
      { userId: 'demo-verifier', userName: 'Aisha Farook (Internal Verifier)', action: 'approve', stageIndex: 0, stageLabel: 'Internal Verification (IVF)', comment: 'Verified against module descriptor.' },
      { userId: 'demo-moduleleader', userName: 'Ruwan Fernando (Module Leader)', action: 'approve', stageIndex: 1, stageLabel: 'Module Leader Approval', comment: 'Approved — consistent with first-sit standard.' },
    ],
    notifications: [{ userId: 'demo-levelcoord', type: 'approval_pending', message: '"Re-sit Assessment Pack — Semester 2" (COM2612) is awaiting your Level Coordinator Approval.' }],
  })

  // 4) Returned to the lecturer for revision
  await seedInstance('wf-web-lss', {
    template: { id: 'tpl-lss', name: 'Lesson Sequence Sheet Approval' },
    stages: TPL_LSS,
    subject: subWeb,
    title: 'Lesson Sequence Sheet — Weeks 1–12',
    stageIndex: 0,
    status: 'returned',
    actions: [
      submitAct('Lesson Sequence Sheet — Weeks 1–12'),
      { userId: 'demo-moduleleader', userName: 'Ruwan Fernando (Module Leader)', action: 'return', stageIndex: 0, stageLabel: 'Module Leader Approval', comment: 'Weeks 9–10 do not match the updated module descriptor — please align the lab topics and resubmit.' },
    ],
    notifications: [{ userId: LECT.id, type: 'returned', message: '"Lesson Sequence Sheet — Weeks 1–12" was returned for revision: Weeks 9–10 do not match the updated module descriptor.' }],
  })

  // 5) Waiting on HOD final sign-off (2-tier chain, stage 1)
  await seedInstance('wf-prog-marking', {
    template: { id: 'tpl-two-tier', name: 'Marking & End of Module Report (2-tier)' },
    stages: TPL_TWO_TIER,
    subject: subMark,
    title: 'Mark Grid & End of Module Report — Semester 1',
    stageIndex: 1,
    status: 'in_progress',
    actions: [
      submitAct('Mark Grid & End of Module Report — Semester 1'),
      { userId: 'demo-moduleleader', userName: 'Ruwan Fernando (Module Leader)', action: 'approve', stageIndex: 0, stageLabel: 'Module Leader Approval', comment: 'Grades verified against the mark grid.' },
    ],
    notifications: [{ userId: 'demo-hod', type: 'approval_pending', message: '"Mark Grid & End of Module Report — Semester 1" (COM1451) is awaiting your HOD Sign-off.' }],
  })

  // 6) Waiting on the Moderator (IMF)
  await seedInstance('wf-cloud-moderation', {
    template: { id: 'tpl-moderation', name: 'Internal Moderation of Assessments' },
    stages: TPL_MODERATION,
    subject: subMod,
    title: 'Internal Moderation Sample — Semester 1 Scripts',
    stageIndex: 0,
    status: 'in_progress',
    actions: [submitAct('Internal Moderation Sample — Semester 1 Scripts')],
    notifications: [{ userId: 'demo-moderator', type: 'approval_pending', message: '"Internal Moderation Sample — Semester 1 Scripts" (COM2521) is awaiting your Internal Moderation (IMF).' }],
  })

  // 7) Fully approved & locked
  await seedInstance('wf-cloud-descriptor', {
    template: { id: 'tpl-assessment', name: 'Assessment Preparation & Verification' },
    stages: TPL_FULL,
    subject: subCloud,
    title: 'Module Descriptor & IVF — Semester 1',
    stageIndex: 3,
    status: 'approved',
    actions: [
      submitAct('Module Descriptor & IVF — Semester 1'),
      { userId: 'demo-verifier', userName: 'Aisha Farook (Internal Verifier)', action: 'approve', stageIndex: 0, stageLabel: 'Internal Verification (IVF)', comment: 'IVF complete.' },
      { userId: 'demo-moduleleader', userName: 'Ruwan Fernando (Module Leader)', action: 'approve', stageIndex: 1, stageLabel: 'Module Leader Approval', comment: 'Approved.' },
      { userId: 'demo-levelcoord', userName: 'Kumari Jayasuriya (Level Coordinator)', action: 'approve', stageIndex: 2, stageLabel: 'Level Coordinator Approval', comment: 'Level 5 records complete.' },
      { userId: 'demo-hod', userName: 'Dr. Chaman Wijesiriwardana (HOD)', action: 'approve', stageIndex: 3, stageLabel: 'HOD Final Sign-off', comment: 'Signed off for ISO 21001 evidence.' },
    ],
    notifications: [{ userId: LECT.id, type: 'approved', message: '"Module Descriptor & IVF — Semester 1" has received final sign-off. The record is now locked.' }],
  })
}

/* -------------------------------------------------- deadline rules + tasks */
async function seedDeadlines() {
  console.log('\nDeadline rules & tasks:')
  const rule = (id, name, description, anchor, offsetDays, assignRole, category) =>
    put('deadline_rules', id, { name, description, anchor, offsetDays, assignRole, category, active: true })

  await rule('rule-subjectfile', 'Prepare subject file', 'ACAD-PROC-07 — subject file prepared 9 weeks prior to semester commencement', 'semester_start', -63, 'lecturer', 'Assessment')
  await rule('rule-iv', 'Send assessments for internal verification', 'ACAD-PROC-08 — 7 weeks before semester start', 'semester_start', -49, 'lecturer', 'Assessment')
  await rule('rule-lss', 'Approve lesson sequence sheets', 'ACAD-PROC-05 — materials confirmed ≥2 weeks before delivery', 'semester_start', -14, 'moduleleader', 'Learning Material')
  await rule('rule-moderation', 'Complete internal moderation (IMF)', 'ACAD-PROC-12 — within 1 week of the marking deadline', 'semester_end', 7, 'moderator', 'Moderation')
  await rule('rule-emr', 'Submit End of Module Report', 'ACAD-PROC-11 — on module completion', 'semester_end', 14, 'lecturer', 'Assessment')

  const day = 86400000
  const taskPerms = (ownerId) => [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.update(Role.label('hod')),
    Permission.update(Role.label('superadmin')),
    Permission.delete(Role.label('hod')),
    Permission.delete(Role.label('superadmin')),
  ]
  const task = (id, title, ownerUserId, ownerName, ownerRole, dueOffsetDays, relatedLabel, extra = {}) =>
    put(
      'tasks',
      id,
      {
        title,
        description: '',
        ownerUserId,
        ownerName,
        ownerRole,
        dueDate: new Date(Date.now() + dueOffsetDays * day).toISOString(),
        status: 'open',
        source: 'rule',
        semesterId: 'sem-2-2025',
        semesterName: 'Semester 2 2025/26',
        relatedLabel,
        escalated: false,
        ...extra,
      },
      taskPerms(ownerUserId),
    )

  await task('task-emr-overdue', 'Submit End of Module Report', 'demo-lecturer', 'Tharindu Weerasinghe (Lecturer)', 'lecturer', -5, 'COM2521 · SE-2025-SEP', { ruleId: 'rule-emr' })
  await task('task-resit', 'Prepare re-sit examination paper', 'demo-lecturer', 'Tharindu Weerasinghe (Lecturer)', 'lecturer', 3, 'COM2612 · SE-2025-SEP', { source: 'manual', createdByName: 'Dr. Chaman Wijesiriwardana (HOD)' })
  await task('task-imf-overdue', 'Complete internal moderation (IMF)', 'demo-moderator', 'Shanika Rathnayake (Moderator)', 'moderator', -1, 'COM2521 · Moderation Cycle', { ruleId: 'rule-moderation' })
  await task('task-lss-ml', 'Approve lesson sequence sheets', 'demo-moduleleader', 'Ruwan Fernando (Module Leader)', 'moduleleader', 10, 'COM2521 · Sem 1 2026/27', { ruleId: 'rule-lss', semesterId: 'sem-1-2026', semesterName: 'Semester 1 2026/27' })
  await task('task-hod-signoff', 'Sign off Semester 2 subject files', 'demo-hod', 'Dr. Chaman Wijesiriwardana (HOD)', 'hod', 14, 'School-wide', { source: 'manual', createdByName: 'Dr. Chaman Wijesiriwardana (HOD)' })
}

/* ------------------------------------------------ subject file slots ------- */
async function seedSubjectFile() {
  console.log('\nSubject file document slots:')
  // Small placeholder evidence files so views/downloads work in the demo.
  const ensureFile = async (id, name, text) => {
    try {
      await storage.createFile('evidence', id, InputFile.fromBuffer(Buffer.from(text, 'utf8'), name), [Permission.read(Role.users())])
      console.log(`  ✔ file ${name}`)
    } catch (err) {
      if (err?.code !== 409) throw err
      console.log(`  • file ${name} exists`)
    }
  }
  await ensureFile('file-ivf', 'IVF-COM2521-Sem2.txt', 'Internal Verification Form — COM2521 (demo placeholder)')
  await ensureFile('file-descriptor', 'Module-Descriptor-COM2521.txt', 'Module Descriptor — COM2521 (demo placeholder)')
  await ensureFile('file-incourse-v1', 'Incourse-Brief-v1.txt', 'In-course assessment brief v1 (demo placeholder)')
  await ensureFile('file-incourse-v2', 'Incourse-Brief-v2.txt', 'In-course assessment brief v2 (demo placeholder)')
  await ensureFile('file-markscheme', 'Marking-Scheme-v1.txt', 'Marking scheme v1 (demo placeholder)')

  const base = {
    subjectId: 'sub-cloud-assess',
    subjectName: 'Cloud Infrastructure & Design — Assessment',
    moduleId: 'mod-com2521',
    moduleCode: 'COM2521',
    moduleName: 'Cloud Infrastructure & Design',
    levelName: 'Level 5',
  }
  const slot = (id, name, category, extra) => put('document_slots', id, { ...base, name, category, required: true, restricted: false, ...extra })

  await slot('slot-cloud-descriptor', 'Module Descriptor', 'Learning Material', { status: 'approved', currentFileId: 'file-descriptor', currentFileName: 'Module-Descriptor-COM2521.txt', version: 1, updatedByName: 'Ruwan Fernando (Module Leader)' })
  await slot('slot-cloud-ivf', 'Internal Verification Form (IVF)', 'Assessment', { status: 'approved', currentFileId: 'file-ivf', currentFileName: 'IVF-COM2521-Sem2.txt', version: 1, updatedByName: 'Aisha Farook (Internal Verifier)' })
  await slot('slot-cloud-incourse', 'Assessment — In-course', 'Assessment', { status: 'submitted', currentFileId: 'file-incourse-v2', currentFileName: 'Incourse-Brief-v2.txt', version: 2, updatedByName: 'Tharindu Weerasinghe (Lecturer)' })
  await slot('slot-cloud-markscheme', 'Marking Scheme', 'Assessment', { status: 'returned', currentFileId: 'file-markscheme', currentFileName: 'Marking-Scheme-v1.txt', version: 1, reviewNote: 'Grade boundaries for Task 2 do not match the assessment brief — please align and re-upload.', updatedByName: 'Ruwan Fernando (Module Leader)' })
  await slot('slot-cloud-exam', 'Assessment — Examination', 'Examination', { status: 'not_started', restricted: true, version: 0 })
  await slot('slot-cloud-emr', 'End of Module Report / NCUK Marker’s Report', 'Assessment', { status: 'not_started', version: 0 })

  const ver = (id, slotId, version, fileId, fileName, uploadedBy, uploadedByName, note = '') =>
    put('document_versions', id, { slotId, version, fileId, fileName, uploadedBy, uploadedByName, note })
  await ver('ver-descriptor-1', 'slot-cloud-descriptor', 1, 'file-descriptor', 'Module-Descriptor-COM2521.txt', 'demo-moduleleader', 'Ruwan Fernando (Module Leader)')
  await ver('ver-ivf-1', 'slot-cloud-ivf', 1, 'file-ivf', 'IVF-COM2521-Sem2.txt', 'demo-verifier', 'Aisha Farook (Internal Verifier)')
  await ver('ver-incourse-1', 'slot-cloud-incourse', 1, 'file-incourse-v1', 'Incourse-Brief-v1.txt', 'demo-lecturer', 'Tharindu Weerasinghe (Lecturer)')
  await ver('ver-incourse-2', 'slot-cloud-incourse', 2, 'file-incourse-v2', 'Incourse-Brief-v2.txt', 'demo-lecturer', 'Tharindu Weerasinghe (Lecturer)', 'Updated after moderation feedback')
  await ver('ver-markscheme-1', 'slot-cloud-markscheme', 1, 'file-markscheme', 'Marking-Scheme-v1.txt', 'demo-lecturer', 'Tharindu Weerasinghe (Lecturer)')
}

/* ------------------------------------------------ cases / governance / HR -- */
async function seedCasesGovernance() {
  console.log('\nCases, governance & appraisals:')
  const casePerms = (creatorId) => [
    Permission.read(Role.user(creatorId)),
    Permission.update(Role.user(creatorId)),
    Permission.read(Role.label('hod')),
    Permission.update(Role.label('hod')),
    Permission.delete(Role.label('hod')),
  ]
  await put(
    'cases',
    'case-mentoring-1',
    {
      type: 'mentoring', studentRef: 'CB011223', title: 'Attendance concern — weekly mentoring agreed',
      details: 'Student missed 4 consecutive lab sessions. Mentoring sessions scheduled every Friday; parents informed via programme office.',
      status: 'open', moduleCode: 'COM2521', semesterName: 'Semester 2 2025/26',
      createdBy: 'demo-lecturer', createdByName: 'Tharindu Weerasinghe (Lecturer)',
      notesJson: JSON.stringify([{ by: 'Tharindu Weerasinghe (Lecturer)', at: new Date().toISOString(), text: 'First session completed — student attended.' }]),
    },
    casePerms('demo-lecturer'),
  )
  await put(
    'cases',
    'case-ec-1',
    {
      type: 'ec', studentRef: 'CB010877', title: 'EC application — hospitalisation during exam week',
      details: 'Medical certificate submitted covering the examination window. Deferral to re-sit window recommended.',
      status: 'in_review', moduleCode: 'COM2612', semesterName: 'Semester 2 2025/26',
      createdBy: 'demo-lecturer', createdByName: 'Tharindu Weerasinghe (Lecturer)', notesJson: '[]',
    },
    casePerms('demo-lecturer'),
  )
  await put(
    'cases',
    'case-conduct-1',
    {
      type: 'conduct', studentRef: 'CB009454', title: 'Suspected plagiarism — in-course submission',
      details: 'Similarity report flagged 68% overlap with an online repository. Evidence pack attached to the module file.',
      status: 'open', moduleCode: 'COM2521', semesterName: 'Semester 2 2025/26',
      createdBy: 'demo-moduleleader', createdByName: 'Ruwan Fernando (Module Leader)', notesJson: '[]',
    },
    casePerms('demo-moduleleader'),
  )

  await put('risk_register', 'risk-1', {
    title: 'Assessment briefs at risk of missing the 9-week deadline for Sem 1 2026/27',
    description: 'Two Level 5 modules have no assigned internal verifier for the coming semester.',
    owner: 'Dr. Chaman Wijesiriwardana', severity: 'high', status: 'open',
    reviewDate: new Date(Date.now() + 14 * 86400000).toISOString(),
  })
  await put('risk_register', 'risk-2', {
    title: 'Single moderator covering all Level 5 modules',
    description: 'Moderation timeline depends on one staff member; identify a backup moderator.',
    owner: 'Kumari Jayasuriya', severity: 'medium', status: 'mitigating',
    reviewDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  })

  await put('committee_meetings', 'meet-1', {
    title: 'Programme Committee — Semester 2 Review',
    meetingDate: '2026-06-20T09:00:00.000Z',
    agenda: '1. Semester 2 results overview\n2. Moderation feedback\n3. Sem 1 2026/27 readiness',
    minutes: 'Results ratified. Moderation feedback noted for COM2521 marking scheme. Readiness tracker to be reviewed weekly until semester start.',
    actionsJson: JSON.stringify([
      { action: 'Assign second moderator for Level 5', owner: 'HOD', due: '2026-07-25', done: false },
      { action: 'Publish re-sit timetable', owner: 'Academic Admin', due: '2026-07-05', done: true },
    ]),
  })

  await put('governance_docs', 'gov-handbook', {
    name: 'Student Handbook 2026/27', category: 'handbook', version: 1, notes: 'Final upload pending registry sign-off.',
  })

  const apprPerms = (staffId) => [
    Permission.read(Role.label('hod')),
    Permission.update(Role.label('hod')),
    Permission.delete(Role.label('hod')),
    Permission.read(Role.user(staffId)),
  ]
  await put(
    'appraisals',
    'apr-lect-2025',
    {
      staffUserId: 'demo-lecturer', staffName: 'Tharindu Weerasinghe (Lecturer)', cycle: '2025/26',
      goals: '1. Complete PGCHE module.\n2. Reduce marking turnaround to under 2 weeks.\n3. Co-author one applied research output.',
      reviewComments: 'Consistently strong student feedback (4.5/5). Marking deadlines met in Semester 2 after Semester 1 slippage.',
      outcomeRating: 'meets', status: 'completed', updatedByName: 'Dr. Chaman Wijesiriwardana (HOD)',
    },
    apprPerms('demo-lecturer'),
  )
  await put(
    'appraisals',
    'apr-ml-2025',
    {
      staffUserId: 'demo-moduleleader', staffName: 'Ruwan Fernando (Module Leader)', cycle: '2025/26',
      goals: 'Lead the NCUK variant rollout for Level 4 modules; mentor two new lecturers.',
      reviewComments: '', outcomeRating: '', status: 'draft', updatedByName: 'Dr. Chaman Wijesiriwardana (HOD)',
    },
    apprPerms('demo-moduleleader'),
  )
}

console.log(`Seeding AQCMS demo data on ${APPWRITE_ENDPOINT} (project ${APPWRITE_PROJECT_ID})…`)
await seedUsers()
await seedStructure()
await seedAssignments()
await seedTemplates()
await seedInstances()
await seedDeadlines()
await seedSubjectFile()
await seedCasesGovernance()
console.log(`\nDone. Demo password for all accounts: ${PASSWORD}`)
console.log(DEMO_USERS.map((u) => `  ${u.email}`).join('\n'))
