import { useEffect, useState } from 'react'
import { COL, listAll, Query } from '../../lib/appwrite'
import { APPROVER_ROLES, ROLES, SCOPE_TYPES } from '../../lib/roles'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner } from '../../components/UI'
import InstanceTable from './InstanceTable'

// Items waiting on one of MY approver roles, filtered to my assignment scope.
// Instances submitted since per-module routing carry a resolved approver
// snapshot (approverIds per stage) — those are matched on identity. Older
// instances fall back to the role+scope heuristics:
//  - HOD sees everything at an HOD stage
//  - Module Leader: instances for modules on offerings they lead
//  - Level Coordinator: instances within their assigned level(s)
//  - Internal Verifier / Moderator: instances for their assigned modules/cycles
export async function loadApprovalsQueue(user, roles, assignments) {
  const myApproverRoles = roles.filter((r) => APPROVER_ROLES.includes(r))
  if (!myApproverRoles.length) return []

  const results = await listAll(COL.WORKFLOW_INSTANCES, [
    Query.equal('status', 'in_progress'),
    Query.equal('currentStageRole', myApproverRoles),
    Query.orderDesc('$updatedAt'),
  ])

  // Scope filtering per role
  let ledModuleIds = null
  if (myApproverRoles.includes(ROLES.MODULE_LEADER)) {
    const offerings = await listAll(COL.MODULE_OFFERINGS, [Query.equal('moduleLeaderId', user.$id)])
    ledModuleIds = new Set(offerings.map((o) => o.moduleId))
  }
  const scopedLevelIds = new Set(
    assignments.filter((a) => a.scopeType === SCOPE_TYPES.LEVEL && a.scopeId).map((a) => a.scopeId),
  )
  const scopedModuleIds = new Set(
    assignments.filter((a) => a.scopeType === SCOPE_TYPES.MODULE && a.scopeId).map((a) => a.scopeId),
  )

  return results.filter((inst) => {
    const stageRole = inst.currentStageRole
    if (!roles.includes(stageRole)) return false
    // Resolved-approver snapshot wins: only the assigned person sees it.
    const assigned = inst.approverIds?.[inst.currentStageIndex]
    if (assigned) return assigned.split(',').includes(user.$id)
    if (stageRole === ROLES.HOD) return true
    if (stageRole === ROLES.MODULE_LEADER) {
      // If they lead specific offerings, scope to those modules; otherwise show all ML-stage items.
      return !ledModuleIds || ledModuleIds.size === 0 || ledModuleIds.has(inst.moduleId)
    }
    if (stageRole === ROLES.LEVEL_COORDINATOR) {
      return scopedLevelIds.size === 0 || scopedLevelIds.has(inst.levelId)
    }
    // Internal Verifier / Moderator: module-scoped assignments when present.
    return scopedModuleIds.size === 0 || scopedModuleIds.has(inst.moduleId)
  })
}

export default function ApprovalsQueue() {
  const { user, roles, assignments } = useAuth()
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        setInstances(await loadApprovalsQueue(user, roles, assignments))
      } catch (err) {
        setError(err?.message || 'Failed to load approvals queue.')
      } finally {
        setLoading(false)
      }
    })()
  }, [user.$id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="Approvals Queue"
        subtitle="Submissions currently waiting on your approval. Open one to approve or return it."
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {loading ? (
        <Spinner />
      ) : instances.length === 0 ? (
        <EmptyState title="Nothing waiting on you" message="You're all caught up — no submissions are at your approval stage." />
      ) : (
        <InstanceTable instances={instances} showSubmitter />
      )}
    </div>
  )
}
