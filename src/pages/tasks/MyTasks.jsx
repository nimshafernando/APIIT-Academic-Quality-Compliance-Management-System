import { useCallback, useEffect, useState } from 'react'
import { databases, DB_ID, COL, listAll, Query, fmtDate } from '../../lib/appwrite'
import { createTask, dueLabel, daysUntil } from '../../lib/tasks'
import { ROLES } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner, Modal } from '../../components/UI'
import Icon from '../../components/Icons'

const TONE_STYLES = {
  overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  today: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  soon: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  later: 'bg-gray-100 text-gray-500',
}

function TaskRow({ task, onToggle, canManage }) {
  const done = task.status === 'done'
  const due = dueLabel(task.dueDate)
  return (
    <div className={`card flex items-start gap-4 px-5 py-4 transition-all ${done ? 'opacity-55' : daysUntil(task.dueDate) < 0 ? 'border-l-4 border-l-red-400' : ''}`}>
      <button
        onClick={() => onToggle(task)}
        disabled={!canManage}
        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          done ? 'border-brand-teal bg-brand-teal text-white' : 'border-gray-300 text-transparent hover:border-brand-teal'
        } ${canManage ? '' : 'cursor-default'}`}
        title={done ? 'Reopen' : 'Mark complete'}
      >
        <Icon name="checkCircle" className="h-4 w-4" strokeWidth={2.4} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
        {task.description && <p className="mt-0.5 text-[13px] text-gray-500">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {!done && <span className={`chip ${TONE_STYLES[due.tone]}`}>{due.text}</span>}
          <span className="text-gray-400">{fmtDate(task.dueDate)}</span>
          {task.relatedLabel && <span className="chip bg-gray-100 text-gray-500">{task.relatedLabel}</span>}
          {task.semesterName && <span className="text-gray-400">· {task.semesterName}</span>}
          {task.source === 'rule' && <span className="chip bg-brand-tealLight text-brand-tealDeep">auto</span>}
          {task.escalated && !done && <span className="chip bg-red-50 text-red-600 ring-1 ring-red-200">escalated to HOD</span>}
        </div>
      </div>
    </div>
  )
}

export default function MyTasks() {
  const { user, hasRole } = useAuth()
  const [tasks, setTasks] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false) // HOD/superadmin: everyone's tasks
  const [form, setForm] = useState({ title: '', description: '', ownerUserId: '', dueDate: '' })

  const canAssign = hasRole(ROLES.MODULE_LEADER, ROLES.HOD, ROLES.SUPER_ADMIN)
  const canSeeAll = hasRole(ROLES.HOD, ROLES.SUPER_ADMIN)

  const load = useCallback(async () => {
    try {
      const queries = showAll ? [Query.orderAsc('dueDate')] : [Query.equal('ownerUserId', user.$id), Query.orderAsc('dueDate')]
      setTasks(await listAll(COL.TASKS, queries))
    } catch (err) {
      setError(err?.message || 'Failed to load tasks.')
      setTasks([])
    }
  }, [user.$id, showAll])

  useEffect(() => {
    load()
    if (canAssign) listAll(COL.PROFILES, [Query.equal('status', 'active')]).then(setProfiles).catch(() => {})
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (task) => {
    try {
      const done = task.status === 'done'
      await databases.updateDocument(DB_ID, COL.TASKS, task.$id, {
        status: done ? 'open' : 'done',
        completedByName: done ? '' : user.name,
        completedAt: done ? null : new Date().toISOString(),
      })
      await load()
    } catch (err) {
      setError(err?.message)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const owner = profiles.find((p) => p.userId === form.ownerUserId)
      await createTask(
        {
          title: form.title,
          description: form.description,
          ownerUserId: form.ownerUserId,
          ownerName: owner?.name || '',
          dueDate: new Date(form.dueDate).toISOString(),
        },
        user,
      )
      setModal(false)
      setForm({ title: '', description: '', ownerUserId: '', dueDate: '' })
      await load()
    } catch (err) {
      setError(err?.message || 'Could not create task.')
    } finally {
      setBusy(false)
    }
  }

  if (tasks === null) return <Spinner />

  const open = tasks.filter((t) => t.status === 'open')
  const overdue = open.filter((t) => daysUntil(t.dueDate) < 0)
  const upcoming = open.filter((t) => daysUntil(t.dueDate) >= 0)
  const done = tasks.filter((t) => t.status === 'done')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={showAll ? 'All Tasks (School-wide)' : 'My Tasks'}
        subtitle="Deadlines generated from the procedure manual, plus ad-hoc assignments."
        actions={
          <>
            {canSeeAll && (
              <button className="btn-secondary" onClick={() => setShowAll((v) => !v)}>
                <Icon name="eye" className="h-4 w-4" /> {showAll ? 'My tasks' : 'All tasks'}
              </button>
            )}
            {canAssign && (
              <button className="btn-primary" onClick={() => setModal(true)}>
                <Icon name="plus" className="h-4 w-4" /> New Task
              </button>
            )}
          </>
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {tasks.length === 0 ? (
        <EmptyState title="No tasks" message="Tasks appear here when deadlines are generated for a semester or assigned to you." icon="clipboard" />
      ) : (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-red-600">
                <Icon name="alert" className="h-4 w-4" /> Overdue ({overdue.length})
              </h2>
              <div className="space-y-2.5">
                {overdue.map((t) => (
                  <TaskRow key={t.$id} task={t} onToggle={toggle} canManage={t.ownerUserId === user.$id || canSeeAll} />
                ))}
              </div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-gray-500">
                <Icon name="clock" className="h-4 w-4" /> Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-2.5">
                {upcoming.map((t) => (
                  <TaskRow key={t.$id} task={t} onToggle={toggle} canManage={t.ownerUserId === user.$id || canSeeAll} />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-gray-400">
                <Icon name="checkCircle" className="h-4 w-4" /> Completed ({done.length})
              </h2>
              <div className="space-y-2.5">
                {done.map((t) => (
                  <TaskRow key={t.$id} task={t} onToggle={toggle} canManage={t.ownerUserId === user.$id || canSeeAll} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Assign a Task">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Upload re-sit marking scheme" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Assign To *</label>
              <select className="input" value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })} required>
                <option value="">— Select staff —</option>
                {profiles.map((p) => (
                  <option key={p.userId} value={p.userId}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Assigning…' : 'Assign Task'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
