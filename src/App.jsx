import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import { ROLES } from './lib/roles'

import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard from './pages/Dashboard'
import Notifications from './pages/Notifications'
import StructurePage from './pages/structure/StructurePage'
import Templates from './pages/workflows/Templates'
import NewSubmission from './pages/workflows/NewSubmission'
import MySubmissions from './pages/workflows/MySubmissions'
import ApprovalsQueue from './pages/workflows/ApprovalsQueue'
import InstanceDetail from './pages/workflows/InstanceDetail'
import Users from './pages/admin/Users'
import MyTasks from './pages/tasks/MyTasks'
import DeadlineRules from './pages/tasks/DeadlineRules'
import SubjectFiles from './pages/subjectfiles/SubjectFiles'
import SubjectFileDetail from './pages/subjectfiles/SubjectFileDetail'
import Cases from './pages/cases/Cases'
import Governance from './pages/governance/Governance'
import Appraisals from './pages/appraisals/Appraisals'
import Reports from './pages/reports/Reports'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/subject-files" element={<SubjectFiles />} />
            <Route path="/subject-files/:subjectId" element={<SubjectFileDetail />} />
            <Route
              path="/cases"
              element={
                <ProtectedRoute roles={[ROLES.LECTURER, ROLES.MODULE_LEADER, ROLES.LEVEL_COORDINATOR, ROLES.HOD]}>
                  <Cases />
                </ProtectedRoute>
              }
            />
            <Route path="/appraisals" element={<Appraisals />} />
            <Route
              path="/governance"
              element={
                <ProtectedRoute roles={[ROLES.HOD]}>
                  <Governance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute roles={[ROLES.HOD, ROLES.SUPER_ADMIN]}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/deadline-rules"
              element={
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN, ROLES.HOD]}>
                  <DeadlineRules />
                </ProtectedRoute>
              }
            />

            <Route path="/workflows/mine" element={<MySubmissions />} />
            <Route path="/workflows/new" element={<NewSubmission />} />
            <Route path="/workflows/approvals" element={<ApprovalsQueue />} />
            <Route
              path="/workflows/templates"
              element={
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
                  <Templates />
                </ProtectedRoute>
              }
            />
            <Route path="/workflows/:id" element={<InstanceDetail />} />

            <Route
              path="/structure/:entity"
              element={
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN, ROLES.ACADEMIC_ADMIN, ROLES.HOD]}>
                  <StructurePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/users"
              element={
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
                  <Users />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
