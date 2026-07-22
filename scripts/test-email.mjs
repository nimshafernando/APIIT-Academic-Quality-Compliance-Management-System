// Creates a test notification, which triggers the email-notify function,
// then reports the function's execution result (i.e. whether the email sent).
// Usage: node scripts/test-email.mjs
import 'dotenv/config'
import { Client, Databases, Functions, ID, Permission, Role, Query } from 'node-appwrite'

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env
const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY)
const db = new Databases(client)
const functions = new Functions(client)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const before = new Date().toISOString()
console.log('Creating a test notification (this should trigger email-notify)…')
await db.createDocument(
  'aqcms',
  'notifications',
  ID.unique(),
  {
    userId: 'demo-verifier', // the assigned IV for wf-cloud-brief — so the Approve/Decline buttons in the email are genuinely actionable
    type: 'approval_pending',
    message: 'TEST EMAIL — "In-course Assessment Brief v1" (COM2521) is awaiting your Internal Verification. This message confirms that AQCMS email notifications are configured correctly.',
    relatedId: 'wf-cloud-brief',
    read: false,
    fromName: 'Tharindu Weerasinghe (Lecturer)',
  },
  [Permission.read(Role.user('demo-verifier')), Permission.update(Role.user('demo-verifier')), Permission.delete(Role.user('demo-verifier'))],
)

console.log('Waiting for the event-triggered execution…')
for (let i = 0; i < 15; i++) {
  await sleep(4000)
  const execs = await functions.listExecutions('deadline-engine', [Query.orderDesc('$createdAt'), Query.limit(3)])
  const recent = execs.executions.find((e) => e.$createdAt >= before && e.trigger === 'event')
  if (recent && ['completed', 'failed'].includes(recent.status)) {
    console.log(`Execution ${recent.$id}: status=${recent.status} http=${recent.responseStatusCode}`)
    if (recent.errors) console.log('stderr:', recent.errors.slice(0, 500))
    if (recent.logs) console.log('logs:', recent.logs.slice(0, 500))
    process.exit(recent.status === 'completed' && recent.responseStatusCode < 400 ? 0 : 1)
  }
  if (recent) console.log(`  … execution ${recent.$id} status=${recent.status}`)
}
console.log('Timed out waiting for the execution — check Appwrite Console → Functions → deadline-engine → Executions.')
process.exit(1)
