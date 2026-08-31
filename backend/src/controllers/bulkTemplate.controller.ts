import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const TEMPLATES: Record<string, { filename: string; headers: string[]; sample: string[][] }> = {
  students: {
    filename: 'student_upload_template.csv',
    headers: ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender', 'className', 'sectionName', 'rollNumber', 'admissionNumber', 'academicYear', 'fatherName', 'motherName', 'guardianPhone', 'guardianEmail', 'address', 'city', 'state', 'pincode'],
    sample: [['Rahul', 'Sharma', 'rahul@example.com', '9876543210', '2012-05-15', 'male', 'Class 5', 'A', '101', 'ADM-2026-001', '2025-2026', 'Mr Sharma', 'Mrs Sharma', '9876543211', 'parent@example.com', '123 Main St', 'Bangalore', 'Karnataka', '560001']],
  },
  teachers: {
    filename: 'teacher_upload_template.csv',
    headers: ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'designation', 'department', 'qualification', 'experienceYears', 'dateOfJoining', 'specialization'],
    sample: [['Priya', 'Verma', 'priya@school.com', '9876500001', '1990-03-20', 'Senior Teacher', 'Science', 'B.Ed', '5', '2024-06-01', 'Physics']],
  },
  parents: {
    filename: 'parent_upload_template.csv',
    headers: ['firstName', 'lastName', 'email', 'phone', 'studentAdmissionNumber', 'relation'],
    sample: [['Raj', 'Sharma', 'raj@example.com', '9876543210', 'ADM-2026-001', 'father']],
  },
  subjects: {
    filename: 'subject_upload_template.csv',
    headers: ['name', 'code', 'description', 'isElective'],
    sample: [['Mathematics', 'MATH', 'Core subject', 'false']],
  },
  fees: {
    filename: 'fee_upload_template.csv',
    headers: ['studentAdmissionNumber', 'feeStructureName', 'amount', 'dueDate', 'remarks'],
    sample: [['ADM-2026-001', 'Monthly Tuition', '5000', '2026-07-10', 'July fee']],
  },
  marks: {
    filename: 'marks_upload_template.csv',
    headers: ['examName', 'studentAdmissionNumber', 'subjectCode', 'marksObtained', 'grade'],
    sample: [['Mid-Term 2026', 'ADM-2026-001', 'MATH', '85', 'A']],
  },
  attendance: {
    filename: 'attendance_upload_template.csv',
    headers: ['date', 'studentAdmissionNumber', 'status', 'remarks'],
    sample: [['2026-06-28', 'ADM-2026-001', 'present', '']],
  },
};

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

export async function downloadBulkTemplate(req: AuthenticatedRequest, res: Response) {
  const type = req.params.type as string;
  const template = TEMPLATES[type];
  if (!template) {
    return res.status(400).json({ error: 'Unknown template type. Use: students, teachers, parents, subjects, fees, marks, attendance' });
  }
  const csv = toCsv(template.headers, template.sample);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
  return res.send(csv);
}

export { TEMPLATES };
