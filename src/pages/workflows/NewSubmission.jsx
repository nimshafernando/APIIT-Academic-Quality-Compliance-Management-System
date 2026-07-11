import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COL, listAll, Query } from '../../lib/appwrite'
import { submitWorkflow, parseStages } from '../../lib/workflow'
import { ROLE_LABELS } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, ErrorBanner } from '../../components/UI'

export default function NewSubmission() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [templateId, setTemplateId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState([])

  useEffect(() => {
    ;(async () => {
      try {
        const [tpls, subs] = await Promise.all([
          listAll(COL.WORKFLOW_TEMPLATES, [Query.equal('active', true)]),
          listAll(COL.SUBJECTS),
        ])
        setTemplates(tpls)
        setSubjects(subs)
      } catch (err) {
        setError(err?.message || 'Failed to load templates/subjects.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const template = templates.find((t) => t.$id === templateId)
  const stages = template ? parseStages(template) : []

  const submit = async (e) => {
    e.preventDefault()
    if (!files.length) {
      setError('Attach at least one evidence file for this submission.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const subject = subjects.find((s) => s.$id === subjectId)
      const instance = await submitWorkflow({ template, subject, title, files, user })
      navigate(`/workflows/${instance.$id}`)
    } catch (err) {
      setError(err?.message || 'Submission failed.')
      setBusy(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New Submission"
        subtitle="Submit evidence into an approval workflow. It will be routed to each approver in turn."
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      <form onSubmit={submit} className="card space-y-5 px-6 py-6">
        <div>
          <label className="label">Workflow Template *</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
            <option value="">— Select workflow —</option>
            {templates.map((t) => (
              <option key={t.$id} value={t.$id}>
                {t.name}
              </option>
            ))}
          </select>
          {template && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span className="rounded bg-gray-100 px-2 py-0.5 font-medium">You submit</span>
              {stages.map((s, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-gray-400">→</span>
                  <span className="rounded bg-brand-teal/10 px-2 py-0.5 font-medium text-brand-tealDark">
                    {s.label || ROLE_LABELS[s.role]}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label">Subject / Component *</label>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            <option value="">— Select subject —</option>
            {subjects.map((s) => (
              <option key={s.$id} value={s.$id}>
                {s.moduleCode} — {s.name} ({s.levelName})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Submission Title *</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. In-course Assessment Brief v1 — Semester 1"
          />
        </div>

        <div>
          <label className="label">Evidence Files *</label>
          <input
            type="file"
            multiple
            className="input"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          {files.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-2 rounded-lg bg-brand-tealLight/60 px-3 py-2 text-xs font-medium text-brand-tealDeep">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {f.name} <span className="text-brand-teal/70">({Math.ceil(f.size / 1024)} KB)</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </form>
    </div>
  )
}
