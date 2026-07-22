import { COL } from './appwrite'

// Declarative config for every academic-structure entity. StructurePage.jsx
// renders the table, forms, and denormalised name fields from this.
//
// field types: text | number | date | select | multiselect
//   select/multiselect: ref = { collection, labelKey | labelFn, valueKey ($id default) }
//   denorm: { targetField: sourceKeyOnSelectedDoc } — copied on save so lists
//   never need client-side joins.
// superAdminOnly: core taxonomy only Super Admin may edit; the rest is
// delegable to Academic Administrators (SRS ADM-06 / STR-06).

export const STRUCTURE_ENTITIES = {
  'academic-years': {
    collection: COL.ACADEMIC_YEARS,
    title: 'Academic Years',
    singular: 'Academic Year',
    superAdminOnly: true,
    fields: [
      { key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. 2026/27' },
      { key: 'startDate', label: 'Start Date', type: 'date', required: true },
      { key: 'endDate', label: 'End Date', type: 'date', required: true },
    ],
    columns: [
      { key: 'label', label: 'Label' },
      { key: 'startDate', label: 'Start', type: 'date' },
      { key: 'endDate', label: 'End', type: 'date' },
    ],
  },

  programmes: {
    collection: COL.PROGRAMMES,
    title: 'Programmes / Degrees',
    singular: 'Programme',
    superAdminOnly: true,
    fields: [
      { key: 'name', label: 'Programme Name', type: 'text', required: true, placeholder: 'e.g. BSc (Hons) Software Engineering' },
      { key: 'awardingBody', label: 'Awarding Body / Partner', type: 'text', required: true, placeholder: 'e.g. University of Staffordshire / NCUK' },
      { key: 'degreeType', label: 'Degree Type', type: 'text', placeholder: 'e.g. Undergraduate' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'awardingBody', label: 'Awarding Body' },
      { key: 'degreeType', label: 'Type' },
    ],
  },

  levels: {
    collection: COL.LEVELS,
    title: 'Levels',
    singular: 'Level',
    superAdminOnly: true,
    fields: [
      { key: 'name', label: 'Level Name', type: 'text', required: true, placeholder: 'e.g. Level 5 / Foundation' },
      {
        key: 'programmeId', label: 'Programme', type: 'select', required: true,
        ref: { collection: COL.PROGRAMMES, labelKey: 'name' },
        denorm: { programmeName: 'name' },
      },
    ],
    columns: [
      { key: 'name', label: 'Level' },
      { key: 'programmeName', label: 'Programme' },
    ],
  },

  semesters: {
    collection: COL.SEMESTERS,
    title: 'Semesters',
    singular: 'Semester',
    superAdminOnly: true,
    fields: [
      { key: 'name', label: 'Semester Name', type: 'text', required: true, placeholder: 'e.g. Semester 1' },
      {
        key: 'academicYearId', label: 'Academic Year', type: 'select', required: true,
        ref: { collection: COL.ACADEMIC_YEARS, labelKey: 'label' },
        denorm: { academicYearLabel: 'label' },
      },
      { key: 'startDate', label: 'Start Date', type: 'date', required: true },
      { key: 'endDate', label: 'End Date', type: 'date', required: true },
    ],
    columns: [
      { key: 'name', label: 'Semester' },
      { key: 'academicYearLabel', label: 'Academic Year' },
      { key: 'startDate', label: 'Start', type: 'date' },
      { key: 'endDate', label: 'End', type: 'date' },
    ],
  },

  intakes: {
    collection: COL.INTAKES,
    title: 'Intakes / Batches',
    singular: 'Intake / Batch',
    fields: [
      { key: 'batchCode', label: 'Batch Code', type: 'text', required: true, placeholder: 'e.g. SE-2026-SEP' },
      {
        key: 'programmeId', label: 'Programme', type: 'select', required: true,
        ref: { collection: COL.PROGRAMMES, labelKey: 'name' },
        denorm: { programmeName: 'name' },
      },
      {
        key: 'academicYearId', label: 'Academic Year', type: 'select', required: true,
        ref: { collection: COL.ACADEMIC_YEARS, labelKey: 'label' },
        denorm: { academicYearLabel: 'label' },
      },
      {
        key: 'semesterId', label: 'Entry Semester', type: 'select', required: true,
        ref: { collection: COL.SEMESTERS, labelKey: 'name' },
        denorm: { semesterName: 'name' },
      },
      { key: 'cohortSize', label: 'Cohort Size', type: 'number' },
    ],
    columns: [
      { key: 'batchCode', label: 'Batch' },
      { key: 'programmeName', label: 'Programme' },
      { key: 'academicYearLabel', label: 'Year' },
      { key: 'semesterName', label: 'Entry Semester' },
      { key: 'cohortSize', label: 'Cohort' },
    ],
  },

  modules: {
    collection: COL.MODULES,
    title: 'Modules',
    singular: 'Module',
    fields: [
      { key: 'code', label: 'Module Code', type: 'text', required: true, placeholder: 'e.g. COM2521' },
      { key: 'name', label: 'Module Name', type: 'text', required: true, placeholder: 'e.g. Cloud Infrastructure & Design' },
      {
        key: 'programmeId', label: 'Programme', type: 'select', required: true,
        ref: { collection: COL.PROGRAMMES, labelKey: 'name' },
        denorm: { programmeName: 'name' },
      },
      {
        key: 'levelId', label: 'Level', type: 'select', required: true,
        ref: { collection: COL.LEVELS, labelFn: (d) => `${d.name} — ${d.programmeName}` },
        denorm: { levelName: 'name' },
      },
      { key: 'variant', label: 'Delivery Variant', type: 'text', placeholder: 'e.g. Local / NCUK / Weekend' },
    ],
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Module' },
      { key: 'programmeName', label: 'Programme' },
      { key: 'levelName', label: 'Level' },
      { key: 'variant', label: 'Variant' },
    ],
  },

  offerings: {
    collection: COL.MODULE_OFFERINGS,
    title: 'Module Offerings',
    singular: 'Module Offering',
    description: 'A module instance delivered to a batch in a semester, with its assigned staff.',
    fields: [
      {
        key: 'moduleId', label: 'Module', type: 'select', required: true,
        ref: { collection: COL.MODULES, labelFn: (d) => `${d.code} — ${d.name}` },
        denorm: { moduleCode: 'code', moduleName: 'name', levelId: 'levelId', levelName: 'levelName' },
      },
      {
        key: 'intakeId', label: 'Intake / Batch', type: 'select', required: true,
        ref: { collection: COL.INTAKES, labelKey: 'batchCode' },
        denorm: { batchCode: 'batchCode' },
      },
      {
        key: 'semesterId', label: 'Semester', type: 'select', required: true,
        ref: { collection: COL.SEMESTERS, labelFn: (d) => `${d.name} — ${d.academicYearLabel}` },
        denorm: { semesterName: 'name' },
      },
      {
        key: 'moduleLeaderId', label: 'Module Leader', type: 'select', required: true,
        ref: { collection: COL.PROFILES, labelKey: 'name', valueKey: 'userId' },
        denorm: { moduleLeaderName: 'name' },
      },
      {
        key: 'lecturerIds', label: 'Lecturer(s)', type: 'multiselect', required: true,
        ref: { collection: COL.PROFILES, labelKey: 'name', valueKey: 'userId' },
        denormArray: { lecturerNames: 'name' },
      },
      {
        key: 'internalVerifierId', label: 'Internal Verifier', type: 'select',
        ref: { collection: COL.PROFILES, labelKey: 'name', valueKey: 'userId' },
        denorm: { internalVerifierName: 'name' },
      },
    ],
    columns: [
      { key: 'moduleCode', label: 'Module' },
      { key: 'batchCode', label: 'Batch' },
      { key: 'semesterName', label: 'Semester' },
      { key: 'moduleLeaderName', label: 'Module Leader' },
      { key: 'lecturerNames', label: 'Lecturers', type: 'array' },
      { key: 'internalVerifierName', label: 'Internal Verifier' },
    ],
  },

  subjects: {
    collection: COL.SUBJECTS,
    title: 'Subjects / Components',
    singular: 'Subject / Component',
    fields: [
      { key: 'name', label: 'Subject / Component Name', type: 'text', required: true, placeholder: 'e.g. Web Development' },
      {
        key: 'moduleId', label: 'Module', type: 'select', required: true,
        ref: { collection: COL.MODULES, labelFn: (d) => `${d.code} — ${d.name}` },
        denorm: { moduleCode: 'code', moduleName: 'name', levelId: 'levelId', levelName: 'levelName' },
      },
      {
        key: 'category', label: 'Category', type: 'select', required: true,
        options: ['Assessment', 'Learning Material', 'Moderation', 'Examination', 'Other'],
      },
    ],
    columns: [
      { key: 'name', label: 'Subject' },
      { key: 'moduleCode', label: 'Module' },
      { key: 'levelName', label: 'Level' },
      { key: 'category', label: 'Category' },
    ],
  },
}
