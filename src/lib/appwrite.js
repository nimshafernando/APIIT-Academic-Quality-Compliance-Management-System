import { Client, Account, Databases, Storage, Functions, ID, Query, Permission, Role } from 'appwrite'

export const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
export const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || ''

export const DB_ID = 'aqcms'
export const BUCKET_ID = 'evidence'
export const FN_MANAGE_USERS = 'manage-users'

export const COL = {
  PROFILES: 'profiles',
  ROLE_ASSIGNMENTS: 'role_assignments',
  ACADEMIC_YEARS: 'academic_years',
  PROGRAMMES: 'programmes',
  LEVELS: 'levels',
  SEMESTERS: 'semesters',
  INTAKES: 'intakes',
  MODULES: 'modules',
  MODULE_OFFERINGS: 'module_offerings',
  SUBJECTS: 'subjects',
  WORKFLOW_TEMPLATES: 'workflow_templates',
  WORKFLOW_INSTANCES: 'workflow_instances',
  WORKFLOW_ACTIONS: 'workflow_actions',
  NOTIFICATIONS: 'notifications',
  DEADLINE_RULES: 'deadline_rules',
  TASKS: 'tasks',
  DOCUMENT_SLOTS: 'document_slots',
  DOCUMENT_VERSIONS: 'document_versions',
  CASES: 'cases',
  RISK_REGISTER: 'risk_register',
  COMMITTEE_MEETINGS: 'committee_meetings',
  GOVERNANCE_DOCS: 'governance_docs',
  APPRAISALS: 'appraisals',
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID)

export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)
export const functions = new Functions(client)
export { ID, Query, Permission, Role, client }

// ---- Generic helpers -------------------------------------------------------

export async function listAll(collectionId, queries = []) {
  // Pages through a collection (Appwrite caps a single list at 100 by default).
  const docs = []
  let cursor = null
  for (;;) {
    const q = [...queries, Query.limit(100)]
    if (cursor) q.push(Query.cursorAfter(cursor))
    const res = await databases.listDocuments(DB_ID, collectionId, q)
    docs.push(...res.documents)
    if (res.documents.length < 100) break
    cursor = res.documents[res.documents.length - 1].$id
  }
  return docs
}

export function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---- Notifications ---------------------------------------------------------

export async function notify(recipientUserId, type, message, relatedId = '') {
  try {
    // Created with NO permissions (clients cannot grant other users access);
    // the deadline-engine function stamps the recipient's permissions on the
    // create event, which also delivers it over Realtime and email.
    await databases.createDocument(DB_ID, COL.NOTIFICATIONS, ID.unique(), {
      userId: recipientUserId,
      type,
      message,
      relatedId,
      read: false,
    })
  } catch (err) {
    // Notifications are best-effort; never block the main action on them.
    console.warn('notify failed', err)
  }
}

// Notify every user currently holding a role (e.g. next approvers).
export async function notifyRole(role, type, message, relatedId = '') {
  try {
    const profiles = await listAll(COL.PROFILES, [
      Query.contains('roles', role),
      Query.equal('status', 'active'),
    ])
    const userIds = [...new Set(profiles.map((p) => p.userId))]
    await Promise.all(userIds.map((uid) => notify(uid, type, message, relatedId)))
  } catch (err) {
    console.warn('notifyRole failed', err)
  }
}
