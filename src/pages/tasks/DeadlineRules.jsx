import { useCallback, useEffect, useState } from 'react'
import { databases, DB_ID, COL, ID, listAll, Query, fmtDate } from '../../lib/appwrite'
import { createTask } from '../../lib/tasks'
import { ROLES, ROLE_LABELS } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Table, Modal, Spinner, EmptyState, ErrorBanner, StatusBadge } from '../../components/UI'
import Icon from '../../components/Icons'

const ANCHORS = {
  semester_start: 'Semester start',
  semester_end: 'Semester end',
}

const ASSIGNABLE = [
  ROLES.LECTURER,
  ROLES.MODULE_LEADER,
  ROLES.LEVEL_COORDINATOR,
  ROLES.INTERNAL_VERIFIER,
  ROLES.MODERATOR,
  ROLES.HOD,
  ROLES.ACADEMIC_ADMIN,
]

function offsetLabel(days) {
  if (days === 0) return 'on the day'
  const weeks = Math.abs(days) % 7 === 0 ? `${Math.abs(days) / 7} week${Math.abs(days) === 7 ? '' : 's'}` : `${Math.abs(days)} days`
  return days < 0 ? `${weeks} before` : `${weeks} after`
}

function RuleForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    anchor: initial?.anchor || 'semester_start',
    offsetDays: initial?.offsetDays ?? -63,
    assignRole: initial?.assignRole || ROLES.LECTURER,
    category: initial?.category || 'Assessment',
    active: initial ? !!initial.active : true,
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...form, offsetDays: Number(form.offsetDays) })
      }}
      className="space-y-4"
    >
      <div>
        <label className="label">Rule Name *</label>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Subject file preparation due" />
      </div>
      <div>
        <label className="label">Description</label>
        <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. ACAD-PROC-07 — 9 weeks prior to semester commencement" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Anchor *</label>
          <select className="input" value={form.anchor} onChange={(e) => set('anchor', e.target.value)}>
            {Object.entries(ANCHORS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Offset (days) *</label>
          <input type="number" className="input" value={form.offsetDays} onChange={(e) => set('offsetDays', e.target.value)} required />
          <p className="mt-1 text-[11px] text-gray-400">Negative = before ({offsetLabel(Number(form.offsetDays) || 0)})</p>
        </div>
        <div>
          <label className="label">Assign To Role *</label>
          <select className="input" value={form.assignRole} onChange={(e) => set('assignRole', e.target.value)}>
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Category</label>
        <input className="input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Assessment / Moderation" />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Active
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save Rule'}</button>
      </div>
    </form>
  )
}

export default function DeadlineRules() {
  const { user } = useAuth()
  const [rules, setRules] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [genModal, setGenModal] = useState(false)
  const [genSemester, setGenSemester] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        listAll(COL.DEADLINE_RULES, [Query.orderDesc('$createdAt')]),
        listAll(COL.SEMESTERS),
      ])
      setRules(r)
      setSemesters(s)
    } catch (err) {
      setError(err?.message)
      setRules([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (data) => {
    setBusy(true)
    setError('')
    try {
      if (modal.doc) await databases.updateDocument(DB_ID, COL.DEADLINE_RULES, modal.doc.$id, data)
      else await databases.createDocument(DB_ID, COL.DEADLINE_RULES, ID.unique(), data)
      setModal(null)
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (doc) => {
    if (!window.confirm('Delete this rule? Already-generated tasks are kept.')) return
    try {
      await databases.deleteDocument(DB_ID, COL.DEADLINE_RULES, doc.$id)
      await load()
    } catch (err) {
      setError(err?.message)
    }
  }

  // TASK-01/02: resolve each active rule against the chosen semester's real
  // dates and create tasks for every relevant person, skipping duplicates.
  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const semester = semesters.find((s) => s.$id === genSemester)
      const [offerings, assignments, existing] = await Promise.all([
        listAll(COL.MODULE_OFFERINGS, [Query.equal('semesterId', semester.$id)]).catch(() => listAll(COL.MODULE_OFFERINGS)),
        listAll(COL.ROLE_ASSIGNMENTS, [Query.equal('active', true)]),
        listAll(COL.TASKS, [Query.equal('semesterId', semester.$id)]),
      ])
      const semesterOfferings = offerings.filter((o) => o.semesterId === semester.$id)
      const existingKeys = new Set(existing.map((t) => `${t.ruleId}|${t.ownerUserId}|${t.relatedLabel}`))

      let created = 0
      for (const rule of rules.filter((r) => r.active)) {
        const anchorDate = new Date(rule.anchor === 'semester_end' ? semester.endDate : semester.startDate)
        const due = new Date(anchorDate.getTime() + (rule.offsetDays || 0) * 86400000).toISOString()

        // Who gets a task?
        const targets = [] // { ownerUserId, ownerName, relatedLabel }
        if (rule.assignRole === ROLES.LECTURER) {
          for (const o of semesterOfferings)
            (o.lecturerIds || []).forEach((uid, i) =>
              targets.push({ ownerUserId: uid, ownerName: o.lecturerNames?.[i] || '', relatedLabel: `${o.moduleCode} · ${o.batchCode}` }),
            )
        } else if (rule.assignRole === ROLES.MODULE_LEADER) {
          for (const o of semesterOfferings)
            targets.push({ ownerUserId: o.moduleLeaderId, ownerName: o.moduleLeaderName || '', relatedLabel: `${o.moduleCode} · ${o.batchCode}` })
        } else {
          for (const a of assignments.filter((a) => a.role === rule.assignRole))
            targets.push({ ownerUserId: a.userId, ownerName: a.userName || '', relatedLabel: a.scopeLabel || 'School-wide' })
        }

        for (const t of targets) {
          const key = `${rule.$id}|${t.ownerUserId}|${t.relatedLabel}`
          if (existingKeys.has(key)) continue
          existingKeys.add(key)
          await createTask(
            {
              title: rule.name,
              description: rule.description,
              ownerUserId: t.ownerUserId,
              ownerName: t.ownerName,
              ownerRole: rule.assignRole,
              dueDate: due,
              source: 'rule',
              ruleId: rule.$id,
              semesterId: semester.$id,
              semesterName: `${semester.name} ${semester.academicYearLabel}`,
              relatedLabel: t.relatedLabel,
            },
            user,
          )
          created++
        }
      }
      setGenModal(false)
      setNotice(`Generated ${created} task(s) for ${semester.name} ${semester.academicYearLabel}. Existing tasks were skipped.`)
    } catch (err) {
      setError(err?.message || 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  if (rules === null) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Deadline Rules"
        subtitle="Relative deadlines from the procedure manual — resolved into real tasks per semester (SRS TASK-01/02)."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setGenModal(true)} disabled={!rules.some((r) => r.active)}>
              <Icon name="sparkles" className="h-4 w-4" /> Generate Tasks
            </button>
            <button className="btn-primary" onClick={() => setModal({})}>
              <Icon name="plus" className="h-4 w-4" /> New Rule
            </button>
          </>
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {notice && (
        <div className="mb-4 flex items-start justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="font-bold">×</button>
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState title="No deadline rules yet" message="Create rules like “Subject file due 9 weeks before semester start”, then generate tasks per semester." icon="clock" />
      ) : (
        <Table headers={['Rule', 'When', 'Assigned To', 'Status', 'Actions']}>
          {rules.map((r) => (
            <tr key={r.$id} className="hover:bg-brand-tealLight/30">
              <td className="td">
                <p className="font-bold text-gray-900">{r.name}</p>
                {r.description && <p className="text-xs text-gray-400">{r.description}</p>}
              </td>
              <td className="td">
                <span className="chip bg-gray-100 text-gray-600">{offsetLabel(r.offsetDays)} {ANCHORS[r.anchor]?.toLowerCase()}</span>
              </td>
              <td className="td text-[13px] font-semibold text-gray-600">{ROLE_LABELS[r.assignRole] || r.assignRole}</td>
              <td className="td"><StatusBadge status={r.active ? 'active' : 'inactive'} /></td>
              <td className="td">
                <div className="flex gap-2">
                  <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setModal({ doc: r })}>Edit</button>
                  <button className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => remove(r)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.doc ? 'Edit Rule' : 'New Deadline Rule'} wide>
        {modal && <RuleForm initial={modal.doc} onSave={save} onCancel={() => setModal(null)} busy={busy} />}
      </Modal>

      <Modal open={genModal} onClose={() => setGenModal(false)} title="Generate Tasks for a Semester">
        <p className="mb-4 text-sm text-gray-500">
          Every <span className="font-semibold">active rule</span> is resolved against the semester's real dates and a task is
          created for each relevant staff member (per module offering for Lecturers / Module Leaders, per assignment for other
          roles). Duplicates are skipped, so this is safe to re-run.
        </p>
        <label className="label">Semester *</label>
        <select className="input" value={genSemester} onChange={(e) => setGenSemester(e.target.value)}>
          <option value="">— Select semester —</option>
          {semesters.map((s) => (
            <option key={s.$id} value={s.$id}>
              {s.name} — {s.academicYearLabel} ({fmtDate(s.startDate)} → {fmtDate(s.endDate)})
            </option>
          ))}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setGenModal(false)}>Cancel</button>
          <button className="btn-primary" disabled={!genSemester || busy} onClick={generate}>
            {busy ? 'Generating…' : 'Generate Tasks'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
