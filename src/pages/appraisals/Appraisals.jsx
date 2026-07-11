import { useCallback, useEffect, useState } from 'react'
import { databases, DB_ID, COL, ID, Permission, Role, listAll, Query, fmtDate, notify } from '../../lib/appwrite'
import { ROLES } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner, StatusBadge, Modal, Avatar } from '../../components/UI'
import Icon from '../../components/Icons'

const RATINGS = ['exceeds', 'meets', 'developing', 'unsatisfactory']
const RATING_STYLES = {
  exceeds: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  meets: 'bg-brand-tealLight text-brand-tealDeep ring-1 ring-brand-teal/20',
  developing: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  unsatisfactory: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

// APR-01..03 — appraisal records visible ONLY to the HOD and the staff member.
// The Super Admin has no read permission on these documents by design.
export default function Appraisals() {
  const { user, hasRole } = useAuth()
  const isHod = hasRole(ROLES.HOD)
  const [rows, setRows] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({})

  const load = useCallback(async () => {
    try {
      // Document security scopes this automatically: HOD sees all, staff see their own.
      setRows(await listAll(COL.APPRAISALS, [Query.orderDesc('$updatedAt')]))
      if (isHod) setProfiles(await listAll(COL.PROFILES, [Query.equal('status', 'active')]))
    } catch (err) {
      setError(err?.message)
      setRows([])
    }
  }, [isHod])

  useEffect(() => { load() }, [load])

  const open = (doc) => {
    setForm(
      doc
        ? { staffUserId: doc.staffUserId, cycle: doc.cycle, goals: doc.goals, reviewComments: doc.reviewComments, outcomeRating: doc.outcomeRating || 'meets', status: doc.status }
        : { staffUserId: '', cycle: '2025/26', goals: '', reviewComments: '', outcomeRating: 'meets', status: 'draft' },
    )
    setModal(doc || {})
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const staff = profiles.find((p) => p.userId === form.staffUserId)
      const data = { ...form, staffName: staff?.name || modal.staffName || '', updatedByName: user.name }
      if (modal.$id) {
        await databases.updateDocument(DB_ID, COL.APPRAISALS, modal.$id, data)
      } else {
        // HOD grants their own label; the deadline-engine function adds the
        // staff member's read-only access on the create event (APR-03).
        await databases.createDocument(DB_ID, COL.APPRAISALS, ID.unique(), data, [
          Permission.read(Role.label(ROLES.HOD)),
          Permission.update(Role.label(ROLES.HOD)),
          Permission.delete(Role.label(ROLES.HOD)),
        ])
        await notify(form.staffUserId, 'appraisal', `Your ${form.cycle} appraisal record has been ${form.status === 'completed' ? 'completed' : 'started'} by the HOD.`)
      }
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) return <Spinner />

  const cycles = [...new Set(rows.map((r) => r.cycle))]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={isHod ? 'Staff Appraisals' : 'My Appraisals'}
        subtitle={
          isHod
            ? 'Appraisal records per staff member per cycle. Visible only to you and the staff member concerned — not the Super Admin (APR-03).'
            : 'Your appraisal records, shared with you by the HOD. Only you and the HOD can see these.'
        }
        actions={isHod && <button className="btn-primary" onClick={() => open(null)}><Icon name="plus" className="h-4 w-4" /> New Appraisal</button>}
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {isHod && cycles.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {cycles.slice(0, 4).map((c) => {
            const inCycle = rows.filter((r) => r.cycle === c)
            const done = inCycle.filter((r) => r.status === 'completed').length
            return (
              <div key={c} className="card px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Cycle {c}</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-tealDark">{done}/{inCycle.length}</p>
                <p className="text-xs text-gray-400">completed</p>
              </div>
            )
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No appraisal records" message={isHod ? 'Record an appraisal per staff member per cycle.' : 'Nothing recorded for you yet.'} icon="briefcase" />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <button
              key={r.$id}
              onClick={() => (isHod ? open(r) : setModal(r))}
              className="card-hover flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <Avatar name={r.staffName} className="h-10 w-10 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900">{r.staffName?.replace(/\(.*?\)/g, '').trim()}</p>
                <p className="text-xs text-gray-400">Cycle {r.cycle} · last updated {fmtDate(r.$updatedAt)}</p>
              </div>
              {r.outcomeRating && <span className={`chip ${RATING_STYLES[r.outcomeRating]}`}>{r.outcomeRating}</span>}
              <StatusBadge status={r.status} />
            </button>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={isHod ? (modal?.$id ? `Appraisal — ${modal.staffName}` : 'New Appraisal') : `Appraisal — Cycle ${modal?.cycle}`} wide>
        {modal && isHod ? (
          <form onSubmit={save} className="space-y-4">
            {!modal.$id && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Staff Member *</label>
                  <select className="input" value={form.staffUserId} onChange={(e) => setForm({ ...form, staffUserId: e.target.value })} required>
                    <option value="">— Select —</option>
                    {profiles.filter((p) => p.userId !== user.$id).map((p) => (
                      <option key={p.userId} value={p.userId}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div><label className="label">Cycle *</label><input className="input" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} required placeholder="e.g. 2025/26" /></div>
              </div>
            )}
            <div><label className="label">Goals</label><textarea className="input" rows={3} value={form.goals || ''} onChange={(e) => setForm({ ...form, goals: e.target.value })} /></div>
            <div><label className="label">Review Comments</label><textarea className="input" rows={3} value={form.reviewComments || ''} onChange={(e) => setForm({ ...form, reviewComments: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Outcome Rating</label>
                <select className="input" value={form.outcomeRating} onChange={(e) => setForm({ ...form, outcomeRating: e.target.value })}>
                  {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save Appraisal'}</button>
            </div>
          </form>
        ) : modal ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={modal.status} />
              {modal.outcomeRating && <span className={`chip ${RATING_STYLES[modal.outcomeRating]}`}>{modal.outcomeRating}</span>}
            </div>
            <div><p className="label">Goals</p><p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{modal.goals || '—'}</p></div>
            <div><p className="label">Review Comments</p><p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{modal.reviewComments || '—'}</p></div>
            <p className="text-xs text-gray-400">Recorded by {modal.updatedByName} · {fmtDate(modal.$updatedAt)}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
