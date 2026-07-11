import { useEffect, useMemo, useState } from 'react'
import { COL, listAll, Query, fmtDateTime, fmtDate } from '../../lib/appwrite'
import { daysUntil } from '../../lib/tasks'
import { PageHeader, Spinner, EmptyState, ErrorBanner, StatusBadge, Table } from '../../components/UI'
import Icon from '../../components/Icons'

// RPT-01/02 — exportable compliance reports + audit trail viewer.
function toCsv(headers, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

function download(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const TABS = [
  { key: 'workflows', label: 'Workflow Compliance', icon: 'clipboard' },
  { key: 'slots', label: 'Subject File Checklists', icon: 'doc' },
  { key: 'tasks', label: 'Tasks & Deadlines', icon: 'clock' },
  { key: 'audit', label: 'Audit Trail', icon: 'shield' },
]

export default function Reports() {
  const [tab, setTab] = useState('workflows')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [levelFilter, setLevelFilter] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [instances, slots, tasks, actions] = await Promise.all([
          listAll(COL.WORKFLOW_INSTANCES, [Query.orderDesc('$updatedAt')]),
          listAll(COL.DOCUMENT_SLOTS),
          listAll(COL.TASKS, [Query.orderAsc('dueDate')]),
          listAll(COL.WORKFLOW_ACTIONS, [Query.orderDesc('$createdAt')]),
        ])
        setData({ instances, slots, tasks, actions })
      } catch (err) {
        setError(err?.message)
        setData({})
      }
    })()
  }, [])

  const levels = useMemo(() => (data ? [...new Set((data.instances || []).map((i) => i.levelName).filter(Boolean))].sort() : []), [data])

  if (!data) return <Spinner />
  const { instances = [], slots = [], tasks = [], actions = [] } = data

  const filteredInstances = levelFilter ? instances.filter((i) => i.levelName === levelFilter) : instances

  const exportCurrent = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    if (tab === 'workflows') {
      download(
        `aqcms-compliance-${stamp}.csv`,
        toCsv(
          ['Title', 'Template', 'Module', 'Subject', 'Level', 'Submitted By', 'Status', 'Current Stage', 'Waiting On', 'Last Updated'],
          filteredInstances.map((i) => [
            i.title, i.templateName, i.moduleCode, i.subjectName, i.levelName, i.submittedByName,
            i.status, i.currentStageLabel, i.status === 'in_progress' ? i.currentStageRole : '', fmtDateTime(i.$updatedAt),
          ]),
        ),
      )
    } else if (tab === 'slots') {
      download(
        `aqcms-subject-files-${stamp}.csv`,
        toCsv(
          ['Module', 'Subject', 'Level', 'Document Slot', 'Category', 'Restricted', 'Status', 'Version', 'Current File', 'Last Updated By'],
          slots.map((s) => [s.moduleCode, s.subjectName, s.levelName, s.name, s.category, s.restricted ? 'Yes' : 'No', s.status, s.version, s.currentFileName, s.updatedByName]),
        ),
      )
    } else if (tab === 'tasks') {
      download(
        `aqcms-tasks-${stamp}.csv`,
        toCsv(
          ['Task', 'Owner', 'Role', 'Related To', 'Semester', 'Due Date', 'Status', 'Days To Deadline / Overdue', 'Escalated', 'Source'],
          tasks.map((t) => [
            t.title, t.ownerName, t.ownerRole, t.relatedLabel, t.semesterName, fmtDate(t.dueDate),
            t.status, t.status === 'done' ? '' : daysUntil(t.dueDate), t.escalated ? 'Yes' : 'No', t.source,
          ]),
        ),
      )
    } else {
      download(
        `aqcms-audit-${stamp}.csv`,
        toCsv(
          ['Timestamp', 'User', 'Action', 'Stage', 'Comment', 'Instance ID'],
          actions.map((a) => [fmtDateTime(a.$createdAt), a.userName, a.action, a.stageLabel, a.comment, a.instanceId]),
        ),
      )
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports & Audit"
        subtitle="Live compliance reporting — the replacement for the Subject File Tracker spreadsheet (SRS RPT-01/02)."
        actions={
          <button className="btn-primary" onClick={exportCurrent}>
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </button>
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip !px-4 !py-2 transition-all ${tab === t.key ? 'bg-brand-ink text-white shadow-card' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:text-gray-800'}`}
          >
            <Icon name={t.icon} className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'workflows' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select className="input !w-auto" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="">All levels</option>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <p className="text-xs text-gray-400">{filteredInstances.length} tracked item(s)</p>
          </div>
          {filteredInstances.length === 0 ? (
            <EmptyState title="No workflow items" icon="clipboard" />
          ) : (
            <Table headers={['Item', 'Module', 'Level', 'Status', 'Waiting On', 'Updated']}>
              {filteredInstances.map((i) => (
                <tr key={i.$id} className="hover:bg-brand-tealLight/30">
                  <td className="td"><p className="font-bold text-gray-900">{i.title}</p><p className="text-xs text-gray-400">{i.templateName} · {i.submittedByName}</p></td>
                  <td className="td font-mono text-xs">{i.moduleCode}</td>
                  <td className="td text-xs">{i.levelName}</td>
                  <td className="td"><StatusBadge status={i.status} /></td>
                  <td className="td text-xs font-semibold">{i.status === 'in_progress' ? i.currentStageLabel : '—'}</td>
                  <td className="td text-xs text-gray-400">{fmtDateTime(i.$updatedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {tab === 'slots' &&
        (slots.length === 0 ? (
          <EmptyState title="No document slots yet" icon="doc" />
        ) : (
          <Table headers={['Document', 'Subject', 'Module', 'Status', 'Version', 'Updated By']}>
            {slots.map((s) => (
              <tr key={s.$id} className="hover:bg-brand-tealLight/30">
                <td className="td font-bold text-gray-900">{s.name}{s.restricted && <span className="ml-2 chip bg-red-50 text-red-600">restricted</span>}</td>
                <td className="td text-xs">{s.subjectName}</td>
                <td className="td font-mono text-xs">{s.moduleCode}</td>
                <td className="td"><StatusBadge status={s.status} /></td>
                <td className="td text-xs">{s.version ? `v${s.version}` : '—'}</td>
                <td className="td text-xs text-gray-400">{s.updatedByName || '—'}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'tasks' &&
        (tasks.length === 0 ? (
          <EmptyState title="No tasks generated yet" message="Generate tasks from Deadline Rules first." icon="clock" />
        ) : (
          <Table headers={['Task', 'Owner', 'Due', 'Days', 'Status', 'Escalated']}>
            {tasks.map((t) => {
              const d = daysUntil(t.dueDate)
              return (
                <tr key={t.$id} className="hover:bg-brand-tealLight/30">
                  <td className="td"><p className="font-bold text-gray-900">{t.title}</p><p className="text-xs text-gray-400">{t.relatedLabel} {t.semesterName && `· ${t.semesterName}`}</p></td>
                  <td className="td text-xs">{t.ownerName?.replace(/\(.*?\)/g, '').trim()}</td>
                  <td className="td text-xs">{fmtDate(t.dueDate)}</td>
                  <td className={`td text-xs font-bold ${t.status === 'done' ? 'text-gray-300' : d < 0 ? 'text-red-600' : d <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {t.status === 'done' ? '—' : d < 0 ? `${-d} overdue` : `${d} left`}
                  </td>
                  <td className="td"><StatusBadge status={t.status} /></td>
                  <td className="td text-xs">{t.escalated ? <span className="chip bg-red-50 text-red-600">yes</span> : '—'}</td>
                </tr>
              )
            })}
          </Table>
        ))}

      {tab === 'audit' &&
        (actions.length === 0 ? (
          <EmptyState title="No audit entries" icon="shield" />
        ) : (
          <Table headers={['Timestamp', 'User', 'Action', 'Stage', 'Comment']}>
            {actions.slice(0, 200).map((a) => (
              <tr key={a.$id} className="hover:bg-brand-tealLight/30">
                <td className="td text-xs text-gray-400">{fmtDateTime(a.$createdAt)}</td>
                <td className="td text-xs font-semibold">{a.userName?.replace(/\(.*?\)/g, '').trim()}</td>
                <td className="td"><span className={`chip ${a.action === 'approve' ? 'bg-emerald-50 text-emerald-700' : a.action === 'return' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{a.action}</span></td>
                <td className="td text-xs">{a.stageLabel}</td>
                <td className="td max-w-md text-xs text-gray-500">{a.comment}</td>
              </tr>
            ))}
          </Table>
        ))}
    </div>
  )
}
