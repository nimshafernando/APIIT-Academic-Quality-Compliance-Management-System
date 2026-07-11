import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { COL, listAll } from '../../lib/appwrite'
import { PageHeader, Spinner, EmptyState, ErrorBanner, ProgressBar } from '../../components/UI'
import Icon from '../../components/Icons'

// DOC-06: browse & filter digitised subject files, with live slot progress.
export default function SubjectFiles() {
  const [subjects, setSubjects] = useState(null)
  const [slots, setSlots] = useState([])
  const [error, setError] = useState('')
  const [f, setF] = useState({ level: '', module: '', category: '', status: '' })

  useEffect(() => {
    ;(async () => {
      try {
        const [subs, allSlots] = await Promise.all([listAll(COL.SUBJECTS), listAll(COL.DOCUMENT_SLOTS)])
        setSubjects(subs)
        setSlots(allSlots)
      } catch (err) {
        setError(err?.message)
        setSubjects([])
      }
    })()
  }, [])

  const slotsBySubject = useMemo(() => {
    const m = {}
    for (const s of slots) (m[s.subjectId] ||= []).push(s)
    return m
  }, [slots])

  if (subjects === null) return <Spinner />

  const levels = [...new Set(subjects.map((s) => s.levelName).filter(Boolean))].sort()
  const modules = [...new Set(subjects.map((s) => s.moduleCode).filter(Boolean))].sort()
  const categories = [...new Set(subjects.map((s) => s.category).filter(Boolean))].sort()

  const filtered = subjects.filter((s) => {
    if (f.level && s.levelName !== f.level) return false
    if (f.module && s.moduleCode !== f.module) return false
    if (f.category && s.category !== f.category) return false
    if (f.status) {
      const list = slotsBySubject[s.$id] || []
      const total = list.length
      const approved = list.filter((x) => x.status === 'approved').length
      if (f.status === 'complete' && (total === 0 || approved !== total)) return false
      if (f.status === 'incomplete' && (total > 0 && approved === total)) return false
      if (f.status === 'attention' && !list.some((x) => x.status === 'returned')) return false
    }
    return true
  })

  return (
    <div>
      <PageHeader
        title="Subject Files"
        subtitle="Digitised evidence checklists — replaces the files.txt checklist in every shared-drive folder."
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {/* Filters */}
      <div className="card mb-6 flex flex-wrap gap-3 p-4">
        {[
          { key: 'level', label: 'All levels', options: levels },
          { key: 'module', label: 'All modules', options: modules },
          { key: 'category', label: 'All categories', options: categories },
        ].map((sel) => (
          <select key={sel.key} className="input !w-auto min-w-[150px] flex-1 sm:flex-none" value={f[sel.key]} onChange={(e) => setF({ ...f, [sel.key]: e.target.value })}>
            <option value="">{sel.label}</option>
            {sel.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ))}
        <select className="input !w-auto min-w-[150px] flex-1 sm:flex-none" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Any status</option>
          <option value="complete">Fully approved</option>
          <option value="incomplete">Incomplete</option>
          <option value="attention">Has returned items</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No subject files match" message="Adjust the filters, or ask the Super Admin to add subjects in Academic Structure." icon="doc" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const list = slotsBySubject[s.$id] || []
            const total = list.length
            const approved = list.filter((x) => x.status === 'approved').length
            const returned = list.filter((x) => x.status === 'returned').length
            const pct = total ? Math.round((approved / total) * 100) : 0
            return (
              <Link key={s.$id} to={`/subject-files/${s.$id}`} className="card-hover group p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="chip bg-gray-100 font-mono text-[11px] text-gray-600">{s.moduleCode}</span>
                  <span className="chip bg-brand-tealLight text-brand-tealDeep">{s.category}</span>
                </div>
                <p className="mt-3 font-extrabold tracking-tight text-gray-900 group-hover:text-brand-tealDark">{s.name}</p>
                <p className="text-xs text-gray-400">{s.moduleName} · {s.levelName}</p>
                <div className="mt-4">
                  {total === 0 ? (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                      <Icon name="doc" className="h-3.5 w-3.5" /> No checklist yet — open to set one up
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className={pct === 100 ? 'text-emerald-600' : 'text-gray-500'}>{approved}/{total} approved</span>
                        {returned > 0 && <span className="text-amber-600">{returned} returned</span>}
                      </div>
                      <ProgressBar value={pct} className="mt-1.5" />
                    </>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
