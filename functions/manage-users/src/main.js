import { Client, Users, Databases, ID, Query, Permission, Role } from 'node-appwrite'

const DB_ID = 'aqcms'
const PROFILES = 'profiles'
const VALID_ROLES = [
  'superadmin',
  'academicadmin',
  'hod',
  'levelcoord',
  'moduleleader',
  'verifier',
  'moderator',
  'lecturer',
]

// Admin-only user management (SRS AUTH-05/ADM-01/ADM-02).
// Executed by the Super Admin from the web app; runs with an API key so it can
// create accounts and set labels, which the client SDK cannot do.
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY)

  const users = new Users(client)
  const databases = new Databases(client)

  // Verify the caller is a Super Admin (defence in depth on top of the
  // function's execute permission, which is already label:superadmin).
  const callerId = req.headers['x-appwrite-user-id']
  if (!callerId) return res.json({ error: 'Not authenticated.' }, 401)
  try {
    const caller = await users.get(callerId)
    if (!(caller.labels || []).includes('superadmin')) {
      return res.json({ error: 'Only the Super Admin can manage user accounts.' }, 403)
    }
  } catch {
    return res.json({ error: 'Could not verify caller.' }, 403)
  }

  let payload
  try {
    payload = JSON.parse(req.body || '{}')
  } catch {
    return res.json({ error: 'Invalid JSON payload.' }, 400)
  }

  const { action } = payload

  const getProfile = async (userId) => {
    const found = await databases.listDocuments(DB_ID, PROFILES, [Query.equal('userId', userId), Query.limit(1)])
    return found.documents[0] || null
  }

  const cleanRoles = (roles) => (Array.isArray(roles) ? roles.filter((r) => VALID_ROLES.includes(r)) : [])

  try {
    switch (action) {
      case 'create': {
        const { name, email, password, roles } = payload
        const roleList = cleanRoles(roles)
        if (!name || !email || !password) return res.json({ error: 'name, email and password are required.' }, 400)
        if (password.length < 8) return res.json({ error: 'Password must be at least 8 characters.' }, 400)
        if (!roleList.length) return res.json({ error: 'At least one valid role is required.' }, 400)

        const user = await users.create(ID.unique(), email, undefined, password, name)
        await users.updateLabels(user.$id, roleList)
        const profile = await databases.createDocument(
          DB_ID,
          PROFILES,
          ID.unique(),
          { userId: user.$id, name, email, roles: roleList, status: 'active', mustChangePassword: true },
          [
            Permission.read(Role.users()),
            Permission.update(Role.user(user.$id)), // owner clears mustChangePassword after first login
            Permission.update(Role.label('superadmin')),
          ],
        )
        log(`Created user ${email} (${user.$id}) with roles ${roleList.join(',')}`)
        return res.json({ ok: true, userId: user.$id, profileId: profile.$id })
      }

      case 'setRoles': {
        const { userId, roles } = payload
        const roleList = cleanRoles(roles)
        if (!userId || !roleList.length) return res.json({ error: 'userId and at least one valid role are required.' }, 400)
        await users.updateLabels(userId, roleList)
        const profile = await getProfile(userId)
        if (profile) await databases.updateDocument(DB_ID, PROFILES, profile.$id, { roles: roleList })
        return res.json({ ok: true })
      }

      case 'deactivate':
      case 'activate': {
        const { userId } = payload
        if (!userId) return res.json({ error: 'userId is required.' }, 400)
        if (userId === callerId && action === 'deactivate') {
          return res.json({ error: 'You cannot deactivate your own account.' }, 400)
        }
        await users.updateStatus(userId, action === 'activate')
        const profile = await getProfile(userId)
        if (profile) {
          await databases.updateDocument(DB_ID, PROFILES, profile.$id, {
            status: action === 'activate' ? 'active' : 'inactive',
          })
        }
        return res.json({ ok: true })
      }

      case 'resetPassword': {
        const { userId, password } = payload
        if (!userId || !password || password.length < 8) {
          return res.json({ error: 'userId and a password of at least 8 characters are required.' }, 400)
        }
        await users.updatePassword(userId, password)
        const profile = await getProfile(userId)
        if (profile) await databases.updateDocument(DB_ID, PROFILES, profile.$id, { mustChangePassword: true })
        return res.json({ ok: true })
      }

      default:
        return res.json({ error: `Unknown action "${action}".` }, 400)
    }
  } catch (err) {
    error(String(err))
    return res.json({ error: err?.message || 'Operation failed.' }, 500)
  }
}
