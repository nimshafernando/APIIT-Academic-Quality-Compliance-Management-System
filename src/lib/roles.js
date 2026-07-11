// Role identifiers — stored as Appwrite user labels (server-set, tamper-proof)
// and referenced in workflow template stages and role_assignments.
// NOTE: values must be alphanumeric only — Appwrite label identifiers do not
// allow underscores or other special characters.
export const ROLES = {
  SUPER_ADMIN: 'superadmin',
  ACADEMIC_ADMIN: 'academicadmin',
  HOD: 'hod',
  LEVEL_COORDINATOR: 'levelcoord',
  MODULE_LEADER: 'moduleleader',
  INTERNAL_VERIFIER: 'verifier',
  MODERATOR: 'moderator',
  LECTURER: 'lecturer',
}

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.ACADEMIC_ADMIN]: 'Academic Administrator',
  [ROLES.HOD]: 'Head of School (HOD)',
  [ROLES.LEVEL_COORDINATOR]: 'Level Coordinator',
  [ROLES.MODULE_LEADER]: 'Module Leader',
  [ROLES.INTERNAL_VERIFIER]: 'Internal Verifier',
  [ROLES.MODERATOR]: 'Moderator',
  [ROLES.LECTURER]: 'Lecturer',
}

// Roles that can appear as an approval stage in a workflow template
export const APPROVER_ROLES = [
  ROLES.INTERNAL_VERIFIER,
  ROLES.MODULE_LEADER,
  ROLES.LEVEL_COORDINATOR,
  ROLES.MODERATOR,
  ROLES.HOD,
]

// Scope types available when assigning a role to a user
export const SCOPE_TYPES = {
  GLOBAL: 'global',
  PROGRAMME: 'programme',
  LEVEL: 'level',
  MODULE: 'module',
  OFFERING: 'offering',
  CYCLE: 'cycle',
}

export const SCOPE_TYPE_LABELS = {
  [SCOPE_TYPES.GLOBAL]: 'Global (school-wide)',
  [SCOPE_TYPES.PROGRAMME]: 'Programme',
  [SCOPE_TYPES.LEVEL]: 'Level',
  [SCOPE_TYPES.MODULE]: 'Module',
  [SCOPE_TYPES.OFFERING]: 'Module Offering',
  [SCOPE_TYPES.CYCLE]: 'Cycle (e.g. moderation cycle)',
}

// Roles allowed to manage academic structure records
export const STRUCTURE_ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACADEMIC_ADMIN]
