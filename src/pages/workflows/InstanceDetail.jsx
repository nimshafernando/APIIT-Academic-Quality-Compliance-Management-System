import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { databases, DB_ID, COL, listAll, Query, fmtDateTime } from '../../lib/appwrite'
import { parseStages, approveStage, returnForRevision, resubmitWorkflow, fileDownloadUrl, fileViewUrl } from '../../lib/workflow'
import { ROLES, ROLE_LABELS } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, StatusBadge, ErrorBanner, Modal, Avatar } from '../../components/UI'
import Icon from '../../components/Icons'

const ACTION_LABELS = {
  submit: 'Submitted',
  approve: 'Approved',
  return: 'Returned for revision',
  resubmit: 'Resubmitted',
}

function StageTimeline({ instance }) {
  const stages = parseStages(instance)
  const current = instance.currentStageIndex
  return (
    <ol className="space-y-0">
      {stages.map((s, i) => {
        const done = instance.status === 'approved' ? true : i < current
        const isCurrent = instance.status !== 'approved' && i === current
        const returned = isCurrent && instance.status === 'returned'
        return (
          <li key={i} className="relative flex gap-3 pb-6 last:pb-0">
            {i < stages.length - 1 && (
              <span className={`absolute left-[11px] top-6 h-full w-0.5 ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? 'bg-emerald-500 text-white'
                  : returned
                    ? 'bg-amber-400 text-white'
                    : isCurrent
                      ? 'bg-brand-teal text-white'
                      : 'bg-gray-200 text-gray-500'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <div>
              <p className={`text-sm font-semibold ${isCurrent ? 'text-gray-900' : 'text-gray-600'}`}>
                {s.label || ROLE_LABELS[s.role]}
              </p>
              <p className="text-xs text-gray-400">
                {done
                  ? 'Approved'
                  : returned
                    ? 'Returned to submitter'
                    : isCurrent
                      ? `Waiting on ${ROLE_LABELS[s.role]}`
                      : 'Pending'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function InstanceDetail() {
  const { id } = useParams()
  const { user, roles, hasRole } = useAuth()
  const [instance, setInstance] = useState(null)
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [returnModal, setReturnModal] = useState(false)
  const [comment, setComment] = useState('')
  const [resubmitFiles, setResubmitFiles] = useState([])

  const load = useCallback(async () => {
    try {
      const [inst, acts] = await Promise.all([
        databases.getDocument(DB_ID, COL.WORKFLOW_INSTANCES, id),
        listAll(COL.WORKFLOW_ACTIONS, [Query.equal('instanceId', id), Query.orderDesc('$createdAt')]),
      ])
      setInstance(inst)
      setActions(acts)
    } catch (err) {
      setError(err?.message || 'Failed to load submission.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner />
  if (!instance) return <ErrorBanner error={error || 'Submission not found.'} />

  const canActOnStage = instance.status === 'in_progress' && roles.includes(instance.currentStageRole)
  const isSubmitter = instance.submittedBy === user.$id
  const canResubmit = instance.status === 'returned' && isSubmitter

  const doApprove = async () => {
    setBusy(true)
    setError('')
    try {
      await approveStage(instance, user, comment)
      setComment('')
      await load()
    } catch (err) {
      setError(err?.message || 'Approval failed.')
    } finally {
      setBusy(false)
    }
  }

  const doReturn = async () => {
    setBusy(true)
    setError('')
    try {
      await returnForRevision(instance, user, comment)
      setComment('')
      setReturnModal(false)
      await load()
    } catch (err) {
      setError(err?.message || 'Return failed.')
    } finally {
      setBusy(false)
    }
  }

  const doResubmit = async () => {
    setBusy(true)
    setError('')
    try {
      await resubmitWorkflow(instance, user, comment, resubmitFiles)
      setComment('')
      setResubmitFiles([])
      await load()
    } catch (err) {
      setError(err?.message || 'Resubmission failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={instance.title}
        subtitle={`${instance.templateName} · ${instance.moduleCode} ${instance.moduleName} · ${instance.subjectName}`}
        actions={<StatusBadge status={instance.status} />}
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Action panel */}
          {canActOnStage && (
            <div className="card border-l-4 border-l-brand-teal px-6 py-5">
              <h3 className="font-bold text-gray-900">This submission is waiting on you</h3>
              <p className="mt-1 text-sm text-gray-500">
                Stage: <span className="font-semibold">{instance.currentStageLabel}</span>. Review the evidence files below,
                then approve or return with feedback.
              </p>
              <textarea
                className="input mt-3"
                rows={2}
                placeholder="Optional comment for approval (required if returning)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy} onClick={doApprove}>
                  <Icon name="checkCircle" className="h-4 w-4" /> Approve Stage
                </button>
                <button className="btn-danger" disabled={busy} onClick={() => setReturnModal(true)}>
                  <Icon name="return" className="h-4 w-4" /> Return for Revision
                </button>
              </div>
            </div>
          )}

          {/* WF-05: HOD can unblock a stalled approval by acting on behalf of the current stage */}
          {!canActOnStage && instance.status === 'in_progress' && hasRole(ROLES.HOD) && (
            <div className="card border-l-4 border-l-purple-400 px-6 py-5">
              <h3 className="flex items-center gap-2 font-bold text-gray-900">
                <Icon name="shield" className="h-5 w-5 text-purple-500" /> HOD Override
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                This item is waiting on <span className="font-semibold">{instance.currentStageLabel}</span>. As HOD you can
                unblock a stalled approval by acting on their behalf (logged in the audit trail).
              </p>
              <textarea
                className="input mt-3"
                rows={2}
                placeholder="Reason for override (recorded in the audit trail)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={busy || !comment.trim()}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    try {
                      await approveStage(instance, user, `[HOD override] ${comment.trim()}`)
                      setComment('')
                      await load()
                    } catch (err) {
                      setError(err?.message)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <Icon name="checkCircle" className="h-4 w-4" /> Approve on Behalf
                </button>
                <button className="btn-danger" disabled={busy || !comment.trim()} onClick={() => setReturnModal(true)}>
                  <Icon name="return" className="h-4 w-4" /> Return to Submitter
                </button>
              </div>
            </div>
          )}

          {canResubmit && (
            <div className="card border-l-4 border-l-amber-400 px-6 py-5">
              <h3 className="font-bold text-gray-900">Returned for revision</h3>
              <p className="mt-1 text-sm text-gray-500">
                Address the reviewer's comments (see history below), attach revised files if needed, and resubmit.
              </p>
              <textarea
                className="input mt-3"
                rows={2}
                placeholder="Describe what you changed (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <input type="file" multiple className="input mt-2" onChange={(e) => setResubmitFiles(Array.from(e.target.files || []))} />
              <button className="btn-primary mt-3" disabled={busy} onClick={doResubmit}>
                Resubmit for Approval
              </button>
            </div>
          )}

          {instance.status === 'approved' && (
            <div className="card border-l-4 border-l-emerald-500 px-6 py-5">
              <h3 className="flex items-center gap-2 font-bold text-emerald-700">
                <Icon name="checkCircle" className="h-5 w-5" /> Fully approved &amp; locked
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                This record has completed all approval stages and is locked as compliance evidence (ISO 21001:2018).
              </p>
            </div>
          )}

          {/* Evidence files */}
          <div className="card px-6 py-5">
            <h3 className="mb-3 font-bold text-gray-900">Evidence Files</h3>
            {(instance.fileIds || []).length === 0 ? (
              <p className="text-sm text-gray-400">No files attached.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {instance.fileIds.map((fid, i) => (
                  <li key={fid} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5 text-sm text-gray-700">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-tealLight text-brand-teal">
                        <Icon name="doc" className="h-4.5 w-4.5" />
                      </span>
                      <span className="truncate font-medium">{instance.fileNames?.[i] || `File ${i + 1}`}</span>
                    </span>
                    <span className="flex flex-shrink-0 gap-2">
                      <a href={fileViewUrl(fid)} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">
                        <Icon name="eye" className="h-3.5 w-3.5" /> View
                      </a>
                      <a href={fileDownloadUrl(fid)} className="btn-secondary !px-3 !py-1.5 text-xs">
                        <Icon name="download" className="h-3.5 w-3.5" /> Download
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Audit history */}
          <div className="card px-6 py-5">
            <h3 className="mb-3 font-bold text-gray-900">History &amp; Audit Trail</h3>
            <ul className="divide-y divide-gray-100">
              {actions.map((a) => (
                <li key={a.$id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2.5 text-sm">
                      <Avatar name={a.userName} className="h-7 w-7 text-[10px]" />
                      <span className="font-semibold">{a.userName?.replace(/\(.*?\)/g, '').trim()}</span>{' '}
                      <span
                        className={
                          a.action === 'approve'
                            ? 'text-emerald-600'
                            : a.action === 'return'
                              ? 'text-amber-600'
                              : 'text-gray-600'
                        }
                      >
                        {ACTION_LABELS[a.action] || a.action}
                      </span>
                      {a.stageLabel && <span className="text-gray-400"> · {a.stageLabel}</span>}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDateTime(a.$createdAt)}</p>
                  </div>
                  {a.comment && <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">“{a.comment}”</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sidebar: timeline + meta */}
        <div className="space-y-6">
          <div className="card px-6 py-5">
            <h3 className="mb-4 font-bold text-gray-900">Approval Progress</h3>
            <StageTimeline instance={instance} />
          </div>
          <div className="card px-6 py-5 text-sm">
            <h3 className="mb-3 font-bold text-gray-900">Details</h3>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-gray-500">Submitted by</dt><dd className="font-medium">{instance.submittedByName}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Module</dt><dd className="font-medium">{instance.moduleCode}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Level</dt><dd className="font-medium">{instance.levelName || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd className="font-medium">{fmtDateTime(instance.$createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Last update</dt><dd className="font-medium">{fmtDateTime(instance.$updatedAt)}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Return for Revision">
        <p className="mb-3 text-sm text-gray-600">
          A comment explaining the required changes is <span className="font-semibold">mandatory</span> when returning a
          submission (SRS WF-03).
        </p>
        <textarea
          className="input"
          rows={3}
          placeholder="What needs to change?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setReturnModal(false)}>Cancel</button>
          <button className="btn-danger" disabled={busy || !comment.trim()} onClick={doReturn}>
            Return Submission
          </button>
        </div>
      </Modal>
    </div>
  )
}
