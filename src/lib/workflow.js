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
} from './appwrite'
import { ROLES, ROLE_LABELS } from './roles'

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

// Create a workflow instance from a template + subject, with evidence files.
export async function submitWorkflow({ template, subject, title, files, user }) {
  const stages = parseStages(template)
  if (!stages.length) throw new Error('This template has no approval stages configured.')

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
    },
    permissions,
  )

  await logAction(instance.$id, user, 'submit', 0, 'Submission', title)
  await notifyRole(
    stages[0].role,
    'approval_pending',
    `"${title}" (${subject.moduleCode || ''} ${subject.name}) is awaiting your ${stages[0].label || 'approval'}.`,
    instance.$id,
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
    await notify(instance.submittedBy, 'approved', `"${instance.title}" has received final sign-off. The record is now locked.`, instance.$id)
  } else {
    await notifyRole(
      stages[nextIdx].role,
      'approval_pending',
      `"${instance.title}" (${instance.moduleCode}) is awaiting your ${stages[nextIdx].label || 'approval'}.`,
      instance.$id,
    )
    await notify(instance.submittedBy, 'stage_approved', `"${instance.title}" passed ${stages[idx]?.label || 'a stage'} and moved to ${stages[nextIdx].label || ROLE_LABELS[stages[nextIdx].role]}.`, instance.$id)
  }
}

// Return to the submitter with a mandatory comment (SRS WF-03).
export async function returnForRevision(instance, user, comment) {
  if (!comment?.trim()) throw new Error('A comment is required when returning a submission for revision.')
  const stages = parseStages(instance)
  const idx = instance.currentStageIndex

  await databases.updateDocument(DB_ID, COL.WORKFLOW_INSTANCES, instance.$id, { status: 'returned' })
  await logAction(instance.$id, user, 'return', idx, stages[idx]?.label || `Stage ${idx + 1}`, comment)
  await notify(instance.submittedBy, 'returned', `"${instance.title}" was returned for revision by ${user.name}: ${comment}`, instance.$id)
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
  await notifyRole(
    instance.currentStageRole,
    'approval_pending',
    `"${instance.title}" (${instance.moduleCode}) was resubmitted and is awaiting your review.`,
    instance.$id,
  )
}

export function fileViewUrl(fileId) {
  return storage.getFileView(BUCKET_ID, fileId)
}

export function fileDownloadUrl(fileId) {
  return storage.getFileDownload(BUCKET_ID, fileId)
}
