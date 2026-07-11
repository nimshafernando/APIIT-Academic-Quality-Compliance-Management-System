import { useCallback, useEffect, useState } from 'react'
import { databases, storage, DB_ID, COL, BUCKET_ID, ID, Permission, Role, listAll, Query, fmtDate } from '../../lib/appwrite'
import { fileDownloadUrl } from '../../lib/workflow'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner, StatusBadge, Modal, Table } from '../../components/UI'
import Icon from '../../components/Icons'

const SEVERITY_STYLES = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  high: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

/* ---- Risk Register (GOV-01) ---- */
function RiskTab() {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({})

  const load = useCallback(async () => {
    try {
      setRows(await listAll(COL.RISK_REGISTER, [Query.orderDesc('$updatedAt')]))
    } catch (err) {
      setError(err?.message)
      setRows([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const open = (doc) => {
    setForm(doc ? { title: doc.title, description: doc.description, owner: doc.owner, severity: doc.severity || 'medium', status: doc.status, reviewDate: doc.reviewDate?.slice(0, 10) || '' } : { title: '', description: '', owner: '', severity: 'medium', status: 'open', reviewDate: '' })
    setModal(doc || {})
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const data = { ...form, reviewDate: form.reviewDate ? new Date(form.reviewDate).toISOString() : null }
      if (modal.$id) await databases.updateDocument(DB_ID, COL.RISK_REGISTER, modal.$id, data)
      else await databases.createDocument(DB_ID, COL.RISK_REGISTER, ID.unique(), data)
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) return <Spinner />
  return (
    <div>
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => open(null)}><Icon name="plus" className="h-4 w-4" /> New Risk</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Risk register is empty" message="Track school risks with owners, severity and review dates." icon="alert" />
      ) : (
        <Table headers={['Risk', 'Owner', 'Severity', 'Status', 'Review', '']}>
          {rows.map((r) => (
            <tr key={r.$id} className="hover:bg-brand-tealLight/30">
              <td className="td">
                <p className="font-bold text-gray-900">{r.title}</p>
                {r.description && <p className="max-w-md text-xs text-gray-400">{r.description}</p>}
              </td>
              <td className="td">{r.owner || '—'}</td>
              <td className="td"><span className={`chip ${SEVERITY_STYLES[r.severity] || SEVERITY_STYLES.low}`}>{r.severity || 'low'}</span></td>
              <td className="td"><StatusBadge status={r.status} /></td>
              <td className="td text-xs text-gray-400">{fmtDate(r.reviewDate)}</td>
              <td className="td"><button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => open(r)}>Edit</button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.$id ? 'Edit Risk' : 'New Risk'}>
        <form onSubmit={save} className="space-y-4">
          <div><label className="label">Title *</label><input className="input" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Owner</label><input className="input" value={form.owner || ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></div>
            <div><label className="label">Review Date</label><input type="date" className="input" value={form.reviewDate || ''} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} /></div>
            <div>
              <label className="label">Severity</label>
              <select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['open', 'mitigating', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/* ---- Committee Meetings (GOV-02) ---- */
function MeetingsTab() {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({})
  const [actions, setActions] = useState([])

  const load = useCallback(async () => {
    try {
      setRows(await listAll(COL.COMMITTEE_MEETINGS, [Query.orderDesc('meetingDate')]))
    } catch (err) {
      setError(err?.message)
      setRows([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const open = (doc) => {
    setForm(doc ? { title: doc.title, meetingDate: doc.meetingDate?.slice(0, 10), agenda: doc.agenda, minutes: doc.minutes } : { title: '', meetingDate: '', agenda: '', minutes: '' })
    setActions(doc ? JSON.parse(doc.actionsJson || '[]') : [])
    setModal(doc || {})
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const data = { ...form, meetingDate: new Date(form.meetingDate).toISOString(), actionsJson: JSON.stringify(actions) }
      if (modal.$id) await databases.updateDocument(DB_ID, COL.COMMITTEE_MEETINGS, modal.$id, data)
      else await databases.createDocument(DB_ID, COL.COMMITTEE_MEETINGS, ID.unique(), data)
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) return <Spinner />
  return (
    <div>
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => open(null)}><Icon name="plus" className="h-4 w-4" /> New Meeting</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No committee meetings recorded" message="Store agendas, minutes and tracked action items." icon="calendar" />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => {
            const acts = JSON.parse(m.actionsJson || '[]')
            const openActs = acts.filter((a) => !a.done).length
            return (
              <button key={m.$id} onClick={() => open(m)} className="card-hover flex w-full items-center gap-4 px-5 py-4 text-left">
                <span className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-brand-tealLight text-brand-tealDark">
                  <Icon name="calendar" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900">{m.title}</p>
                  <p className="text-xs text-gray-400">{fmtDate(m.meetingDate)} · {acts.length} action item(s){openActs ? ` · ${openActs} open` : ''}</p>
                </div>
                {openActs > 0 && <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">{openActs} open actions</span>}
              </button>
            )
          })}
        </div>
      )}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.$id ? 'Edit Meeting' : 'New Meeting'} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Title *</label><input className="input" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Programme Committee — Term 2" /></div>
            <div><label className="label">Date *</label><input type="date" className="input" value={form.meetingDate || ''} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} required /></div>
          </div>
          <div><label className="label">Agenda</label><textarea className="input" rows={2} value={form.agenda || ''} onChange={(e) => setForm({ ...form, agenda: e.target.value })} /></div>
          <div><label className="label">Minutes</label><textarea className="input" rows={4} value={form.minutes || ''} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></div>
          <div>
            <label className="label">Action Items</label>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" checked={!!a.done} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} title="Done" />
                  <input className="input min-w-[140px] flex-1" value={a.action} placeholder="Action" onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))} />
                  <input className="input !w-32" value={a.owner || ''} placeholder="Owner" onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)))} />
                  <input type="date" className="input !w-36" value={a.due || ''} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} />
                  <button type="button" className="btn-danger !px-2.5 !py-1.5 text-xs" onClick={() => setActions(actions.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-2 !py-1.5 text-xs" onClick={() => setActions([...actions, { action: '', owner: '', due: '', done: false }])}>+ Add Action</button>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">Save Meeting</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/* ---- Governance documents (GOV-03) ---- */
function DocsTab() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'handbook', notes: '' })
  const [file, setFile] = useState(null)

  const load = useCallback(async () => {
    try {
      setRows(await listAll(COL.GOVERNANCE_DOCS, [Query.orderDesc('$updatedAt')]))
    } catch (err) {
      setError(err?.message)
      setRows([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      let filePatch = {}
      if (file) {
        const created = await storage.createFile(BUCKET_ID, ID.unique(), file, [Permission.read(Role.users())])
        filePatch = { fileId: created.$id, fileName: file.name }
      }
      // New upload of an existing named doc = version bump
      const existing = rows.find((r) => r.name === form.name && r.category === form.category)
      if (existing) await databases.updateDocument(DB_ID, COL.GOVERNANCE_DOCS, existing.$id, { ...form, ...filePatch, version: (existing.version || 1) + (file ? 1 : 0) })
      else await databases.createDocument(DB_ID, COL.GOVERNANCE_DOCS, ID.unique(), { ...form, ...filePatch, version: 1 })
      setModal(false)
      setForm({ name: '', category: 'handbook', notes: '' })
      setFile(null)
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) return <Spinner />
  return (
    <div>
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setModal(true)}><Icon name="plus" className="h-4 w-4" /> Add Document</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No governance documents" message="Store the Student Handbook and Curriculum / Module Specifications with version history." icon="book" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((d) => (
            <div key={d.$id} className="card flex items-center gap-4 p-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-tealLight text-brand-teal"><Icon name="book" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-400">{d.category} · v{d.version || 1}{d.notes && ` · ${d.notes}`}</p>
              </div>
              {d.fileId && (
                <a href={fileDownloadUrl(d.fileId)} className="btn-secondary flex-shrink-0 !px-3 !py-1.5 text-xs">
                  <Icon name="download" className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Add / Update Governance Document">
        <form onSubmit={save} className="space-y-4">
          <div><label className="label">Document Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Student Handbook 2026/27" /></div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['handbook', 'curriculum', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">File</label><input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
          <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <p className="text-xs text-gray-400">Uploading with the same name and category bumps the version number.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const TABS = {
  risks: { label: 'Risk Register', icon: 'alert', el: <RiskTab /> },
  meetings: { label: 'Committee Meetings', icon: 'calendar', el: <MeetingsTab /> },
  docs: { label: 'Documents', icon: 'book', el: <DocsTab /> },
}

export default function Governance() {
  const { hasRole } = useAuth()
  const [tab, setTab] = useState('risks')
  void hasRole
  return (
    <div>
      <PageHeader title="Governance & Oversight" subtitle="Risk register, Programme Committee records and controlled documents (SRS 4.9)." />
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(TABS).map(([key, t]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`chip !px-4 !py-2 transition-all ${tab === key ? 'bg-brand-ink text-white shadow-card' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:text-gray-800'}`}
          >
            <Icon name={t.icon} className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {TABS[tab].el}
    </div>
  )
}
