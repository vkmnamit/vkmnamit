import { Response } from 'express';
import { createStudent } from '../controllers/student.controller';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { clearCache } from '../middleware/cache.middleware';

/** Business-action adapter used by AI tools. The AI never talks to SQL. */
export async function createStudentAdmission(params: {
  schoolId: string;
  adminId: string;
  payload: Record<string, unknown>;
}) {
  let result: { status: number; body: any } | undefined;
  const response = {
    status(code: number) {
      return {
        json(body: any) {
          result = { status: code, body };
          return this;
        },
      };
    },
    json(body: any) {
      result = { status: 200, body };
      return this;
    },
  } as unknown as Response;

  await createStudent({
    body: params.payload,
    user: { id: params.adminId, school_id: params.schoolId, role: 'admin', email: '', auth_id: params.adminId },
  } as AuthenticatedRequest, response);

  if (!result) throw new Error('The student admission workflow did not return a result.');
  if (result.status >= 400) throw new Error(result.body?.error || 'Student admission failed.');
  clearCache(params.schoolId);
  return result.body;
}
