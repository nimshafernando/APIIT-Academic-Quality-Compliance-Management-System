import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { databases, DB_ID, ID, listAll, fmtDate, Query } from '../../lib/appwrite'
import { STRUCTURE_ENTITIES } from '../../lib/structureConfig'
import { ROLES } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Table, Modal, Spinner, EmptyState, ErrorBanner } from '../../components/UI'

function cellValue(doc, col) {
  const v = doc[col.key]
  if (col.type === 'date') return fmtDate(v)
  if (col.type === 'array') return Array.isArray(v) && v.length ? v.join(', ') : '—'
  return v === undefined || v === null || v === '' ? '—' : String(v)
}

function EntityForm({ config, refOptions, initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState(() => {
    const base = {}
    for (const f of config.fields) {
      let v = initial?.[f.key]
      if (f.type === 'date' && v) v = v.slice(0, 10)
      base[f.key] = v ?? (f.type === 'multiselect' ? [] : '')
    }
    return base
  })

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = (e) => {
    e.preventDefault()
    const data = {}
    for (const f of config.fields) {
      let v = form[f.key]
      if (f.type === 'number') v = v === '' ? null : Number(v)
      if (f.type === 'date' && v) v = new Date(v).toISOString()
      data[f.key] = v
      // Copy denormalised display fields from the selected ref document(s)
      if (f.denorm && f.ref) {
        const selected = (refOptions[f.key] || []).find((o) => o.value === v)
        if (selected) for (const [target, src] of Object.entries(f.denorm)) data[target] = selected.doc[src]
      }
      if (f.denormArray && f.ref) {
        const opts = refOptions[f.key] || []
        for (const [target, src] of Object.entries(f.denormArray)) {
          data[target] = (v || []).map((id) => opts.find((o) => o.value === id)?.doc[src]).filter(Boolean)
        }
      }
    }
    onSave(data)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {config.fields.map((f) => (
        <div key={f.key}>
          <label className="label">
            {f.label}
            {f.required && <span className="text-red-500"> *</span>}
          </label>
          {f.type === 'select' && (f.ref || f.options) ? (
            <select className="input" value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} required={f.required}>
              <option value="">— Select —</option>
              {f.options
                ? f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))
                : (refOptions[f.key] || []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
            </select>
          ) : f.type === 'multiselect' ? (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2">
              {(refOptions[f.key] || []).map((o) => (
                <label key={o.value} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={(form[f.key] || []).includes(o.value)}
                    onChange={(e) => {
                      const cur = form[f.key] || []
                      set(f.key, e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))
                    }}
                  />
                  {o.label}
                </label>
              ))}
              {!(refOptions[f.key] || []).length && <p className="px-2 py-1 text-sm text-gray-400">No options available yet.</p>}
            </div>
          ) : (
            <input
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              className="input"
              value={form[f.key]}
              placeholder={f.placeholder || ''}
              onChange={(e) => set(f.key, e.target.value)}
              required={f.required}
            />
          )}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default function StructurePage() {
  const { entity } = useParams()
  const config = STRUCTURE_ENTITIES[entity]
  const { hasRole } = useAuth()

  const [docs, setDocs] = useState([])
  const [refOptions, setRefOptions] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // { doc? } — open create/edit form
  const [busy, setBusy] = useState(false)

  const canEdit = config?.superAdminOnly
    ? hasRole(ROLES.SUPER_ADMIN)
    : hasRole(ROLES.SUPER_ADMIN, ROLES.ACADEMIC_ADMIN)

  const load = useCallback(async () => {
    if (!config) return
    setLoading(true)
    setError('')
    try {
      const [rows, ...refs] = await Promise.all([
        listAll(config.collection, [Query.orderDesc('$createdAt')]),
        ...config.fields
          .filter((f) => f.ref)
          .map(async (f) => {
            const refDocs = await listAll(f.ref.collection)
            return [
              f.key,
              refDocs.map((d) => ({
                value: f.ref.valueKey ? d[f.ref.valueKey] : d.$id,
                label: f.ref.labelFn ? f.ref.labelFn(d) : d[f.ref.labelKey],
                doc: d,
              })),
            ]
          }),
      ])
      setDocs(rows)
      setRefOptions(Object.fromEntries(refs))
    } catch (err) {
      setError(err?.message || 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [entity]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  const save = async (data) => {
    setBusy(true)
    setError('')
    try {
      if (modal.doc) {
        await databases.updateDocument(DB_ID, config.collection, modal.doc.$id, data)
      } else {
        await databases.createDocument(DB_ID, config.collection, ID.unique(), data)
      }
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (doc) => {
    if (!window.confirm(`Delete this ${config.singular}? This cannot be undone.`)) return
    try {
      await databases.deleteDocument(DB_ID, config.collection, doc.$id)
      await load()
    } catch (err) {
      setError(err?.message || 'Delete failed.')
    }
  }

  const headers = useMemo(() => {
    if (!config) return []
    const h = config.columns.map((c) => c.label)
    if (canEdit) h.push('Actions')
    return h
  }, [config, canEdit])

  if (!config) return <EmptyState title="Unknown section" message="This structure area does not exist." />

  return (
    <div>
      <PageHeader
        title={config.title}
        subtitle={config.description || `Manage ${config.title.toLowerCase()} for the School of Computing.`}
        actions={
          canEdit && (
            <button className="btn-primary" onClick={() => setModal({})}>
              + Add {config.singular}
            </button>
          )
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner />
      ) : docs.length === 0 ? (
        <EmptyState title={`No ${config.title.toLowerCase()} yet`} message={canEdit ? `Click “Add ${config.singular}” to create the first record.` : 'Nothing has been configured yet.'} />
      ) : (
        <Table headers={headers}>
          {docs.map((doc) => (
            <tr key={doc.$id} className="hover:bg-gray-50">
              {config.columns.map((col) => (
                <td key={col.key} className="td">
                  {cellValue(doc, col)}
                </td>
              ))}
              {canEdit && (
                <td className="td">
                  <div className="flex gap-2">
                    <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => setModal({ doc })}>
                      Edit
                    </button>
                    <button className="btn-danger !px-3 !py-1 text-xs" onClick={() => remove(doc)}>
                      Delete
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.doc ? `Edit ${config.singular}` : `Add ${config.singular}`}>
        {modal && (
          <EntityForm
            config={config}
            refOptions={refOptions}
            initial={modal.doc}
            onSave={save}
            onCancel={() => setModal(null)}
            busy={busy}
          />
        )}
      </Modal>
    </div>
  )
}
