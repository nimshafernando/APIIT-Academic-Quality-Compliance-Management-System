import { useCallback, useEffect, useState } from 'react'
import { databases, functions, DB_ID, COL, FN_MANAGE_USERS, ID, listAll, Query, fmtDate } from '../../lib/appwrite'
import { ROLES, ROLE_LABELS, SCOPE_TYPES, SCOPE_TYPE_LABELS } from '../../lib/roles'
import { PageHeader, Table, Modal, Spinner, EmptyState, ErrorBanner, StatusBadge, RoleChip, Avatar } from '../../components/UI'

const ALL_ROLES = Object.values(ROLES)

// Which collection provides the scope options for each scope type
const SCOPE_SOURCE = {
  [SCOPE_TYPES.PROGRAMME]: { collection: COL.PROGRAMMES, label: (d) => d.name },
  [SCOPE_TYPES.LEVEL]: { collection: COL.LEVELS, label: (d) => `${d.name} — ${d.programmeName}` },
  [SCOPE_TYPES.MODULE]: { collection: COL.MODULES, label: (d) => `${d.code} — ${d.name}` },
  [SCOPE_TYPES.OFFERING]: { collection: COL.MODULE_OFFERINGS, label: (d) => `${d.moduleCode} · ${d.batchCode} · ${d.semesterName}` },
}

async function callManageUsers(payload) {
  const exec = await functions.createExecution(FN_MANAGE_USERS, JSON.stringify(payload), false)
  let body = {}
  try {
    body = JSON.parse(exec.responseBody || '{}')
  } catch {
    /* non-JSON error body */
  }
  if (exec.responseStatusCode >= 400 || body.error) {
    throw new Error(body.error || `User management failed (HTTP ${exec.responseStatusCode}).`)
  }
  return body
}

function RolePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-1 rounded-lg border border-gray-300 p-2 sm:grid-cols-2">
      {ALL_ROLES.map((r) => (
        <label key={r} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
          <input
            type="checkbox"
            checked={value.includes(r)}
            onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))}
          />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </div>
  )
}

function UserForm({ initial, onSave, onCancel, busy }) {
  const [name, setName] = useState(initial?.name || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [password, setPassword] = useState('')
  const [rolesSel, setRolesSel] = useState(initial?.roles || [ROLES.LECTURER])
  const isEdit = !!initial

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ name, email, password, roles: rolesSel })
      }}
      className="space-y-4"
    >
      <div>
        <label className="label">Full Name *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Email *</label>
        <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isEdit} />
      </div>
      {!isEdit && (
        <div>
          <label className="label">Temporary Password *</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Min 8 characters — user must change it on first login" />
        </div>
      )}
      <div>
        <label className="label">Roles *</label>
        <RolePicker value={rolesSel} onChange={setRolesSel} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={busy || !rolesSel.length} className="btn-primary">
          {busy ? 'Saving…' : isEdit ? 'Update Roles' : 'Create Account'}
        </button>
      </div>
    </form>
  )
}

function AssignmentsModal({ profile, onClose }) {
  const [assignments, setAssignments] = useState(null)
  const [scopeDocs, setScopeDocs] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ role: ROLES.LECTURER, scopeType: SCOPE_TYPES.GLOBAL, scopeId: '', startDate: '', endDate: '' })

  const load = useCallback(async () => {
    const rows = await listAll(COL.ROLE_ASSIGNMENTS, [Query.equal('userId', profile.userId), Query.orderDesc('$createdAt')])
    setAssignments(rows)
  }, [profile.userId])

  useEffect(() => {
    load().catch((e) => setError(e?.message))
    // Preload scope options for all scope types
    ;(async () => {
      const entries = await Promise.all(
        Object.entries(SCOPE_SOURCE).map(async ([type, src]) => [type, await listAll(src.collection)]),
      )
      setScopeDocs(Object.fromEntries(entries))
    })().catch(() => {})
  }, [load])

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const src = SCOPE_SOURCE[form.scopeType]
      const scopeDoc = src ? (scopeDocs[form.scopeType] || []).find((d) => d.$id === form.scopeId) : null
      await databases.createDocument(DB_ID, COL.ROLE_ASSIGNMENTS, ID.unique(), {
        userId: profile.userId,
        userName: profile.name,
        role: form.role,
        scopeType: form.scopeType,
        scopeId: form.scopeId || '',
        scopeLabel: scopeDoc ? src.label(scopeDoc) : 'School-wide',
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        active: true,
      })
      setForm({ role: ROLES.LECTURER, scopeType: SCOPE_TYPES.GLOBAL, scopeId: '', startDate: '', endDate: '' })
      await load()
    } catch (err) {
      setError(err?.message || 'Failed to add assignment.')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (a) => {
    try {
      await databases.updateDocument(DB_ID, COL.ROLE_ASSIGNMENTS, a.$id, { active: !a.active })
      await load()
    } catch (err) {
      setError(err?.message)
    }
  }

  const scopeOptions = SCOPE_SOURCE[form.scopeType] ? scopeDocs[form.scopeType] || [] : []

  return (
    <Modal open onClose={onClose} title={`Scoped Assignments — ${profile.name}`} wide>
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <p className="mb-4 text-sm text-gray-500">
        Time-bound, scoped role assignments (SRS AUTH-03/ADM-02) — e.g. Level Coordinator for Level 5, Moderator for a
        specific module this cycle. These drive scoping of approval queues and dashboards.
      </p>

      {assignments === null ? (
        <Spinner />
      ) : (
        <div className="mb-5 max-h-56 overflow-x-auto overflow-y-auto">
          {assignments.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-400">No scoped assignments yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                  <th className="py-1 pr-3">Role</th>
                  <th className="py-1 pr-3">Scope</th>
                  <th className="py-1 pr-3">Window</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => (
                  <tr key={a.$id}>
                    <td className="py-2 pr-3 font-medium">{ROLE_LABELS[a.role] || a.role}</td>
                    <td className="py-2 pr-3">{SCOPE_TYPE_LABELS[a.scopeType]}{a.scopeLabel && a.scopeType !== 'global' ? ` · ${a.scopeLabel}` : ''}</td>
                    <td className="py-2 pr-3 text-xs text-gray-500">
                      {a.startDate || a.endDate ? `${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}` : 'Open-ended'}
                    </td>
                    <td className="py-2 pr-3"><StatusBadge status={a.active ? 'active' : 'inactive'} /></td>
                    <td className="py-2 text-right">
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => toggle(a)}>
                        {a.active ? 'Revoke' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <form onSubmit={add} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="mb-3 text-sm font-bold text-gray-700">Add Assignment</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Scope Type</label>
            <select className="input" value={form.scopeType} onChange={(e) => setForm({ ...form, scopeType: e.target.value, scopeId: '' })}>
              {Object.values(SCOPE_TYPES).map((t) => (
                <option key={t} value={t}>{SCOPE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          {SCOPE_SOURCE[form.scopeType] && (
            <div className="sm:col-span-2">
              <label className="label">Scope</label>
              <select className="input" value={form.scopeId} onChange={(e) => setForm({ ...form, scopeId: e.target.value })} required>
                <option value="">— Select —</option>
                {scopeOptions.map((d) => (
                  <option key={d.$id} value={d.$id}>{SCOPE_SOURCE[form.scopeType].label(d)}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={busy} className="btn-teal">{busy ? 'Adding…' : '+ Add Assignment'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ADM-03: bulk import staff from CSV — columns: name,email,password,roles
// (roles separated by ; e.g. "lecturer;moduleleader")
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const rows = lines.map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
  if (rows[0]?.[0]?.toLowerCase() === 'name') rows.shift() // header row
  return rows.map(([name, email, password, roles]) => ({
    name,
    email,
    password,
    roles: (roles || 'lecturer').split(/[;|]/).map((r) => r.trim()).filter(Boolean),
  }))
}

export default function Users() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null) // {} create | { doc } edit roles
  const [assignFor, setAssignFor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles(await listAll(COL.PROFILES, [Query.orderAsc('name')]))
    } catch (err) {
      setError(err?.message || 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async ({ name, email, password, roles }) => {
    setBusy(true)
    setError('')
    try {
      if (modal.doc) {
        await callManageUsers({ action: 'setRoles', userId: modal.doc.userId, roles })
      } else {
        await callManageUsers({ action: 'create', name, email, password, roles })
        setNotice(`Account created for ${name}. They must change the temporary password on first login.`)
      }
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Operation failed.')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (p) => {
    const deactivate = p.status === 'active'
    if (deactivate && !window.confirm(`Deactivate ${p.name}? They will no longer be able to log in; their audit history is retained.`)) return
    setError('')
    try {
      await callManageUsers({ action: deactivate ? 'deactivate' : 'activate', userId: p.userId })
      await load()
    } catch (err) {
      setError(err?.message)
    }
  }

  const resetPassword = async (p) => {
    const pwd = window.prompt(`New temporary password for ${p.name} (min 8 chars). They will be forced to change it on next login:`)
    if (!pwd) return
    setError('')
    try {
      await callManageUsers({ action: 'resetPassword', userId: p.userId, password: pwd })
      setNotice(`Password reset for ${p.name}.`)
    } catch (err) {
      setError(err?.message)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Super Admin console — create accounts, assign roles, and manage scoped assignments (SRS ADM-01/02, AUTH-05)."
        actions={
          <>
            <label className={`btn-secondary ${importing ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`} title="CSV columns: name,email,password,roles (roles separated by ;)">
              {importing ? 'Importing…' : '⇪ Import CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setImporting(true)
                  setError('')
                  const results = { ok: 0, failed: [] }
                  try {
                    const rows = parseCsv(await file.text())
                    for (const row of rows) {
                      try {
                        await callManageUsers({ action: 'create', ...row })
                        results.ok++
                      } catch (err) {
                        results.failed.push(`${row.email || '(no email)'}: ${err.message}`)
                      }
                    }
                    setNotice(`Imported ${results.ok} account(s).${results.failed.length ? ` Failed: ${results.failed.join(' · ')}` : ''}`)
                    await load()
                  } catch (err) {
                    setError(err?.message || 'Import failed.')
                  } finally {
                    setImporting(false)
                  }
                }}
              />
            </label>
            <button className="btn-primary" onClick={() => setModal({})}>+ Create Account</button>
          </>
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {notice && (
        <div className="mb-4 flex items-start justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="ml-3 font-bold">×</button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : profiles.length === 0 ? (
        <EmptyState title="No users yet" message="Create the first staff account, or run the seed script for demo data." />
      ) : (
        <Table headers={['Name', 'Email', 'Roles', 'Status', 'Actions']}>
          {profiles.map((p) => (
            <tr key={p.$id} className="hover:bg-gray-50">
              <td className="td">
                <span className="flex items-center gap-3">
                  <Avatar name={p.name} className="h-9 w-9 text-xs" />
                  <span className="font-bold text-gray-900">{p.name?.replace(/\(.*?\)/g, '').trim()}</span>
                </span>
              </td>
              <td className="td text-gray-500">{p.email}</td>
              <td className="td">
                <div className="flex max-w-xs flex-wrap gap-1">
                  {(p.roles || []).map((r) => (
                    <RoleChip key={r} role={r} label={ROLE_LABELS[r]} />
                  ))}
                </div>
              </td>
              <td className="td"><StatusBadge status={p.status} /></td>
              <td className="td">
                <div className="flex flex-wrap gap-1">
                  <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setModal({ doc: p })}>Roles</button>
                  <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setAssignFor(p)}>Assignments</button>
                  <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => resetPassword(p)}>Reset PW</button>
                  <button className={`!px-2 !py-1 text-xs ${p.status === 'active' ? 'btn-danger' : 'btn-teal'}`} onClick={() => toggleActive(p)}>
                    {p.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.doc ? `Edit Roles — ${modal.doc.name}` : 'Create Staff Account'}>
        {modal && <UserForm initial={modal.doc} onSave={save} onCancel={() => setModal(null)} busy={busy} />}
      </Modal>

      {assignFor && <AssignmentsModal profile={assignFor} onClose={() => setAssignFor(null)} />}
    </div>
  )
}
