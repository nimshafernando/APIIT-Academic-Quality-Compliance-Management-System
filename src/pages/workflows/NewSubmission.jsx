import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COL, listAll, Query } from '../../lib/appwrite'
import { submitWorkflow, parseStages, resolveApprovers } from '../../lib/workflow'
import { ROLES, ROLE_LABELS } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, ErrorBanner } from '../../components/UI'

// Roles that may submit against ANY offering (oversight/admin); everyone else
// only sees the modules they are staffed on (lecturer or module leader).
const SEE_ALL_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACADEMIC_ADMIN, ROLES.HOD]

export default function NewSubmission() {
  const { user, hasRole } = useAuth()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [offerings, setOfferings] = useState([]) // only ones this user may submit against
  const [modules, setModules] = useState([]) // for programme lookup
  const [subjects, setSubjects] = useState([])
  const [assignments, setAssignments] = useState([]) // active role_assignments (approver preview)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [templateId, setTemplateId] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [semesterId, setSemesterId] = useState('')
  const [offeringId, setOfferingId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState([])

  useEffect(() => {
    ;(async () => {
      try {
        const [tpls, offs, mods, subs, asgs] = await Promise.all([
          listAll(COL.WORKFLOW_TEMPLATES, [Query.equal('active', true)]),
          listAll(COL.MODULE_OFFERINGS),
          listAll(COL.MODULES),
          listAll(COL.SUBJECTS),
          listAll(COL.ROLE_ASSIGNMENTS, [Query.equal('active', true)]),
        ])
        const moduleById = new Map(mods.map((m) => [m.$id, m]))
        const mine = hasRole(...SEE_ALL_ROLES)
          ? offs
          : offs.filter((o) => o.moduleLeaderId === user.$id || (o.lecturerIds || []).includes(user.$id))
        // Carry the module's programme onto each offering for the cascade.
        setOfferings(
          mine.map((o) => ({
            ...o,
            programmeId: moduleById.get(o.moduleId)?.programmeId || '',
            programmeName: moduleById.get(o.moduleId)?.programmeName || '',
          })),
        )
        setTemplates(tpls)
        setModules(mods)
        setSubjects(subs)
        setAssignments(asgs)
      } catch (err) {
        setError(err?.message || 'Failed to load submission data.')
      } finally {
        setLoading(false)
      }
    })()
  }, [user.$id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Cascading options, all derived from MY offerings --------------------
  const uniqueBy = (rows, idKey, labelKey) => {
    const seen = new Map()
    for (const r of rows) if (r[idKey] && !seen.has(r[idKey])) seen.set(r[idKey], r[labelKey] || r[idKey])
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }

  const programmeOptions = useMemo(() => uniqueBy(offerings, 'programmeId', 'programmeName'), [offerings])
  const inProgramme = offerings.filter((o) => o.programmeId === programmeId)
  const levelOptions = uniqueBy(inProgramme, 'levelId', 'levelName')
  const inLevel = inProgramme.filter((o) => o.levelId === levelId)
  const semesterOptions = uniqueBy(inLevel, 'semesterId', 'semesterName')
  const inSemester = inLevel.filter((o) => o.semesterId === semesterId)

  const offering = offerings.find((o) => o.$id === offeringId)
  const moduleSubjects = subjects.filter((s) => s.moduleId === offering?.moduleId)

  const template = templates.find((t) => t.$id === templateId)
  const stages = template ? parseStages(template) : []
  // Preview WHO each stage routes to for the chosen module.
  const preview = offering && stages.length ? resolveApprovers(stages, offering, assignments) : null

  const pick = (setter, resetters) => (e) => {
    setter(e.target.value)
    for (const r of resetters) r('')
  }

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
      const instance = await submitWorkflow({ template, subject, offering, title, files, user })
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
        subtitle="Submit evidence into an approval workflow. It is routed to the staff assigned to your module."
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {offerings.length === 0 ? (
        <div className="card px-6 py-8 text-center text-sm text-gray-500">
          You are not assigned to any module offering yet, so there is nothing to submit against.
          <br />
          Ask your administrator to add you as a lecturer or module leader on a Module Offering.
        </div>
      ) : (
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Programme *</label>
              <select className="input" value={programmeId} onChange={pick(setProgrammeId, [setLevelId, setSemesterId, setOfferingId, setSubjectId])} required>
                <option value="">— Select programme —</option>
                {programmeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Level *</label>
              <select className="input" value={levelId} onChange={pick(setLevelId, [setSemesterId, setOfferingId, setSubjectId])} required disabled={!programmeId}>
                <option value="">— Select level —</option>
                {levelOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Semester *</label>
              <select className="input" value={semesterId} onChange={pick(setSemesterId, [setOfferingId, setSubjectId])} required disabled={!levelId}>
                <option value="">— Select semester —</option>
                {semesterOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Module *</label>
              <select className="input" value={offeringId} onChange={pick(setOfferingId, [setSubjectId])} required disabled={!semesterId}>
                <option value="">— Select module —</option>
                {inSemester.map((o) => (
                  <option key={o.$id} value={o.$id}>
                    {o.moduleCode} — {o.moduleName} ({o.batchCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {offering && (
            <div>
              <label className="label">Subject / Component *</label>
              <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                <option value="">— Select subject —</option>
                {moduleSubjects.map((s) => (
                  <option key={s.$id} value={s.$id}>
                    {s.name} ({s.category})
                  </option>
                ))}
              </select>
              {moduleSubjects.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  No subject/component exists for this module yet — ask your administrator to add one under Structure → Subjects.
                </p>
              )}
            </div>
          )}

          {preview && (
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Approval route for {offering.moduleCode}</p>
              <ol className="space-y-1.5">
                {stages.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm">
                    <span className="font-semibold text-gray-700">{i + 1}. {s.label || ROLE_LABELS[s.role]}</span>
                    <span className={preview.approverNames[i] ? 'text-brand-tealDark' : 'text-gray-400'}>
                      {preview.approverNames[i] || `any ${ROLE_LABELS[s.role]}`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

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
            <button type="submit" disabled={busy || !subjectId} className="btn-primary">
              {busy ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
