type ConfirmationRequirement = 'none' | 'explicit';

export interface AIToolDefinition {
  name: string;
  description: string;
  roles: string[];
  confirmation: ConfirmationRequirement;
  audit: boolean;
  scope: string;
  output: string;
  parameters: Record<string, unknown>;
}

const tools: AIToolDefinition[] = [
  {
    name: 'search_school_knowledge',
    description: 'Search school-approved policies, circulars, holiday calendars, FAQs, and user manuals. Read-only.',
    roles: ['admin', 'teacher', 'parent', 'student'], confirmation: 'none', audit: true, scope: 'current school', output: 'Matching school knowledge excerpts',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'The knowledge question to search for.' } }, required: ['query'] },
  },
  {
    name: 'get_school_sections',
    description: 'List classes and sections in the caller’s authorized scope.',
    roles: ['admin', 'teacher'], confirmation: 'none', audit: true, scope: 'school for admin; assigned classes for teacher', output: 'Authorized classes and sections',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'prepare_section_creation',
    description: 'Validate a new section for an existing class and prepare a preview. Use className and sectionName, never an internal ID.',
    roles: ['admin'], confirmation: 'explicit', audit: true, scope: 'current school', output: 'New-section preview awaiting confirmation',
    parameters: { type: 'object', properties: { className: { type: 'string' }, sectionName: { type: 'string' }, capacity: { type: 'number' } }, required: ['className', 'sectionName'] },
  },
  {
    name: 'confirm_section_creation',
    description: 'Create the previously previewed section only after the administrator explicitly confirms.',
    roles: ['admin'], confirmation: 'explicit', audit: true, scope: 'same pending school section', output: 'Created section',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'prepare_timetable_generation',
    description: 'Generate a non-persistent timetable preview for an authorized class section.',
    roles: ['admin', 'teacher'], confirmation: 'explicit', audit: true, scope: 'school for admin; assigned sections for teacher', output: 'Preview slot count and pending confirmation',
    parameters: { type: 'object', properties: { sectionId: { type: 'string', description: 'The authorized section UUID.' } }, required: ['sectionId'] },
  },
  {
    name: 'confirm_timetable_generation',
    description: 'Save the previously previewed timetable after the user explicitly confirms it.',
    roles: ['admin', 'teacher'], confirmation: 'explicit', audit: true, scope: 'same pending authorized timetable', output: 'Saved timetable slot count',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'predict_fee_defaults',
    description: 'Analyze likely fee defaults across the school. Read-only.',
    roles: ['admin'], confirmation: 'none', audit: true, scope: 'current school', output: 'Fee-default risk list',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_pending_fee_dues',
    description: 'List students with unpaid or overdue fees, including each student’s total outstanding amount. This is a factual dues report, not a payment-risk prediction.',
    roles: ['admin'], confirmation: 'none', audit: true, scope: 'current school', output: 'Student names, class sections, outstanding amounts, and total pending dues',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_my_academic_summary',
    description: 'Get only the caller’s own academic summary or their linked children’s summaries. Read-only.',
    roles: ['parent', 'student'], confirmation: 'none', audit: true, scope: 'own record or linked children only', output: 'Authorized academic summary',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'prepare_student_admission',
    description: 'Validate and preview a student admission. Use the human-readable className and sectionName whenever possible; never ask the user for an internal ID. It never creates a record.',
    roles: ['admin'], confirmation: 'explicit', audit: true, scope: 'current school', output: 'Admission preview and pending confirmation',
    parameters: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, className: { type: 'string', description: 'For example: Class 10 or Grade 6.' }, sectionName: { type: 'string', description: 'For example: A.' }, sectionId: { type: 'string', description: 'Optional internal ID when already supplied by another tool.' }, dateOfBirth: { type: 'string', description: 'YYYY-MM-DD' }, gender: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, fatherName: { type: 'string' }, motherName: { type: 'string' }, guardianPhone: { type: 'string' }, guardianEmail: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, pincode: { type: 'string' }, rollNumber: { type: 'number' }, academicYearId: { type: 'string' } }, required: ['firstName', 'lastName', 'dateOfBirth'] },
  },
  {
    name: 'plan_student_admission_workflow',
    description: 'Create an explainable, non-executing plan for a student admission and its dependent steps.',
    roles: ['admin'], confirmation: 'none', audit: true, scope: 'current school', output: 'Admission plan with ordered steps and confirmation requirements',
    parameters: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, className: { type: 'string' }, sectionName: { type: 'string' }, sectionId: { type: 'string' }, createParent: { type: 'boolean' }, generateAdmissionFee: { type: 'boolean' } }, required: ['firstName', 'lastName'] },
  },
  {
    name: 'confirm_student_admission',
    description: 'Create the current user’s most recently previewed student admission after explicit confirmation. Never pass or ask for an internal confirmation ID.',
    roles: ['admin'], confirmation: 'explicit', audit: true, scope: 'same pending school admission', output: 'Created student admission',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

export function getToolsForRole(role: string) {
  return tools
    .filter((tool) => tool.roles.includes(role))
    .map((tool) => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

export function validateToolInput(toolName: string, input: Record<string, unknown>) {
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) return { valid: false, error: 'This operation is not registered.' };
  const required = Array.isArray((tool.parameters as any).required) ? (tool.parameters as any).required as string[] : [];
  const missing = required.filter((field) => {
    const value = input[field];
    return value === undefined || value === null || (typeof value === 'string' && !value.trim());
  });
  return missing.length ? { valid: false, error: `Missing required information: ${missing.join(', ')}.` } : { valid: true as const };
}

export function getToolPolicyDocumentation(role: string) {
  return tools
    .filter((tool) => tool.roles.includes(role))
    .map((tool) => `${tool.name}: scope=${tool.scope}; confirmation=${tool.confirmation}; audit=${tool.audit ? 'required' : 'not required'}; output=${tool.output}`)
    .join('\n');
}
