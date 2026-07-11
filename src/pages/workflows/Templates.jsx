import { useCallback, useEffect, useState } from 'react'
import { databases, DB_ID, COL, ID, listAll, Query } from '../../lib/appwrite'
import { APPROVER_ROLES, ROLE_LABELS } from '../../lib/roles'
import { PageHeader, Table, Modal, Spinner, EmptyState, ErrorBanner, StatusBadge } from '../../components/UI'

function parseStages(t) {
  try {
    return JSON.parse(t.stagesJson || '[]')
  } catch {
    return []
  }
}

function TemplateForm({ initial, onSave, onCancel, busy }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [active, setActive] = useState(initial ? !!initial.active : true)
  const [stages, setStages] = useState(initial ? parseStages(initial) : [{ role: 'moduleleader', label: 'Module Leader Approval' }])

  const setStage = (i, patch) => setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const move = (i, dir) =>
    setStages((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const submit = (e) => {
    e.preventDefault()
    if (!stages.length) return
    onSave({
      name,
      description,
      active,
      stagesJson: JSON.stringify(stages.map((s, i) => ({ order: i, role: s.role, label: s.label || ROLE_LABELS[s.role] }))),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Template Name *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Assessment Preparation & Verification" />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. ACAD-PROC-07/08 subject file verification & sign-off" />
      </div>
      <div>
        <label className="label">Approval Stages (in order, after submission) *</label>
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-tealLight text-xs font-extrabold text-brand-tealDark">
                {i + 1}
              </span>
              <select
                className="input min-w-[150px] flex-1 sm:!w-44 sm:flex-none"
                value={s.role}
                onChange={(e) => setStage(i, { role: e.target.value })}
              >
                {APPROVER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <input
                className="input min-w-[140px] flex-1"
                value={s.label}
                placeholder="Stage label"
                onChange={(e) => setStage(i, { label: e.target.value })}
              />
              <span className="flex flex-shrink-0 gap-1">
                <button type="button" className="btn-secondary !px-2.5 !py-1.5" onClick={() => move(i, -1)} title="Move up">↑</button>
                <button type="button" className="btn-secondary !px-2.5 !py-1.5" onClick={() => move(i, 1)} title="Move down">↓</button>
                <button type="button" className="btn-danger !px-2.5 !py-1.5" onClick={() => setStages((p) => p.filter((_, idx) => idx !== i))} title="Remove">✕</button>
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-2 !py-1 text-xs"
          onClick={() => setStages((p) => [...p, { role: 'moduleleader', label: '' }])}
        >
          + Add Stage
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (available for new submissions)
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={busy || !stages.length} className="btn-primary">{busy ? 'Saving…' : 'Save Template'}</button>
      </div>
    </form>
  )
}

export default function Templates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await listAll(COL.WORKFLOW_TEMPLATES, [Query.orderDesc('$createdAt')]))
    } catch (err) {
      setError(err?.message || 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (data) => {
    setBusy(true)
    setError('')
    try {
      if (modal.doc) await databases.updateDocument(DB_ID, COL.WORKFLOW_TEMPLATES, modal.doc.$id, data)
      else await databases.createDocument(DB_ID, COL.WORKFLOW_TEMPLATES, ID.unique(), data)
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (doc) => {
    if (!window.confirm('Delete this template? Existing submissions keep their own copy of the stages.')) return
    try {
      await databases.deleteDocument(DB_ID, COL.WORKFLOW_TEMPLATES, doc.$id)
      await load()
    } catch (err) {
      setError(err?.message || 'Delete failed.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Workflow Templates"
        subtitle="Configurable approval chains mirroring the APIITEMS Procedure Manual (ISO 21001:2018)."
        actions={<button className="btn-primary" onClick={() => setModal({})}>+ New Template</button>}
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner />
      ) : templates.length === 0 ? (
        <EmptyState title="No workflow templates" message="Create a template to define an approval chain (e.g. Lecturer → Internal Verifier → Module Leader → Level Coordinator → HOD)." />
      ) : (
        <Table headers={['Template', 'Approval Chain', 'Status', 'Actions']}>
          {templates.map((t) => {
            const stages = parseStages(t)
            return (
              <tr key={t.$id} className="hover:bg-gray-50">
                <td className="td">
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                </td>
                <td className="td">
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-medium">Submit</span>
                    {stages.map((s, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="text-gray-400">→</span>
                        <span className="rounded bg-brand-teal/10 px-2 py-0.5 font-medium text-brand-tealDark">{s.label || ROLE_LABELS[s.role]}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="td">
                  <StatusBadge status={t.active ? 'active' : 'inactive'} />
                </td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => setModal({ doc: t })}>Edit</button>
                    <button className="btn-danger !px-3 !py-1 text-xs" onClick={() => remove(t)}>Delete</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </Table>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.doc ? 'Edit Template' : 'New Workflow Template'} wide>
        {modal && <TemplateForm initial={modal.doc} onSave={save} onCancel={() => setModal(null)} busy={busy} />}
      </Modal>
    </div>
  )
}
