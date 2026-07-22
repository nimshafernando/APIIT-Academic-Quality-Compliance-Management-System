import {
  databases,
  storage,
  DB_ID,
  COL,
  BUCKET_ID,
  ID,
  Permission,
  Role,
  notify,
  notifyRole,
  listAll,
  Query,
  ENDPOINT,
  PROJECT_ID,
} from './appwrite'
import { ROLES, ROLE_LABELS, SCOPE_TYPES } from './roles'

export function parseStages(source) {
  try {
    return JSON.parse(source?.stagesJson || '[]')
  } catch {
    return []
  }
}

async function logAction(instanceId, user, action, stageIndex, stageLabel, comment = '') {
  await databases.createDocument(DB_ID, COL.WORKFLOW_ACTIONS, ID.unique(), {
    instanceId,
    userId: user.$id,
    userName: user.name,
    action,
    stageIndex,
    stageLabel,
    comment,
  })
}

async function uploadFiles(files) {
  const fileIds = []
  const fileNames = []
  for (const file of files) {
    const created = await storage.createFile(BUCKET_ID, ID.unique(), file, [Permission.read(Role.users())])
    fileIds.push(created.$id)
    fileNames.push(file.name)
  }
  return { fileIds, fileNames }
}

// ---- Stage → person resolution ---------------------------------------------
// Approval stages name a ROLE, but each submission must route to the specific
// person holding that role FOR THIS MODULE: the offering's Module Leader and
// Internal Verifier, the Level Coordinator assigned to the module's level, and
// the Moderator assigned to the module. HOD stages stay role-wide. The result
// is snapshotted onto the instance (approverIds/approverNames, aligned with
// stagesJson) so staffing changes don't reroute in-flight items. An empty
// entry means "any holder of the stage role" (legacy data / unstaffed stage).

async function loadActiveAssignments() {
  return listAll(COL.ROLE_ASSIGNMENTS, [Query.equal('active', true)])
}

export function resolveApprovers(stages, offering, assignments = []) {
  const scoped = (role, scopeType, scopeId) =>
    assignments.filter((a) => a.role === role && a.scopeType === scopeType && a.scopeId === scopeId && a.active !== false)

  const approverIds = []
  const approverNames = []
  for (const s of stages) {
    let people = [] // [{id, name}]
    if (s.role === ROLES.MODULE_LEADER && offering?.moduleLeaderId) {
      people = [{ id: offering.moduleLeaderId, name: offering.moduleLeaderName || 'Module Leader' }]
    } else if (s.role === ROLES.INTERNAL_VERIFIER) {
      if (offering?.internalVerifierId) {
        people = [{ id: offering.internalVerifierId, name: offering.internalVerifierName || 'Internal Verifier' }]
      } else if (offering?.moduleId) {
        people = scoped(ROLES.INTERNAL_VERIFIER, SCOPE_TYPES.MODULE, offering.moduleId).map((a) => ({ id: a.userId, name: a.userName }))
      }
    } else if (s.role === ROLES.LEVEL_COORDINATOR && offering?.levelId) {
      people = scoped(ROLES.LEVEL_COORDINATOR, SCOPE_TYPES.LEVEL, offering.levelId).map((a) => ({ id: a.userId, name: a.userName }))
    } else if (s.role === ROLES.MODERATOR && offering?.moduleId) {
      people = scoped(ROLES.MODERATOR, SCOPE_TYPES.MODULE, offering.moduleId).map((a) => ({ id: a.userId, name: a.userName }))
    }
    approverIds.push([...new Set(people.map((p) => p.id))].join(','))
    approverNames.push([...new Set(people.map((p) => p.name))].join(', '))
  }
  return { approverIds, approverNames }
}

// The userIds allowed to act on a given stage; empty array = any role holder.
export function stageApproverIds(instance, stageIndex) {
  const entry = instance.approverIds?.[stageIndex]
  return entry ? entry.split(',').filter(Boolean) : []
}

// Can this user approve/return the instance's CURRENT stage? Role membership
// is necessary; when the stage resolved to specific people, identity must
// match too. (HOD override is handled separately in the UI.)
export function canApproveStage(instance, user, roles) {
  if (instance.status !== 'in_progress') return false
  if (!roles.includes(instance.currentStageRole)) return false
  const assigned = stageApproverIds(instance, instance.currentStageIndex)
  return assigned.length === 0 || assigned.includes(user.$id)
}

async function notifyStage(instance, stageIndex, stages, type, message, fromName = '') {
  const assigned = stageApproverIds(instance, stageIndex)
  if (assigned.length) {
    await Promise.all(assigned.map((uid) => notify(uid, type, message, instance.$id, fromName)))
  } else {
    await notifyRole(stages[stageIndex].role, type, message, instance.$id, fromName)
  }
}

// Create a workflow instance from a template + subject, with evidence files.
// `offering` (the module offering being submitted against) drives approver
// resolution and carries programme/semester context onto the instance.
export async function submitWorkflow({ template, subject, offering, title, files, user }) {
  const stages = parseStages(template)
  if (!stages.length) throw new Error('This template has no approval stages configured.')

  const assignments = await loadActiveAssignments()
  const { approverIds, approverNames } = resolveApprovers(stages, offering, assignments)

  const { fileIds, fileNames } = await uploadFiles(files)

  // Browsers may only grant permissions to their own identity — approver
  // roles have collection-level update permission (server-enforced labels),
  // and the submitter grants themself update for resubmission.
  const permissions = [Permission.read(Role.users()), Permission.update(Role.user(user.$id))]

  const instance = await databases.createDocument(
    DB_ID,
    COL.WORKFLOW_INSTANCES,
    ID.unique(),
    {
      templateId: template.$id,
      templateName: template.name,
      stagesJson: template.stagesJson, // snapshot — template edits don't affect in-flight items
      subjectId: subject.$id,
      subjectName: subject.name,
      moduleId: subject.moduleId || '',
      moduleCode: subject.moduleCode || '',
      moduleName: subject.moduleName || '',
      levelId: subject.levelId || '',
      levelName: subject.levelName || '',
      title,
      currentStageIndex: 0,
      currentStageRole: stages[0].role,
      currentStageLabel: stages[0].label || ROLE_LABELS[stages[0].role],
      status: 'in_progress',
      submittedBy: user.$id,
      submittedByName: user.name,
      fileIds,
      fileNames,
      approverIds,
      approverNames,
      offeringId: offering?.$id || '',
      programmeId: offering?.programmeId || '',
      programmeName: offering?.programmeName || '',
      semesterId: offering?.semesterId || '',
      semesterName: offering?.semesterName || '',
      batchCode: offering?.batchCode || '',
    },
    permissions,
  )

  await logAction(instance.$id, user, 'submit', 0, 'Submission', title)
  await notifyStage(
    instance,
    0,
    stages,
    'approval_pending',
    `"${title}" (${subject.moduleCode || ''} ${subject.name}) is awaiting your ${stages[0].label || 'approval'}.`,
    user.name,
  )
  return instance
}

// Approve the current stage; advances the chain or completes the workflow.
export async function approveStage(instance, user, comment = '') {
  const stages = parseStages(instance)
  const idx = instance.currentStageIndex
  const nextIdx = idx + 1
  const isFinal = nextIdx >= stages.length

  await databases.updateDocument(DB_ID, COL.WORKFLOW_INSTANCES, instance.$id, {
    status: isFinal ? 'approved' : 'in_progress',
    currentStageIndex: isFinal ? idx : nextIdx,
    currentStageRole: isFinal ? '' : stages[nextIdx].role,
    currentStageLabel: isFinal ? 'Completed' : stages[nextIdx].label || ROLE_LABELS[stages[nextIdx].role],
  })
  await logAction(instance.$id, user, 'approve', idx, stages[idx]?.label || `Stage ${idx + 1}`, comment)

  if (isFinal) {
    await notify(instance.submittedBy, 'approved', `"${instance.title}" has received final sign-off. The record is now locked.`, instance.$id, user.name)
  } else {
    await notifyStage(
      instance,
      nextIdx,
      stages,
      'approval_pending',
      `"${instance.title}" (${instance.moduleCode}) is awaiting your ${stages[nextIdx].label || 'approval'}.`,
      user.name,
    )
    await notify(instance.submittedBy, 'stage_approved', `"${instance.title}" passed ${stages[idx]?.label || 'a stage'} and moved to ${stages[nextIdx].label || ROLE_LABELS[stages[nextIdx].role]}.`, instance.$id, user.name)
  }
}

// Return to the submitter with a mandatory comment (SRS WF-03).
export async function returnForRevision(instance, user, comment) {
  if (!comment?.trim()) throw new Error('A comment is required when returning a submission for revision.')
  const stages = parseStages(instance)
  const idx = instance.currentStageIndex

  await databases.updateDocument(DB_ID, COL.WORKFLOW_INSTANCES, instance.$id, { status: 'returned' })
  await logAction(instance.$id, user, 'return', idx, stages[idx]?.label || `Stage ${idx + 1}`, comment)
  await notify(instance.submittedBy, 'returned', `"${instance.title}" was returned for revision by ${user.name}: ${comment}`, instance.$id, user.name)
}

// Submitter resubmits a returned item (optionally attaching revised files);
// it re-enters the chain at the stage that returned it.
export async function resubmitWorkflow(instance, user, comment = '', newFiles = []) {
  let filePatch = {}
  if (newFiles.length) {
    const { fileIds, fileNames } = await uploadFiles(newFiles)
    filePatch = {
      fileIds: [...(instance.fileIds || []), ...fileIds],
      fileNames: [...(instance.fileNames || []), ...fileNames],
    }
  }
  await databases.updateDocument(DB_ID, COL.WORKFLOW_INSTANCES, instance.$id, { status: 'in_progress', ...filePatch })
  await logAction(instance.$id, user, 'resubmit', instance.currentStageIndex, 'Resubmission', comment)
  const stages = parseStages(instance)
  await notifyStage(
    instance,
    instance.currentStageIndex,
    stages,
    'approval_pending',
    `"${instance.title}" (${instance.moduleCode}) was resubmitted and is awaiting your review.`,
    user.name,
  )
}

// The SPA and the Appwrite API live on different domains, so browsers that
// block third-party cookies never store the session cookie — a plain <a href>
// to the storage endpoint then arrives unauthenticated and Appwrite masks it
// as a 404. Fetch with the SDK's fallback credentials and serve a blob instead.
async function fetchFileBlob(fileId) {
  const headers = { 'X-Appwrite-Project': PROJECT_ID }
  const fallback = window.localStorage.getItem('cookieFallback')
  if (fallback && fallback !== '{}' && fallback !== '[]') headers['X-Fallback-Cookies'] = fallback
  const res = await fetch(`${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view`, {
    headers,
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message || `Could not load the file (HTTP ${res.status})`)
  }
  return res.blob()
}

export async function viewFile(fileId) {
  // Open the tab synchronously so popup blockers tie it to the user's click.
  const win = window.open('', '_blank')
  try {
    const blob = await fetchFileBlob(fileId)
    win.location = URL.createObjectURL(blob)
  } catch (err) {
    win?.close()
    window.alert(err.message)
  }
}

export async function downloadFile(fileId, fileName = 'download') {
  try {
    const blob = await fetchFileBlob(fileId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (err) {
    window.alert(err.message)
  }
}
