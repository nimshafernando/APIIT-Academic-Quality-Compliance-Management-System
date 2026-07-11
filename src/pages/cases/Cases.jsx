import { useCallback, useEffect, useState } from 'react'
import { databases, DB_ID, COL, ID, Permission, Role, listAll, Query, fmtDateTime, notifyRole } from '../../lib/appwrite'
import { ROLES } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner, StatusBadge, Modal, Avatar } from '../../components/UI'
import Icon from '../../components/Icons'

const TYPES = {
  mentoring: { label: 'Mentoring Log', icon: 'users', hint: 'Per-student mentoring & intervention records (SUP-01).' },
  ec: { label: 'Exceptional Circumstances', icon: 'doc', hint: 'EC submissions & decisions — visible to you and the HOD only (SUP-02).' },
  conduct: { label: 'Academic Conduct', icon: 'shield', hint: 'Plagiarism / misconduct cases — restricted access (SUP-03).' },
}

export default function Cases() {
  const { user, hasRole } = useAuth()
  const [tab, setTab] = useState('mentoring')
  const [cases, setCases] = useState(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ studentRef: '', title: '', details: '', moduleCode: '', semesterName: '' })

  const isHod = hasRole(ROLES.HOD)

  const load = useCallback(async () => {
    try {
      // Document security does the scoping: HOD reads all, others only their own.
      setCases(await listAll(COL.CASES, [Query.orderDesc('$updatedAt')]))
    } catch (err) {
      setError(err?.message)
      setCases([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const doc = await databases.createDocument(
        DB_ID,
        COL.CASES,
        ID.unique(),
        {
          type: tab,
          ...form,
          status: 'open',
          createdBy: user.$id,
          createdByName: user.name,
          notesJson: JSON.stringify([]),
        },
        // SUP-02/03: creator grants themself access; the deadline-engine
        // function adds the HOD's restricted oversight on the create event
        // (clients cannot grant permissions to roles other than their own).
        [Permission.read(Role.user(user.$id)), Permission.update(Role.user(user.$id))],
      )
      await notifyRole(ROLES.HOD, 'case', `New ${TYPES[tab].label} case logged by ${user.name}: "${form.title}".`, doc.$id)
      setModal(false)
      setForm({ studentRef: '', title: '', details: '', moduleCode: '', semesterName: '' })
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  const addNote = async () => {
    if (!noteText.trim()) return
    setBusy(true)
    try {
      const notes = JSON.parse(detail.notesJson || '[]')
      notes.push({ by: user.name, at: new Date().toISOString(), text: noteText.trim() })
      const updated = await databases.updateDocument(DB_ID, COL.CASES, detail.$id, { notesJson: JSON.stringify(notes) })
      setDetail(updated)
      setNoteText('')
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status) => {
    setBusy(true)
    try {
      const updated = await databases.updateDocument(DB_ID, COL.CASES, detail.$id, { status })
      setDetail(updated)
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  if (cases === null) return <Spinner />

  const visible = cases.filter((c) => c.type === tab)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Academic Support & Cases"
        subtitle={isHod ? 'All cases school-wide — access is restricted to the case creator and you.' : 'Cases you have logged. Only you and the HOD can see them.'}
        actions={
          <button className="btn-primary" onClick={() => setModal(true)}>
            <Icon name="plus" className="h-4 w-4" /> Log {TYPES[tab].label}
          </button>
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {/* Type tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(TYPES).map(([key, t]) => {
          const count = cases.filter((c) => c.type === key && c.status !== 'resolved').length
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`chip !px-4 !py-2 transition-all ${tab === key ? 'bg-brand-ink text-white shadow-card' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:text-gray-800'}`}
            >
              <Icon name={t.icon} className="h-4 w-4" /> {t.label}
              {count > 0 && <span className={`ml-1 rounded-full px-1.5 text-[10px] font-extrabold ${tab === key ? 'bg-brand-teal text-white' : 'bg-gray-100'}`}>{count}</span>}
            </button>
          )
        })}
      </div>
      <p className="mb-4 text-xs text-gray-400">{TYPES[tab].hint}</p>

      {visible.length === 0 ? (
        <EmptyState title={`No ${TYPES[tab].label.toLowerCase()} cases`} message="Log a case with the button above. It will be visible to you and the HOD only." icon={TYPES[tab].icon} />
      ) : (
        <div className="space-y-2.5">
          {visible.map((c) => (
            <button key={c.$id} onClick={() => setDetail(c)} className="card-hover flex w-full items-center gap-4 px-5 py-4 text-left">
              <Avatar name={c.createdByName} className="h-9 w-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-gray-900">{c.title}</p>
                <p className="text-xs text-gray-400">
                  Student: {c.studentRef}
                  {c.moduleCode && ` · ${c.moduleCode}`}
                  {c.semesterName && ` · ${c.semesterName}`} · logged by {c.createdByName?.replace(/\(.*?\)/g, '').trim()}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </button>
          ))}
        </div>
      )}

      {/* Create */}
      <Modal open={modal} onClose={() => setModal(false)} title={`Log ${TYPES[tab].label}`}>
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Student Reference *</label>
              <input className="input" value={form.studentRef} onChange={(e) => setForm({ ...form, studentRef: e.target.value })} required placeholder="e.g. CB012345" />
            </div>
            <div>
              <label className="label">Module Code</label>
              <input className="input" value={form.moduleCode} onChange={(e) => setForm({ ...form, moduleCode: e.target.value })} placeholder="e.g. COM2521" />
            </div>
          </div>
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="label">Details</label>
            <textarea className="input" rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          </div>
          <div>
            <label className="label">Semester</label>
            <input className="input" value={form.semesterName} onChange={(e) => setForm({ ...form, semesterName: e.target.value })} placeholder="e.g. Semester 2 2025/26" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Log Case'}</button>
          </div>
        </form>
      </Modal>

      {/* Detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title} wide>
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status} />
              <span className="chip bg-gray-100 text-gray-500">{TYPES[detail.type]?.label}</span>
              <span className="chip bg-gray-100 text-gray-500">Student {detail.studentRef}</span>
              {detail.moduleCode && <span className="chip bg-gray-100 text-gray-500">{detail.moduleCode}</span>}
            </div>
            {detail.details && <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700">{detail.details}</p>}

            <div>
              <p className="label">Case Notes</p>
              <ul className="space-y-2">
                {JSON.parse(detail.notesJson || '[]').map((n, i) => (
                  <li key={i} className="rounded-xl bg-brand-tealLight/50 px-4 py-2.5 text-sm">
                    <p className="text-gray-700">{n.text}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{n.by?.replace(/\(.*?\)/g, '').trim()} · {fmtDateTime(n.at)}</p>
                  </li>
                ))}
                {JSON.parse(detail.notesJson || '[]').length === 0 && <li className="text-sm text-gray-400">No notes yet.</li>}
              </ul>
              <div className="mt-3 flex gap-2">
                <input className="input" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" />
                <button className="btn-primary flex-shrink-0" disabled={busy || !noteText.trim()} onClick={addNote}>Add</button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400">Logged by {detail.createdByName} · {fmtDateTime(detail.$createdAt)}</p>
              <div className="flex gap-2">
                {detail.status !== 'in_review' && <button className="btn-secondary !py-1.5 text-xs" disabled={busy} onClick={() => setStatus('in_review')}>Mark In Review</button>}
                {detail.status !== 'resolved' && <button className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={() => setStatus('resolved')}>Resolve</button>}
                {detail.status === 'resolved' && <button className="btn-secondary !py-1.5 text-xs" disabled={busy} onClick={() => setStatus('open')}>Reopen</button>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
