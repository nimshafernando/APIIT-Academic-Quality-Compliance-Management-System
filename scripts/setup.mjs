// One-shot Appwrite backend provisioning for AQCMS.
// Creates the database, all collections + attributes + indexes, the evidence
// storage bucket, and deploys the manage-users function — using only the
// server API key in .env (no CLI login required). Safe to re-run: existing
// resources are skipped.
//
// Usage: node scripts/setup.mjs
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { Client, Databases, Storage, Functions, Permission, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
  console.error('Missing APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY in .env')
  process.exit(1)
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
const databases = new Databases(client)
const storage = new Storage(client)
const functions = new Functions(client)

const DB_ID = 'aqcms'
const BUCKET_ID = 'evidence'
const FN_ID = 'manage-users'

const P = {
  readUsers: Permission.read(Role.users()),
  createUsers: Permission.create(Role.users()),
  superCUD: [
    Permission.create(Role.label('superadmin')),
    Permission.update(Role.label('superadmin')),
    Permission.delete(Role.label('superadmin')),
  ],
  acadCUD: [
    Permission.create(Role.label('academicadmin')),
    Permission.update(Role.label('academicadmin')),
    Permission.delete(Role.label('academicadmin')),
  ],
}

// attr shorthand: [key, type, opts]
const str = (key, size, required = false, array = false) => ({ kind: 'string', key, size, required, array })
const bool = (key, def = null) => ({ kind: 'boolean', key, required: false, def })
const int = (key) => ({ kind: 'integer', key, required: false })
const dt = (key, required = false) => ({ kind: 'datetime', key, required })
const idx = (key, attributes, type = 'key') => ({ key, type, attributes })

const structurePerms = (superOnly) => [P.readUsers, ...P.superCUD, ...(superOnly ? [] : P.acadCUD)]

const COLLECTIONS = [
  {
    id: 'profiles',
    name: 'Profiles',
    documentSecurity: true,
    permissions: [P.readUsers], // created/updated via API key (function/seed) + per-doc grants
    attributes: [
      str('userId', 64, true),
      str('name', 256, true),
      str('email', 256, true),
      str('roles', 64, false, true),
      str('status', 16),
      bool('mustChangePassword', false),
    ],
    // NOTE: array attributes (roles) cannot be indexed; Query.contains works without one.
    indexes: [idx('i_userId', ['userId']), idx('i_status', ['status']), idx('i_name', ['name'])],
  },
  {
    id: 'role_assignments',
    name: 'Role Assignments',
    documentSecurity: false,
    permissions: [P.readUsers, ...P.superCUD],
    attributes: [
      str('userId', 64, true),
      str('userName', 256),
      str('role', 64, true),
      str('scopeType', 32, true),
      str('scopeId', 64),
      str('scopeLabel', 256),
      dt('startDate'),
      dt('endDate'),
      bool('active', true),
    ],
    indexes: [idx('i_userId', ['userId']), idx('i_role', ['role']), idx('i_active', ['active'])],
  },
  {
    id: 'academic_years',
    name: 'Academic Years',
    documentSecurity: false,
    permissions: structurePerms(true),
    attributes: [str('label', 64, true), dt('startDate', true), dt('endDate', true)],
    indexes: [],
  },
  {
    id: 'programmes',
    name: 'Programmes',
    documentSecurity: false,
    permissions: structurePerms(true),
    attributes: [str('name', 256, true), str('awardingBody', 256, true), str('degreeType', 128)],
    indexes: [],
  },
  {
    id: 'levels',
    name: 'Levels',
    documentSecurity: false,
    permissions: structurePerms(true),
    attributes: [str('name', 128, true), str('programmeId', 64, true), str('programmeName', 256)],
    indexes: [],
  },
  {
    id: 'semesters',
    name: 'Semesters',
    documentSecurity: false,
    permissions: structurePerms(true),
    attributes: [
      str('name', 128, true),
      str('academicYearId', 64, true),
      str('academicYearLabel', 64),
      dt('startDate', true),
      dt('endDate', true),
    ],
    indexes: [],
  },
  {
    id: 'intakes',
    name: 'Intakes / Batches',
    documentSecurity: false,
    permissions: structurePerms(false),
    attributes: [
      str('batchCode', 128, true),
      str('programmeId', 64, true),
      str('programmeName', 256),
      str('academicYearId', 64),
      str('academicYearLabel', 64),
      str('semesterId', 64),
      str('semesterName', 128),
      int('cohortSize'),
    ],
    indexes: [],
  },
  {
    id: 'modules',
    name: 'Modules',
    documentSecurity: false,
    permissions: structurePerms(false),
    attributes: [
      str('code', 32, true),
      str('name', 256, true),
      str('programmeId', 64, true),
      str('programmeName', 256),
      str('levelId', 64, true),
      str('levelName', 128),
      str('variant', 128),
    ],
    indexes: [],
  },
  {
    id: 'module_offerings',
    name: 'Module Offerings',
    documentSecurity: false,
    permissions: structurePerms(false),
    attributes: [
      str('moduleId', 64, true),
      str('moduleCode', 32),
      str('moduleName', 256),
      str('levelId', 64),
      str('levelName', 128),
      str('intakeId', 64, true),
      str('batchCode', 128),
      str('semesterId', 64, true),
      str('semesterName', 128),
      str('moduleLeaderId', 64, true),
      str('moduleLeaderName', 256),
      str('lecturerIds', 64, false, true),
      str('lecturerNames', 256, false, true),
    ],
    indexes: [idx('i_moduleLeaderId', ['moduleLeaderId'])],
  },
  {
    id: 'subjects',
    name: 'Subjects / Components',
    documentSecurity: false,
    permissions: structurePerms(false),
    attributes: [
      str('name', 256, true),
      str('moduleId', 64, true),
      str('moduleCode', 32),
      str('moduleName', 256),
      str('levelId', 64),
      str('levelName', 128),
      str('category', 64, true),
    ],
    indexes: [],
  },
  {
    id: 'workflow_templates',
    name: 'Workflow Templates',
    documentSecurity: false,
    permissions: [P.readUsers, ...P.superCUD],
    attributes: [str('name', 256, true), str('description', 1024), bool('active', true), str('stagesJson', 8192, true)],
    indexes: [idx('i_active', ['active'])],
  },
  {
    id: 'workflow_instances',
    name: 'Workflow Instances',
    documentSecurity: true,
    // Clients can only grant permissions to their own identity, so approver
    // access lives at collection level (labels are server-set → tamper-proof).
    // The submitter gets a per-document update grant (self) for resubmission.
    permissions: [
      P.readUsers,
      P.createUsers,
      ...['verifier', 'moduleleader', 'levelcoord', 'moderator', 'hod', 'superadmin'].map((r) => Permission.update(Role.label(r))),
      Permission.delete(Role.label('superadmin')),
    ],
    attributes: [
      str('templateId', 64, true),
      str('templateName', 256),
      str('stagesJson', 8192, true),
      str('subjectId', 64, true),
      str('subjectName', 256),
      str('moduleId', 64),
      str('moduleCode', 32),
      str('moduleName', 256),
      str('levelId', 64),
      str('levelName', 128),
      str('title', 512, true),
      int('currentStageIndex'),
      str('currentStageRole', 64),
      str('currentStageLabel', 128),
      str('status', 32, true),
      str('submittedBy', 64, true),
      str('submittedByName', 256),
      str('fileIds', 64, false, true),
      str('fileNames', 512, false, true),
    ],
    indexes: [
      idx('i_submittedBy', ['submittedBy']),
      idx('i_status', ['status']),
      idx('i_currentStageRole', ['currentStageRole']),
    ],
  },
  {
    id: 'workflow_actions',
    name: 'Workflow Actions (Audit Trail)',
    documentSecurity: false,
    permissions: [P.readUsers, P.createUsers], // append-only: no update/delete for anyone
    attributes: [
      str('instanceId', 64, true),
      str('userId', 64, true),
      str('userName', 256),
      str('action', 32, true),
      int('stageIndex'),
      str('stageLabel', 128),
      str('comment', 4096),
    ],
    indexes: [idx('i_instanceId', ['instanceId'])],
  },
  {
    id: 'notifications',
    name: 'Notifications',
    documentSecurity: true,
    permissions: [P.createUsers], // read/update granted per-document to the recipient only
    attributes: [str('userId', 64, true), str('type', 64), str('message', 1024), str('relatedId', 64), bool('read', false)],
    indexes: [idx('i_userId', ['userId']), idx('i_read', ['read'])],
  },

  /* ---- Deadline & task engine ---- */
  {
    id: 'deadline_rules',
    name: 'Deadline Rules',
    documentSecurity: false,
    permissions: [
      P.readUsers,
      ...P.superCUD,
      Permission.create(Role.label('hod')),
      Permission.update(Role.label('hod')),
      Permission.delete(Role.label('hod')),
    ],
    attributes: [
      str('name', 256, true),
      str('description', 1024),
      str('anchor', 32, true), // semester_start | semester_end
      int('offsetDays'), // e.g. -63 = 9 weeks before anchor
      str('assignRole', 64, true),
      str('category', 64),
      bool('active', true),
    ],
    indexes: [idx('i_active', ['active'])],
  },
  {
    id: 'tasks',
    name: 'Tasks',
    documentSecurity: true,
    permissions: [P.createUsers, Permission.read(Role.label('hod')), Permission.read(Role.label('superadmin'))],
    attributes: [
      str('title', 512, true),
      str('description', 1024),
      str('ownerUserId', 64, true),
      str('ownerName', 256),
      str('ownerRole', 64),
      dt('dueDate', true),
      str('status', 16, true), // open | done
      str('source', 16), // rule | manual
      str('ruleId', 64),
      str('semesterId', 64),
      str('semesterName', 128),
      str('relatedLabel', 512),
      str('createdByName', 256),
      str('lastReminded', 32), // YYYY-MM-DD of last reminder (dedupe, set by deadline-engine)
      bool('escalated', false),
      str('completedByName', 256),
      dt('completedAt'),
    ],
    indexes: [idx('i_owner', ['ownerUserId']), idx('i_status', ['status']), idx('i_due', ['dueDate']), idx('i_semester', ['semesterId'])],
  },

  /* ---- Subject files: document slots + version history ---- */
  {
    id: 'document_slots',
    name: 'Document Slots',
    documentSecurity: false,
    permissions: [P.readUsers, P.createUsers, Permission.update(Role.users()), Permission.delete(Role.label('superadmin'))],
    attributes: [
      str('subjectId', 64, true),
      str('subjectName', 256),
      str('moduleId', 64),
      str('moduleCode', 32),
      str('moduleName', 256),
      str('levelName', 128),
      str('name', 256, true), // e.g. Internal Verification Form
      str('category', 64),
      bool('required', true),
      bool('restricted', false),
      str('status', 32, true), // not_started | submitted | under_review | returned | approved
      str('currentFileId', 64),
      str('currentFileName', 512),
      int('version'),
      str('reviewNote', 2048),
      str('updatedBy', 64), // uploader userId — used to grant restricted-file access
      str('updatedByName', 256),
    ],
    indexes: [idx('i_subject', ['subjectId']), idx('i_status', ['status'])],
  },
  {
    id: 'document_versions',
    name: 'Document Versions',
    documentSecurity: false,
    permissions: [P.readUsers, P.createUsers], // append-only history
    attributes: [
      str('slotId', 64, true),
      int('version'),
      str('fileId', 64, true),
      str('fileName', 512),
      str('uploadedBy', 64),
      str('uploadedByName', 256),
      str('note', 1024),
    ],
    indexes: [idx('i_slot', ['slotId'])],
  },

  /* ---- Academic support & case management ---- */
  {
    id: 'cases',
    name: 'Cases',
    documentSecurity: true,
    permissions: [P.createUsers], // visibility strictly via per-document grants (creator + HOD)
    attributes: [
      str('type', 32, true), // mentoring | ec | conduct
      str('studentRef', 128, true),
      str('title', 512, true),
      str('details', 4096),
      str('status', 32, true), // open | in_review | resolved
      str('moduleCode', 32),
      str('semesterName', 128),
      str('createdBy', 64, true),
      str('createdByName', 256),
      str('notesJson', 8192), // append-only [{by,at,text}]
    ],
    indexes: [idx('i_type', ['type']), idx('i_status', ['status']), idx('i_creator', ['createdBy'])],
  },

  /* ---- Governance (HOD) ---- */
  {
    id: 'risk_register',
    name: 'Risk Register',
    documentSecurity: false,
    permissions: [
      Permission.read(Role.label('hod')),
      Permission.create(Role.label('hod')),
      Permission.update(Role.label('hod')),
      Permission.delete(Role.label('hod')),
    ],
    attributes: [
      str('title', 512, true),
      str('description', 2048),
      str('owner', 256),
      str('severity', 16), // low | medium | high
      str('status', 32, true), // open | mitigating | closed
      dt('reviewDate'),
    ],
    indexes: [idx('i_status', ['status'])],
  },
  {
    id: 'committee_meetings',
    name: 'Committee Meetings',
    documentSecurity: false,
    permissions: [
      Permission.read(Role.label('hod')),
      Permission.create(Role.label('hod')),
      Permission.update(Role.label('hod')),
      Permission.delete(Role.label('hod')),
    ],
    attributes: [
      str('title', 512, true),
      dt('meetingDate', true),
      str('agenda', 4096),
      // >16383 chars → stored as TEXT, which doesn't count toward the row-size limit
      str('minutes', 20000),
      str('actionsJson', 20000), // [{action, owner, due, done}]
    ],
    indexes: [idx('i_date', ['meetingDate'])],
  },
  {
    id: 'governance_docs',
    name: 'Governance Documents',
    documentSecurity: false,
    permissions: [
      P.readUsers, // handbook / curriculum readable by all staff
      Permission.create(Role.label('hod')),
      Permission.update(Role.label('hod')),
      Permission.delete(Role.label('hod')),
    ],
    attributes: [
      str('name', 512, true),
      str('category', 64, true), // handbook | curriculum | other
      str('fileId', 64),
      str('fileName', 512),
      int('version'),
      str('notes', 1024),
    ],
    indexes: [idx('i_category', ['category'])],
  },

  /* ---- Staff appraisals (HOD + the staff member only; Super Admin excluded) ---- */
  {
    id: 'appraisals',
    name: 'Appraisals',
    documentSecurity: true,
    permissions: [Permission.create(Role.label('hod'))], // read/update via per-document grants
    attributes: [
      str('staffUserId', 64, true),
      str('staffName', 256),
      str('cycle', 64, true), // e.g. 2025/26
      str('goals', 4096),
      str('reviewComments', 4096),
      str('outcomeRating', 32), // exceeds | meets | developing | unsatisfactory
      str('status', 32, true), // draft | completed
      str('updatedByName', 256),
    ],
    indexes: [idx('i_staff', ['staffUserId']), idx('i_cycle', ['cycle'])],
  },
]

const exists = (err) => err?.code === 409
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureDatabase() {
  // Check first: on the free plan, create() hits the plan limit (403) before
  // the duplicate-ID check, so a plain create of an existing DB throws 403.
  try {
    await databases.get(DB_ID)
    console.log('• database aqcms already exists')
    return
  } catch (err) {
    if (err?.code !== 404) throw err
  }
  await databases.create(DB_ID, 'AQCMS')
  console.log('✔ database aqcms created')
}

async function ensureCollections() {
  for (const c of COLLECTIONS) {
    try {
      await databases.createCollection(DB_ID, c.id, c.name, c.permissions, c.documentSecurity)
      console.log(`✔ collection ${c.id} created`)
    } catch (err) {
      if (!exists(err)) throw err
      // Sync permissions so config changes propagate to existing collections
      await databases.updateCollection(DB_ID, c.id, c.name, c.permissions, c.documentSecurity, true)
      console.log(`• collection ${c.id} exists — permissions synced`)
    }
    // Limit checks run before duplicate checks on Appwrite, so query what
    // already exists instead of relying on 409s.
    const existing = new Set((await databases.listAttributes(DB_ID, c.id)).attributes.map((a) => a.key))
    for (const a of c.attributes) {
      if (existing.has(a.key)) continue
      if (a.kind === 'string') await databases.createStringAttribute(DB_ID, c.id, a.key, a.size, a.required, undefined, a.array)
      else if (a.kind === 'boolean') await databases.createBooleanAttribute(DB_ID, c.id, a.key, a.required, a.def ?? undefined)
      else if (a.kind === 'integer') await databases.createIntegerAttribute(DB_ID, c.id, a.key, a.required)
      else if (a.kind === 'datetime') await databases.createDatetimeAttribute(DB_ID, c.id, a.key, a.required)
    }
  }
  console.log('… waiting for attributes to become available')
  await sleep(6000)
  for (const c of COLLECTIONS) {
    const existingIdx = new Set((await databases.listIndexes(DB_ID, c.id)).indexes.map((i) => i.key))
    for (const i of c.indexes) {
      if (existingIdx.has(i.key)) continue
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await databases.createIndex(DB_ID, c.id, i.key, i.type, i.attributes)
          break
        } catch (err) {
          if (exists(err)) break
          if (attempt === 4) throw err
          await sleep(3000) // attribute may still be processing
        }
      }
    }
    console.log(`✔ ${c.id} indexes ready`)
  }
}

async function ensureBucket() {
  // IMPORTANT: no bucket-level read — visibility is per-file only, so
  // restricted exam papers (DOC-03) stay hidden from non-reviewers.
  const perms = [P.createUsers, Permission.update(Role.label('superadmin')), Permission.delete(Role.label('superadmin'))]
  // Free-plan limit check fires before the duplicate-ID check — probe first.
  try {
    await storage.getBucket(BUCKET_ID)
    await storage.updateBucket(BUCKET_ID, 'Evidence Files', perms, true, true, 50000000)
    console.log('• bucket evidence exists — permissions synced (file-level security only)')
    return
  } catch (err) {
    if (err?.code !== 404) throw err
  }
  await storage.createBucket(BUCKET_ID, 'Evidence Files', perms, true, true, 50000000)
  console.log('✔ bucket evidence created')
}

const FUNCTIONS = [
  {
    id: 'manage-users',
    schedule: undefined,
    execute: ['label:superadmin'],
    scopes: ['users.read', 'users.write', 'databases.read', 'collections.read', 'attributes.read', 'documents.read', 'documents.write'],
  },
  {
    id: 'deadline-engine',
    // Multi-purpose (free plan caps functions at 2): daily cron for task
    // reminders/overdue/escalation + document events. Clients cannot grant
    // permissions to OTHER users, so this function stamps recipient/oversight
    // permissions onto freshly created docs, then emails where relevant.
    schedule: '0 6 * * *',
    events: [
      `databases.${DB_ID}.collections.notifications.documents.*.create`,
      `databases.${DB_ID}.collections.tasks.documents.*.create`,
      `databases.${DB_ID}.collections.cases.documents.*.create`,
      `databases.${DB_ID}.collections.appraisals.documents.*.create`,
      `databases.${DB_ID}.collections.document_slots.documents.*.create`,
      `databases.${DB_ID}.collections.document_slots.documents.*.update`,
    ],
    execute: ['label:superadmin', 'label:hod'], // manual trigger allowed
    scopes: ['databases.read', 'collections.read', 'attributes.read', 'documents.read', 'documents.write', 'buckets.read', 'files.read', 'files.write'],
    variables: {
      RESEND_API_KEY: process.env.RESEND_API_KEY || '',
      EMAIL_DEMO_REDIRECT: process.env.EMAIL_DEMO_REDIRECT || '',
      SITE_URL: 'https://aqcms-soc.appwrite.network',
    },
  },
]

async function ensureVariable(fnId, key, value) {
  if (!value) return
  const existing = (await functions.listVariables(fnId)).variables.find((v) => v.key === key)
  if (existing) {
    if (existing.value !== value) {
      await functions.updateVariable(fnId, existing.$id, key, value)
      console.log(`  ✔ variable ${key} updated`)
    }
  } else {
    await functions.createVariable(fnId, key, value)
    console.log(`  ✔ variable ${key} set`)
  }
}

async function ensureFunctions() {
  for (const fn of FUNCTIONS) {
    // Plan-limit checks fire before duplicate checks — probe first.
    let found = false
    try {
      await functions.get(fn.id)
      found = true
      console.log(`• function ${fn.id} already exists`)
      // Keep events/schedule/scopes in sync on existing functions
      await functions.update(
        fn.id,
        fn.id,
        'node-18.0',
        fn.execute,
        fn.events,
        fn.schedule,
        60,
        true,
        true,
        'src/main.js',
        'npm install',
        fn.scopes,
      )
    } catch (err) {
      if (err?.code !== 404) throw err
    }
    try {
      if (!found) await functions.create(
        fn.id,
        fn.id,
        'node-18.0',
        fn.execute,
        fn.events,
        fn.schedule,
        60, // timeout
        true, // enabled
        true, // logging
        'src/main.js',
        'npm install',
        fn.scopes,
      )
      if (!found) console.log(`✔ function ${fn.id} created`)
    } catch (err) {
      if (!exists(err)) throw err
    }
    for (const [key, value] of Object.entries(fn.variables || {})) await ensureVariable(fn.id, key, value)
    console.log(`… packaging ${fn.id}`)
    execSync(`tar -czf ${fn.id}.tar.gz -C functions/${fn.id} .`, { stdio: 'inherit' })
    const deployment = await functions.createDeployment(fn.id, InputFile.fromPath(`${fn.id}.tar.gz`, 'code.tar.gz'), true)
    console.log(`✔ ${fn.id} deployment ${deployment.$id} uploaded (build runs on Appwrite)`)
  }
}

console.log(`Provisioning AQCMS backend on ${APPWRITE_ENDPOINT} (project ${APPWRITE_PROJECT_ID})…`)
await ensureDatabase()
await ensureCollections()
await ensureBucket()
await ensureFunctions()
console.log('\nDone. Next: node scripts/seed.mjs')
