import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { databases, storage, DB_ID, COL, BUCKET_ID, ID, Permission, Role, listAll, Query, fmtDateTime } from '../../lib/appwrite'
import { fileViewUrl, fileDownloadUrl } from '../../lib/workflow'
import { ROLES } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner, StatusBadge, Modal, ProgressBar } from '../../components/UI'
import Icon from '../../components/Icons'

// Standard checklist from SRS DOC-01 (mirrors the old files.txt contents).
const STANDARD_SLOTS = [
  { name: 'Module Descriptor', category: 'Learning Material', restricted: false },
  { name: 'Lesson Sequence Sheet', category: 'Learning Material', restricted: false },
  { name: 'Internal Verification Form (IVF)', category: 'Assessment', restricted: false },
  { name: 'Assessment — In-course', category: 'Assessment', restricted: false },
  { name: 'Assessment — Examination', category: 'Examination', restricted: true },
  { name: 'Assessment — Re-sit', category: 'Examination', restricted: true },
  { name: 'Marking Scheme', category: 'Assessment', restricted: true },
  { name: 'Mark Grid', category: 'Assessment', restricted: false },
  { name: 'End of Module Report / NCUK Marker’s Report', category: 'Assessment', restricted: false },
]

const REVIEW_ROLES = [ROLES.INTERNAL_VERIFIER, ROLES.MODULE_LEADER, ROLES.LEVEL_COORDINATOR, ROLES.HOD]
const UPLOAD_ROLES = [ROLES.LECTURER, ROLES.MODULE_LEADER, ROLES.SUPER_ADMIN]
const MANAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.MODULE_LEADER, ROLES.ACADEMIC_ADMIN]

// DOC-03: restricted files are only readable by reviewer roles + uploader.
// A client can only grant its own identity, so the restricted upload starts
// uploader-only and the deadline-engine function stamps reviewer-label access
// when the slot is saved (document_slots update event).
function filePermissions(restricted, uploaderId) {
  if (!restricted) return [Permission.read(Role.users())]
  return [Permission.read(Role.user(uploaderId))]
}

export default function SubjectFileDetail() {
  const { subjectId } = useParams()
  const { user, hasRole } = useAuth()
  const [subject, setSubject] = useState(null)
  const [slots, setSlots] = useState([])
  const [error, setError] = useState('')
  const [busySlot, setBusySlot] = useState('')
  const [historyFor, setHistoryFor] = useState(null) // { slot, versions }
  const [returnFor, setReturnFor] = useState(null) // slot being returned
  const [note, setNote] = useState('')
  const [addModal, setAddModal] = useState(false)
  const [newSlot, setNewSlot] = useState({ name: '', category: 'Assessment', restricted: false })

  const canUpload = hasRole(...UPLOAD_ROLES)
  const canReview = hasRole(...REVIEW_ROLES)
  const canManage = hasRole(...MANAGE_ROLES)

  const load = useCallback(async () => {
    try {
      const [sub, list] = await Promise.all([
        databases.getDocument(DB_ID, COL.SUBJECTS, subjectId),
        listAll(COL.DOCUMENT_SLOTS, [Query.equal('subjectId', subjectId)]),
      ])
      setSubject(sub)
      setSlots(list.sort((a, b) => a.$createdAt.localeCompare(b.$createdAt)))
    } catch (err) {
      setError(err?.message || 'Failed to load subject file.')
    }
  }, [subjectId])

  useEffect(() => {
    load()
  }, [load])

  if (!subject && !error) return <Spinner />
  if (!subject) return <ErrorBanner error={error} />

  const slotBase = {
    subjectId: subject.$id,
    subjectName: subject.name,
    moduleId: subject.moduleId || '',
    moduleCode: subject.moduleCode || '',
    moduleName: subject.moduleName || '',
    levelName: subject.levelName || '',
  }

  const applyStandard = async () => {
    setBusySlot('standard')
    setError('')
    try {
      const existing = new Set(slots.map((s) => s.name))
      for (const s of STANDARD_SLOTS) {
        if (existing.has(s.name)) continue
        await databases.createDocument(DB_ID, COL.DOCUMENT_SLOTS, ID.unique(), {
          ...slotBase, ...s, required: true, status: 'not_started', version: 0,
        })
      }
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusySlot('')
    }
  }

  const addSlot = async (e) => {
    e.preventDefault()
    setBusySlot('add')
    try {
      await databases.createDocument(DB_ID, COL.DOCUMENT_SLOTS, ID.unique(), {
        ...slotBase, ...newSlot, required: true, status: 'not_started', version: 0,
      })
      setAddModal(false)
      setNewSlot({ name: '', category: 'Assessment', restricted: false })
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusySlot('')
    }
  }

  // DOC-02: upload/replace with version history
  const upload = async (slot, file) => {
    if (!file) return
    setBusySlot(slot.$id)
    setError('')
    try {
      const created = await storage.createFile(BUCKET_ID, ID.unique(), file, filePermissions(slot.restricted, user.$id))
      const version = (slot.version || 0) + 1
      await databases.createDocument(DB_ID, COL.DOCUMENT_VERSIONS, ID.unique(), {
        slotId: slot.$id, version, fileId: created.$id, fileName: file.name, uploadedBy: user.$id, uploadedByName: user.name,
        note: slot.status === 'returned' ? 'Revision after return' : '',
      })
      await databases.updateDocument(DB_ID, COL.DOCUMENT_SLOTS, slot.$id, {
        status: 'submitted', currentFileId: created.$id, currentFileName: file.name, version, updatedBy: user.$id, updatedByName: user.name, reviewNote: '',
      })
      await load()
    } catch (err) {
      setError(err?.message || 'Upload failed.')
    } finally {
      setBusySlot('')
    }
  }

  const setStatus = async (slot, status, reviewNote = '') => {
    setBusySlot(slot.$id)
    setError('')
    try {
      await databases.updateDocument(DB_ID, COL.DOCUMENT_SLOTS, slot.$id, { status, reviewNote, updatedByName: user.name })
      await load()
    } catch (err) {
      setError(err?.message)
    } finally {
      setBusySlot('')
    }
  }

  const openHistory = async (slot) => {
    try {
      const versions = await listAll(COL.DOCUMENT_VERSIONS, [Query.equal('slotId', slot.$id), Query.orderDesc('$createdAt')])
      setHistoryFor({ slot, versions })
    } catch (err) {
      setError(err?.message)
    }
  }

  const total = slots.length
  const approved = slots.filter((s) => s.status === 'approved').length
  const pct = total ? Math.round((approved / total) * 100) : 0

  return (
    <div>
      <div className="mb-2">
        <Link to="/subject-files" className="flex w-fit items-center gap-1 text-xs font-bold text-gray-400 hover:text-brand-tealDark">
          ← Subject Files
        </Link>
      </div>
      <PageHeader
        title={subject.name}
        subtitle={`${subject.moduleCode} ${subject.moduleName} · ${subject.levelName} · ${subject.category}`}
        actions={
          canManage && (
            <>
              {slots.length === 0 && (
                <button className="btn-primary" onClick={applyStandard} disabled={busySlot === 'standard'}>
                  <Icon name="sparkles" className="h-4 w-4" /> {busySlot === 'standard' ? 'Creating…' : 'Apply Standard Checklist'}
                </button>
              )}
              <button className="btn-secondary" onClick={() => setAddModal(true)}>
                <Icon name="plus" className="h-4 w-4" /> Add Slot
              </button>
            </>
          )
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {total > 0 && (
        <div className="card mb-6 flex items-center gap-5 px-6 py-4">
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-gray-700">Checklist progress</span>
              <span className={pct === 100 ? 'text-emerald-600' : 'text-brand-tealDark'}>{approved}/{total} approved</span>
            </div>
            <ProgressBar value={pct} className="mt-2" />
          </div>
        </div>
      )}

      {slots.length === 0 ? (
        <EmptyState
          title="No document checklist yet"
          message={canManage ? 'Apply the standard checklist (IVF, Module Descriptor, assessments, mark grid…) or add custom slots.' : 'The checklist for this subject has not been set up yet.'}
          icon="doc"
        />
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => (
            <div key={slot.$id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-gray-900">
                    {slot.name}
                    {slot.restricted && (
                      <span className="chip bg-red-50 text-red-600 ring-1 ring-red-200">
                        <Icon name="lock" className="h-3 w-3" /> Restricted
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {slot.category}
                    {slot.version > 0 && <> · v{slot.version} · {slot.currentFileName}</>}
                    {slot.updatedByName && <> · last update by {slot.updatedByName.replace(/\(.*?\)/g, '').trim()}</>}
                  </p>
                  {slot.status === 'returned' && slot.reviewNote && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                      <span className="font-bold">Reviewer:</span> {slot.reviewNote}
                    </p>
                  )}
                </div>
                <StatusBadge status={slot.status} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {slot.currentFileId && (
                  <>
                    <a href={fileViewUrl(slot.currentFileId)} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">
                      <Icon name="eye" className="h-3.5 w-3.5" /> View
                    </a>
                    <a href={fileDownloadUrl(slot.currentFileId)} className="btn-secondary !px-3 !py-1.5 text-xs">
                      <Icon name="download" className="h-3.5 w-3.5" /> Download
                    </a>
                  </>
                )}
                {slot.version > 0 && (
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => openHistory(slot)}>
                    <Icon name="clock" className="h-3.5 w-3.5" /> History ({slot.version})
                  </button>
                )}
                {canUpload && slot.status !== 'approved' && (
                  <label className={`btn-primary !px-3 !py-1.5 text-xs ${busySlot === slot.$id ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
                    <Icon name="send" className="h-3.5 w-3.5" />
                    {busySlot === slot.$id ? 'Uploading…' : slot.version > 0 ? 'Upload New Version' : 'Upload'}
                    <input type="file" className="hidden" onChange={(e) => upload(slot, e.target.files?.[0])} />
                  </label>
                )}
                {canReview && ['submitted', 'under_review'].includes(slot.status) && (
                  <>
                    {slot.status === 'submitted' && (
                      <button className="btn-secondary !px-3 !py-1.5 text-xs" disabled={busySlot === slot.$id} onClick={() => setStatus(slot, 'under_review')}>
                        <Icon name="search" className="h-3.5 w-3.5" /> Start Review
                      </button>
                    )}
                    <button className="btn-primary !bg-none !bg-emerald-500 !px-3 !py-1.5 text-xs hover:!bg-emerald-600" disabled={busySlot === slot.$id} onClick={() => setStatus(slot, 'approved')}>
                      <Icon name="checkCircle" className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button className="btn-danger !px-3 !py-1.5 text-xs" disabled={busySlot === slot.$id} onClick={() => { setReturnFor(slot); setNote('') }}>
                      <Icon name="return" className="h-3.5 w-3.5" /> Return
                    </button>
                  </>
                )}
                {canReview && slot.status === 'approved' && hasRole(ROLES.HOD, ROLES.SUPER_ADMIN) && (
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setStatus(slot, 'under_review', 'Reopened by ' + user.name)}>
                    Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Version history */}
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={`Version History — ${historyFor?.slot.name}`}>
        {historyFor && (
          <ul className="divide-y divide-gray-100">
            {historyFor.versions.map((v) => (
              <li key={v.$id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-800">v{v.version} — {v.fileName}</p>
                  <p className="text-xs text-gray-400">{v.uploadedByName?.replace(/\(.*?\)/g, '').trim()} · {fmtDateTime(v.$createdAt)}{v.note && ` · ${v.note}`}</p>
                </div>
                <a href={fileDownloadUrl(v.fileId)} className="btn-secondary flex-shrink-0 !px-3 !py-1.5 text-xs">
                  <Icon name="download" className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Return with mandatory note (DOC-05) */}
      <Modal open={!!returnFor} onClose={() => setReturnFor(null)} title={`Return — ${returnFor?.name}`}>
        <p className="mb-3 text-sm text-gray-500">A comment explaining the required changes is mandatory.</p>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setReturnFor(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={!note.trim()}
            onClick={async () => {
              await setStatus(returnFor, 'returned', note.trim())
              setReturnFor(null)
            }}
          >
            Return for Revision
          </button>
        </div>
      </Modal>

      {/* Add custom slot */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Document Slot">
        <form onSubmit={addSlot} className="space-y-4">
          <div>
            <label className="label">Slot Name *</label>
            <input className="input" value={newSlot.name} onChange={(e) => setNewSlot({ ...newSlot, name: e.target.value })} required placeholder="e.g. Attendance Evidence" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={newSlot.category} onChange={(e) => setNewSlot({ ...newSlot, category: e.target.value })}>
              {['Assessment', 'Learning Material', 'Examination', 'Moderation', 'Other'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={newSlot.restricted} onChange={(e) => setNewSlot({ ...newSlot, restricted: e.target.checked })} />
            Restricted (exam-paper confidentiality — files visible to reviewers &amp; uploader only)
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
            <button type="submit" disabled={busySlot === 'add'} className="btn-primary">Add Slot</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
