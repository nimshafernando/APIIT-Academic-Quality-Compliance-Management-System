import { Link } from 'react-router-dom'
import { fmtDateTime } from '../../lib/appwrite'
import { Table, StatusBadge, Avatar } from '../../components/UI'

// Shared list rendering for workflow instances (used by My Submissions,
// Approvals Queue, and dashboard drill-downs).
export default function InstanceTable({ instances, showSubmitter = false }) {
  return (
    <Table headers={['Submission', 'Module / Subject', ...(showSubmitter ? ['Submitted By'] : []), 'Waiting On', 'Status', 'Updated']}>
      {instances.map((inst) => (
        <tr key={inst.$id} className="transition-colors hover:bg-brand-tealLight/30">
          <td className="td">
            <Link to={`/workflows/${inst.$id}`} className="font-bold text-gray-900 transition-colors hover:text-brand-tealDark">
              {inst.title}
            </Link>
            <p className="mt-0.5 text-xs text-gray-400">{inst.templateName}</p>
          </td>
          <td className="td">
            <span className="chip bg-gray-100 font-mono text-[11px] text-gray-600">{inst.moduleCode}</span>
            <p className="mt-1 text-xs text-gray-500">{inst.subjectName}</p>
          </td>
          {showSubmitter && (
            <td className="td">
              <span className="flex items-center gap-2">
                <Avatar name={inst.submittedByName} className="h-7 w-7 text-[10px]" />
                <span className="text-[13px]">{inst.submittedByName?.replace(/\(.*?\)/g, '').trim()}</span>
              </span>
            </td>
          )}
          <td className="td">
            {inst.status === 'approved' ? (
              <span className="text-xs text-gray-300">—</span>
            ) : inst.status === 'returned' ? (
              <span className="text-xs font-bold text-amber-600">Submitter (revision)</span>
            ) : (
              <span className="text-xs font-bold text-gray-700">{inst.currentStageLabel}</span>
            )}
          </td>
          <td className="td">
            <StatusBadge status={inst.status} />
          </td>
          <td className="td text-xs text-gray-400">{fmtDateTime(inst.$updatedAt)}</td>
        </tr>
      ))}
    </Table>
  )
}
