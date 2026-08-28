const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// Global in-memory cache for API requests
const apiCache = new Map<string, { data: any, timestamp: number }>();

// #4 OPTIMIZATION: Per-endpoint cache TTL (in ms)
const ENDPOINT_TTL: Array<[string, number]> = [
  ['notifications/count', 15_000],    // Bell badge — 15s: must feel live
  ['my-notifications', 15_000],    // Notification list — 15s
  ['fee-payments', 30_000],    // Fee ledger — 30s: needs to feel live
  ['/fees', 30_000],    // Fee stats
  ['dashboard-stats', 120_000],    // Admin/teacher dashboard — 2min
  ['student/dashboard', 120_000],    // Student dashboard — 2min
  ['parent/dashboard', 120_000],    // Parent dashboard — 2min
  ['/classes', 600_000],    // Class list — 10min: rarely changes
  ['/sections', 600_000],    // Sections — 10min
  ['/subjects', 600_000],    // Subjects — 10min
  ['/students', 60_000],    // Student list — 1min: must reflect fee changes quickly
];

const DEFAULT_TTL_MS = 60_000; // fallback: 60s

const getCacheTTL = (url: string): number => {
  for (const [pattern, ttl] of ENDPOINT_TTL) {
    if (url.includes(pattern)) return ttl;
  }
  return DEFAULT_TTL_MS;
};

export const clearApiCache = () => {
  apiCache.clear();
};

// Clear cache entries matching a pattern (for targeted invalidation)
export const clearApiCachePattern = (pattern: string) => {
  for (const key of apiCache.keys()) {
    if (key.includes(pattern)) {
      apiCache.delete(key);
    }
  }
};

const fetchJson = async (url: string, options?: RequestInit & { timeoutMs?: number }) => {
  const timeoutMs = options?.timeoutMs ?? 30_000; // default 30s
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _, ...fetchOptions } = options || {};
    const res = await fetch(url, { headers: getHeaders(), signal: controller.signal, ...fetchOptions });
    clearTimeout(timer);
    if (!res.ok) {
      let msg = 'Request failed';
      try {
        const e = await res.json();
        if (e.error === 'Validation failed' && e.details && Array.isArray(e.details)) {
          msg = `Validation failed: ${e.details.map((d: any) => `${d.field}: ${d.message}`).join(', ')}`;
        } else {
          msg = e.error || e.message || msg;
        }
      } catch { }
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return data;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The operation may still be running — please refresh to check results.');
    }
    throw err;
  }
};

export const api = {
  // ── Students ──────────────────────────────────────────────
  getStudents: (params?: any) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/students${q}`);
  },
  // Historical class roster for a past academic year (rebuilds old class lists
  // from student_promotions so Class 9 in 2026-27 still shows promoted students).
  getHistoricalStudents: (academicYearId: string, classId?: string) => {
    const q: any = { academic_year_id: academicYearId };
    if (classId) q.class_id = classId;
    return fetchJson(`${API_BASE_URL}/students/historical?${new URLSearchParams(q).toString()}`);
  },
  getStudentById: (id: string) => fetchJson(`${API_BASE_URL}/students/${id}`),
  createStudent: (payload: any) => {
    const result = fetchJson(`${API_BASE_URL}/students`, { method: 'POST', body: JSON.stringify(payload) });
    // Clear all caches so newly admitted students + their generated fees
    // appear immediately in the fee register and student lists.
    clearApiCachePattern('/students');
    clearApiCachePattern('/fees');
    clearApiCachePattern('fee-payments');
    clearApiCachePattern('dashboard-stats');
    return result;
  },
  updateStudent: (id: string, payload: any) => {
    const result = fetchJson(`${API_BASE_URL}/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    // Clear cache for this student to ensure fresh data on next fetch
    clearApiCachePattern(`/students/${id}`);
    clearApiCachePattern(`/students?`);
    return result;
  },
  deleteStudent: (id: string) => fetchJson(`${API_BASE_URL}/students/${id}`, { method: 'DELETE' }),
  bulkCreateStudents: (students: any[], generateFees?: boolean, sendNotification?: boolean, feeMonth?: string) => fetchJson(`${API_BASE_URL}/students/bulk`, { method: 'POST', body: JSON.stringify({ students, generateFees, sendNotification, feeMonth }), timeoutMs: 300_000 /* 5 min */ }),
  getStudentDashboard: () => fetchJson(`${API_BASE_URL}/students/dashboard`),
  getStudentResults: (studentId?: string) => fetchJson(`${API_BASE_URL}/students/results${studentId ? '/' + studentId : ''}`),
  getStudentExamReports: (studentId?: string) => fetchJson(`${API_BASE_URL}/students/exam-reports${studentId ? '/' + studentId : ''}`),

  // ── Teachers ──────────────────────────────────────────────
  getTeachers: () => fetchJson(`${API_BASE_URL}/teachers`),
  getTeacherById: (id: string) => fetchJson(`${API_BASE_URL}/teachers/${id}`),
  createTeacher: (payload: any) => fetchJson(`${API_BASE_URL}/teachers`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTeacher: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/teachers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  bulkCreateTeachers: (teachers: any[]) => fetchJson(`${API_BASE_URL}/teachers/bulk`, { method: 'POST', body: JSON.stringify({ teachers }) }),
  getTeacherDashboard: () => fetchJson(`${API_BASE_URL}/teachers/dashboard`),
  getTeacherSections: () => fetchJson(`${API_BASE_URL}/teachers/my-sections`),
  getTeacherStudents: () => fetchJson(`${API_BASE_URL}/students/my-students`),

  // ── Admin / Dashboard ─────────────────────────────────────
  getDashboardStats: () => fetchJson(`${API_BASE_URL}/admin/dashboard-stats`),
  getAnalytics: () => fetchJson(`${API_BASE_URL}/admin/dashboard-stats`),
  getClasses: () => fetchJson(`${API_BASE_URL}/admin/classes`),
  createClass: (payload: any) => fetchJson(`${API_BASE_URL}/admin/classes`, { method: 'POST', body: JSON.stringify(payload) }),
  updateClass: (classId: string, payload: any) => fetchJson(`${API_BASE_URL}/admin/classes/${classId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteClass: (classId: string) => fetchJson(`${API_BASE_URL}/admin/classes/${classId}`, { method: 'DELETE' }),
  addSection: (classId: string, payload: any) => fetchJson(`${API_BASE_URL}/admin/classes/${classId}/sections`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSection: (sectionId: string, payload: any) => fetchJson(`${API_BASE_URL}/admin/sections/${sectionId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSection: (sectionId: string) => fetchJson(`${API_BASE_URL}/admin/sections/${sectionId}`, { method: 'DELETE' }),
  getAuditLogs: (page = 1) => fetchJson(`${API_BASE_URL}/admin/audit-logs?page=${page}`),
  createAdmin: (payload: any) => fetchJson(`${API_BASE_URL}/auth/create-user`, { method: 'POST', body: JSON.stringify({ ...payload, role: 'admin' }) }),
  getAdmins: () => fetchJson(`${API_BASE_URL}/admin/admins`),
  resendCredentials: (userId: string, customPassword?: string) => fetchJson(`${API_BASE_URL}/auth/resend-credentials`, { method: 'POST', body: JSON.stringify({ userId, customPassword }) }),
  forgotPassword: (email: string) => fetchJson(`${API_BASE_URL}/auth/forgot-password`, { method: 'POST', body: JSON.stringify({ email }) }),
  resetPasswordWithOtp: (data: any) => fetchJson(`${API_BASE_URL}/auth/reset-password-otp`, { method: 'POST', body: JSON.stringify(data) }),
  resendAllAdminCredentials: (role: 'admin' | 'teacher' | 'student' | 'parent' | 'all' = 'admin') => fetchJson(`${API_BASE_URL}/admin/automation/resend-all-admins`, { method: 'POST', body: JSON.stringify({ role }) }),
  getAcademicYearStats: (yearId: string) => fetchJson(`${API_BASE_URL}/admin/academic-years/${yearId}/stats`),
  importStudents: (students: any[]) => fetchJson(`${API_BASE_URL}/admin/import-students`, { method: 'POST', body: JSON.stringify({ students }) }),
  importTeachers: (teachers: any[]) => fetchJson(`${API_BASE_URL}/admin/import-teachers`, { method: 'POST', body: JSON.stringify({ teachers }) }),
  importFeeStructures: (fees: any[]) => fetchJson(`${API_BASE_URL}/admin/import-fee-structures`, { method: 'POST', body: JSON.stringify({ fees }) }),
  bulkPromoteStudents: (payload: { studentIds: string[]; targetSectionId: string; targetAcademicYearId: string }) =>
    fetchJson(`${API_BASE_URL}/students/promote`, { method: 'POST', body: JSON.stringify(payload) }),
  generateFeesForExisting: (payload?: { academic_year_id?: string; section_id?: string; class_id?: string }) =>
    fetchJson(`${API_BASE_URL}/admin/generate-fees`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  triggerAutomation: (type: 'fee_gen' | 'reminders' | 'reports' | 'overdue') => fetchJson(`${API_BASE_URL}/admin/automation/trigger`, { method: 'POST', body: JSON.stringify({ type }) }),

  // ── Exams ─────────────────────────────────────────────────
  getExams: (params?: any) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/exams${q}`);
  },
  getExamTypes: () => fetchJson(`${API_BASE_URL}/exams/types`),
  createExam: (payload: any) => fetchJson(`${API_BASE_URL}/exams`, { method: 'POST', body: JSON.stringify(payload) }),
  updateExam: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/exams/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExam: (id: string) => fetchJson(`${API_BASE_URL}/exams/${id}`, { method: 'DELETE' }),
  submitResults: (payload: any) => fetchJson(`${API_BASE_URL}/exams/results`, { method: 'POST', body: JSON.stringify(payload) }),
  getExamResults: (examId: string) => fetchJson(`${API_BASE_URL}/exams/results/${examId}`),
  getReportCard: (studentId: string, examTypeId?: string) => {
    const q = examTypeId ? `?exam_type_id=${examTypeId}` : '';
    return fetchJson(`${API_BASE_URL}/exams/report-card/${studentId}${q}`);
  },
  publishResults: (payload: any) => fetchJson(`${API_BASE_URL}/exams/publish`, { method: 'POST', body: JSON.stringify(payload) }),
  getStudentAnalytics: (studentId: string) => fetchJson(`${API_BASE_URL}/exams/analytics/${studentId}`),
  getStudentsForMarksEntry: (params: any) => {
    const q = '?' + new URLSearchParams(params).toString();
    return fetchJson(`${API_BASE_URL}/exams/marks-entry-students${q}`);
  },
  notifyPendingMarks: () => fetchJson(`${API_BASE_URL}/exams/notify-pending`, { method: 'POST', body: '{}' }),

  // ── Attendance ────────────────────────────────────────────
  getAttendance: (params?: any) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/attendance${q}`);
  },
  submitAttendance: (payload: any) => fetchJson(`${API_BASE_URL}/attendance/mark`, { method: 'POST', body: JSON.stringify(payload) }),
  getHolidays: (params?: { start_date?: string; end_date?: string }) => {
    const q = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/attendance/holidays${q}`);
  },
  markHoliday: (payload: { date: string; reason?: string }) =>
    fetchJson(`${API_BASE_URL}/attendance/holidays`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteHoliday: (id: string) =>
    fetchJson(`${API_BASE_URL}/attendance/holidays/${id}`, { method: 'DELETE' }),

  // ── Fees ──────────────────────────────────────────────────
  getFees: (params?: any) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/fees/payments${q}`);
  },
  getFeeTransactions: (paymentId: string) => fetchJson(`${API_BASE_URL}/fees/payments/${paymentId}/transactions`),
  getAllFeeTransactions: (params?: Record<string, any>) => {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && v !== 'all') {
          q.set(k, String(v));
        }
      });
    }
    const qs = q.toString();
    return fetchJson(`${API_BASE_URL}/fees/transactions${qs ? '?' + qs : ''}`);
  },
  getFeeStats: (params?: { class_id?: string; section_id?: string; academic_year_id?: string; search?: string; status?: string }) => {
    const q = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString() : '';
    return fetchJson(`${API_BASE_URL}/fees/stats${q}`);
  },
  getFeeStructures: (params?: { academic_year_id?: string }) => {
    const q = params?.academic_year_id ? `?${new URLSearchParams(params).toString()}` : '';
    return fetchJson(`${API_BASE_URL}/fees/structures${q}`);
  },
  getFeeRegisterCumulative: (params: { academic_year_id: string; class_id?: string; section_id?: string; search?: string; page?: string; limit?: string }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
    return fetchJson(`${API_BASE_URL}/fees/register-cumulative?${q.toString()}`);
  },
  createFeeStructure: (payload: any) => fetchJson(`${API_BASE_URL}/fees/structures`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFeeStructure: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/fees/structures/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFeeStructure: (id: string) => fetchJson(`${API_BASE_URL}/fees/structures/${id}`, { method: 'DELETE' }),
  getMonthlyFeeGenerationStatus: () => fetchJson(`${API_BASE_URL}/fees/monthly-status`),
  collectFee: (payload: any) => fetchJson(`${API_BASE_URL}/fees/collect`, { method: 'POST', body: JSON.stringify(payload) }),
  bulkCollectFee: (payload: any) => fetchJson(`${API_BASE_URL}/fees/bulk-collect`, { method: 'POST', body: JSON.stringify(payload) }),
  addExtraFee: (payload: any) => fetchJson(`${API_BASE_URL}/fees/add-extra`, { method: 'POST', body: JSON.stringify(payload) }),
  bulkAssignFee: (payload: any) => fetchJson(`${API_BASE_URL}/fees/bulk-assign`, { method: 'POST', body: JSON.stringify(payload) }),
  adminGenerateFees: (payload?: { class_id?: string; section_id?: string; fee_type?: 'tuition' | 'transport' | 'both'; month?: string }) => fetchJson(`${API_BASE_URL}/fees/admin-generate`, { method: 'POST', body: JSON.stringify(payload || {}), timeoutMs: 300_000 }),
  getGenerationLogs: () => fetchJson(`${API_BASE_URL}/fees/generation-logs`),
  bulkAddFeeDues: (payload: any) => fetchJson(`${API_BASE_URL}/fees/bulk-dues`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFeePayment: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/fees/payments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFeePayment: (id: string) => fetchJson(`${API_BASE_URL}/fees/payments/${id}`, { method: 'DELETE' }),
  bulkDeleteFeePayments: (paymentIds: string[]) => fetchJson(`${API_BASE_URL}/fees/bulk-delete`, { method: 'POST', body: JSON.stringify({ paymentIds }) }),
  bulkEditFeePayments: (paymentIds: string[], updates: any) => fetchJson(`${API_BASE_URL}/fees/bulk-edit`, { method: 'POST', body: JSON.stringify({ paymentIds, updates }) }),
  createPaymentOrder: (data: any) => fetchJson(`${API_BASE_URL}/fees/create-order`, { method: 'POST', body: JSON.stringify(data) }),
  verifyPayment: (data: any) => fetchJson(`${API_BASE_URL}/fees/verify-payment`, { method: 'POST', body: JSON.stringify(data) }),
  syncFeeDues: () => fetchJson(`${API_BASE_URL}/fees/sync-dues`, { method: 'POST', body: JSON.stringify({}) }),
  sendFeeReminders: (payload?: { class_id?: string; section_id?: string; student_id?: string }) =>
    fetchJson(`${API_BASE_URL}/fees/send-reminders`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  getPayments: (params?: any) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/fees/payments${q}`);
  },
  // Invalidate student-related cache when fees change
  invalidateStudentCache: () => {
    clearApiCachePattern('/students');
    clearApiCachePattern('/fees');
    clearApiCachePattern('fee-payments');
    clearApiCachePattern('dashboard-stats');
    clearApiCachePattern('student/dashboard');
  },

  // Finance Dashboard & Analytics
  getFinanceDashboard: () => fetchJson(`${API_BASE_URL}/fees/dashboard`),
  getStudentLedger: (studentId: string) => fetchJson(`${API_BASE_URL}/fees/ledger/${studentId}`),
  getMyLedger: () => fetchJson(`${API_BASE_URL}/fees/my-ledger`),

  // Fee Categories
  getFeeCategories: () => fetchJson(`${API_BASE_URL}/fees/categories`),
  createFeeCategory: (payload: any) => fetchJson(`${API_BASE_URL}/fees/categories`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFeeCategory: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/fees/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFeeCategory: (id: string) => fetchJson(`${API_BASE_URL}/fees/categories/${id}`, { method: 'DELETE' }),

  // Fee Discounts
  getFeeDiscounts: (params?: { studentId?: string; classId?: string; sectionId?: string }) => {
    const q = new URLSearchParams();
    if (params?.studentId) q.set('studentId', params.studentId);
    if (params?.classId) q.set('classId', params.classId);
    if (params?.sectionId) q.set('sectionId', params.sectionId);
    const qs = q.toString();
    return fetchJson(`${API_BASE_URL}/fees/discounts${qs ? '?' + qs : ''}`);
  },
  applyDiscount: (payload: any) => fetchJson(`${API_BASE_URL}/fees/discounts`, { method: 'POST', body: JSON.stringify(payload) }),
  getFeeExemptions: (feeStructureId?: string) => fetchJson(`${API_BASE_URL}/fees/exemptions${feeStructureId ? `?feeStructureId=${encodeURIComponent(feeStructureId)}` : ''}`),
  addFeeExemption: (payload: { studentId: string; feeStructureId: string }) =>
    fetchJson(`${API_BASE_URL}/fees/exemptions`, { method: 'POST', body: JSON.stringify(payload) }),
  removeFeeExemption: (id: string) => fetchJson(`${API_BASE_URL}/fees/exemptions/${id}`, { method: 'DELETE' }),
  getStudentFeePayments: (studentId: string) => fetchJson(`${API_BASE_URL}/fees/student-payments/${studentId}`),

  // Fee Fines
  getFeeFines: (params?: { studentId?: string; classId?: string; sectionId?: string }) => {
    const q = new URLSearchParams();
    if (params?.studentId) q.set('studentId', params.studentId);
    if (params?.classId) q.set('classId', params.classId);
    if (params?.sectionId) q.set('sectionId', params.sectionId);
    const qs = q.toString();
    return fetchJson(`${API_BASE_URL}/fees/fines${qs ? '?' + qs : ''}`);
  },
  addFine: (payload: any) => fetchJson(`${API_BASE_URL}/fees/fines`, { method: 'POST', body: JSON.stringify(payload) }),
  waiveFine: (id: string) => fetchJson(`${API_BASE_URL}/fees/fines/${id}/waive`, { method: 'PUT', body: JSON.stringify({}) }),

  // Fee Refunds
  getFeeRefunds: (params?: { studentId?: string }) => {
    const q = params?.studentId ? `?studentId=${params.studentId}` : '';
    return fetchJson(`${API_BASE_URL}/fees/refunds${q}`);
  },
  createRefund: (payload: any) => fetchJson(`${API_BASE_URL}/fees/refunds`, { method: 'POST', body: JSON.stringify(payload) }),

  // ── Finance ───────────────────────────────────────────────
  getFinancialSummary: () => fetchJson(`${API_BASE_URL}/finance/summary`),
  getExpenses: () => fetchJson(`${API_BASE_URL}/finance/expenses`),
  createExpense: (payload: any) => fetchJson(`${API_BASE_URL}/finance/expenses`, { method: 'POST', body: JSON.stringify(payload) }),

  // ── Parents ───────────────────────────────────────────────
  getParents: () => fetchJson(`${API_BASE_URL}/parents`),
  getParentById: (id: string) => fetchJson(`${API_BASE_URL}/parents/${id}`),
  updateParent: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/parents/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getParentDashboard: () => fetchJson(`${API_BASE_URL}/parents/dashboard`),
  getParentChildren: () => fetchJson(`${API_BASE_URL}/parents/children`),
  getChildAttendance: (studentId: string, month?: number, year?: number) => {
    const q = new URLSearchParams();
    if (month) q.set('month', String(month));
    if (year) q.set('year', String(year));
    const qs = q.toString();
    return fetchJson(`${API_BASE_URL}/parents/children/${studentId}/attendance${qs ? '?' + qs : ''}`);
  },
  getChildFees: (studentId: string) => fetchJson(`${API_BASE_URL}/parents/children/${studentId}/fees`),
  getChildResults: (studentId: string) => fetchJson(`${API_BASE_URL}/parents/children/${studentId}/results`),

  // ── Timetable ─────────────────────────────────────────────
  getTimetable: (classId?: string, sectionId?: string) => {
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    if (sectionId) params.append('sectionId', sectionId);
    return fetchJson(`${API_BASE_URL}/timetable?${params.toString()}`);
  },
  generateAITimetable: (sectionId: string, preview: boolean = false, prompt?: string) =>
    fetchJson(`${API_BASE_URL}/timetable/generate-ai`, { method: 'POST', body: JSON.stringify({ sectionId, preview, prompt: prompt || undefined }) }),
  generateAITimetableFromPrompt: (sectionId: string, prompt: string) => fetchJson(`${API_BASE_URL}/timetable/generate-ai`, { method: 'POST', body: JSON.stringify({ sectionId, prompt, preview: true }) }),
  createTimetableSlot: (payload: any) => fetchJson(`${API_BASE_URL}/timetable/slot`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTimetableSlot: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/timetable/slot/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTimetableSlot: (id: string) => fetchJson(`${API_BASE_URL}/timetable/slot/${id}`, { method: 'DELETE' }),
  getSubjects: (opts?: { classId?: string; sectionId?: string }) => {
    const params = new URLSearchParams();
    if (opts?.classId) params.append('classId', opts.classId);
    if (opts?.sectionId) params.append('sectionId', opts.sectionId);
    const q = params.toString();
    return fetchJson(`${API_BASE_URL}/timetable/subjects${q ? `?${q}` : ''}`);
  },
  seedDefaultSubjects: () => fetchJson(`${API_BASE_URL}/timetable/subjects/seed-defaults`, { method: 'POST' }),
  downloadBulkTemplate: async (type: string) => {
    const res = await fetch(`${API_BASE_URL}/admin/bulk-template/${type}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to download template');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_upload_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
  createSubject: (payload: any) => fetchJson(`${API_BASE_URL}/timetable/subjects`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteSubject: (id: string) => fetchJson(`${API_BASE_URL}/timetable/subjects/${id}`, { method: 'DELETE' }),
  addSubjectToClass: (payload: any) => fetchJson(`${API_BASE_URL}/timetable/class-subjects`, { method: 'POST', body: JSON.stringify(payload) }),
  removeSubjectFromClass: (classSubjectId: string) => fetchJson(`${API_BASE_URL}/timetable/class-subjects/${classSubjectId}`, { method: 'DELETE' }),

  // ── Inventory ─────────────────────────────────────────────
  getInventoryCategories: () => fetchJson(`${API_BASE_URL}/inventory/categories`),
  createInventoryCategory: (payload: any) => fetchJson(`${API_BASE_URL}/inventory/categories`, { method: 'POST', body: JSON.stringify(payload) }),

  getInventory: (params?: Record<string, any>) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/inventory?${qs}`);
  },
  upsertInventoryItem: (payload: any) => fetchJson(`${API_BASE_URL}/inventory`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteInventoryItem: (id: string) => fetchJson(`${API_BASE_URL}/inventory/${id}`, { method: 'DELETE' }),

  getInventoryTransactions: () => fetchJson(`${API_BASE_URL}/inventory/transactions`),
  adjustInventoryStock: (payload: any) => fetchJson(`${API_BASE_URL}/inventory/adjust`, { method: 'POST', body: JSON.stringify(payload) }),

  getClassInventoryRequirements: (params: Record<string, any>) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/inventory/requirements?${qs}`);
  },
  setClassInventoryRequirement: (payload: any) => fetchJson(`${API_BASE_URL}/inventory/requirements`, { method: 'POST', body: JSON.stringify(payload) }),
  removeClassInventoryRequirement: (id: string) => fetchJson(`${API_BASE_URL}/inventory/requirements/${id}`, { method: 'DELETE' }),

  getStudentInventoryDistribution: (studentId: string) => fetchJson(`${API_BASE_URL}/inventory/distribution/student/${studentId}`),
  getAllInventoryDistributions: (params?: Record<string, any>) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/inventory/distribution/all${qs ? '?' + qs : ''}`);
  },
  issuePendingInventoryItem: (distributionId: string) => fetchJson(`${API_BASE_URL}/inventory/distribution/issue-pending/${distributionId}`, { method: 'POST' }),
  issueStudentInventoryItem: (studentId: string, payload: any) => fetchJson(`${API_BASE_URL}/inventory/distribution/student/${studentId}/issue`, { method: 'POST', body: JSON.stringify(payload) }),
  bulkIssueInventoryItem: (payload: any) => fetchJson(`${API_BASE_URL}/inventory/distribution/bulk-issue`, { method: 'POST', body: JSON.stringify(payload) }),
  undoBulkInventoryOperation: (operationId: string) => fetchJson(`${API_BASE_URL}/inventory/distribution/bulk-undo/${operationId}`, { method: 'POST' }),
  returnStudentInventoryItem: (distributionId: string, payload: any) => fetchJson(`${API_BASE_URL}/inventory/distribution/student/return/${distributionId}`, { method: 'POST', body: JSON.stringify(payload) }),
  getInventoryKits: () => fetchJson(`${API_BASE_URL}/inventory/kits`),
  createInventoryKit: (payload: any) => fetchJson(`${API_BASE_URL}/inventory/kits`, { method: 'POST', body: JSON.stringify(payload) }),

  // ── Transport ─────────────────────────────────────────────
  getTransport: () => fetchJson(`${API_BASE_URL}/transport/dashboard`),
  getTransportRoutes: () => fetchJson(`${API_BASE_URL}/transport/routes`),
  createTransportRoute: (payload: any) => fetchJson(`${API_BASE_URL}/transport/routes`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTransportRoute: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/transport/routes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTransportRoute: (id: string) => fetchJson(`${API_BASE_URL}/transport/routes/${id}`, { method: 'DELETE' }),
  getRouteStudents: (routeId: string) => fetchJson(`${API_BASE_URL}/transport/routes/${routeId}/students`),
  getUnassignedStudents: (params?: { class_id?: string; section_id?: string }) => {
    const q = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/transport/students/unassigned${q}`);
  },
  bulkAssignStudentsToRoute: (studentIds: string[], routeId: string | null, pushImmediately?: boolean) =>
    fetchJson(`${API_BASE_URL}/transport/students/bulk-assign`, { method: 'POST', body: JSON.stringify({ studentIds, routeId, pushImmediately: pushImmediately === true }) }),


  // ── Events ────────────────────────────────────────────────
  getEvents: () => fetchJson(`${API_BASE_URL}/events`),
  upsertEvent: (payload: any) => fetchJson(`${API_BASE_URL}/events`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteEvent: (id: string) => fetchJson(`${API_BASE_URL}/events/${id}`, { method: 'DELETE' }),

  // ── AI chatbot ─────────────────────────────────────────────
  getChatbotResponse: (message: string, sessionId?: string | null) => fetchJson(`${API_BASE_URL}/ai/chat`, { method: 'POST', body: JSON.stringify({ message, sessionId }) }),
  getChatHistory: (sessionId?: string | null) => {
    const q = sessionId ? `?sessionId=${sessionId}` : '';
    return fetchJson(`${API_BASE_URL}/ai/history${q}`);
  },
  getChatSessions: () => fetchJson(`${API_BASE_URL}/ai/sessions`),
  createChatSession: () => fetchJson(`${API_BASE_URL}/ai/sessions`, { method: 'POST' }),

  // ── Canteen ───────────────────────────────────────────────
  getCanteen: () => fetchJson(`${API_BASE_URL}/canteen`),
  createCanteenOrder: (payload: any) => fetchJson(`${API_BASE_URL}/canteen/orders`, { method: 'POST', body: JSON.stringify(payload) }),

  // ── Competitions ──────────────────────────────────────────
  getCompetitions: () => fetchJson(`${API_BASE_URL}/competitions`),
  upsertCompetition: (payload: any) => fetchJson(`${API_BASE_URL}/competitions`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteCompetition: (id: string) => fetchJson(`${API_BASE_URL}/competitions/${id}`, { method: 'DELETE' }),

  // ── LMS ───────────────────────────────────────────────────
  getLMS: () => fetchJson(`${API_BASE_URL}/lms`),
  submitAssignmentResults: (payload: any) => fetchJson(`${API_BASE_URL}/lms/assignments/results`, { method: 'POST', body: JSON.stringify(payload) }),
  publishAssignmentResults: (payload: any) => fetchJson(`${API_BASE_URL}/lms/assignments/publish`, { method: 'POST', body: JSON.stringify(payload) }),
  // Upload a file (base64 data URL) to S3 for assignment/exam/homework attachments
  uploadAssignmentFile: (dataUrl: string, filename?: string, type?: string) =>
    fetchJson(`${API_BASE_URL}/ops/lms/upload`, { method: 'POST', body: JSON.stringify({ dataUrl, filename, type }), timeoutMs: 60_000 }),
  // Students upload their own submission file (PDF/doc/image) for assignments & homework
  uploadSubmissionFile: (dataUrl: string, filename?: string) =>
    fetchJson(`${API_BASE_URL}/ops/lms/submissions/upload`, { method: 'POST', body: JSON.stringify({ dataUrl, filename }), timeoutMs: 60_000 }),

  // ── Communication ─────────────────────────────────────────
  getNotificationLogs: () => fetchJson(`${API_BASE_URL}/communication/logs`),
  getNotifications: () => fetchJson(`${API_BASE_URL}/communication/notifications`),
  getNotificationCount: () => fetchJson(`${API_BASE_URL}/communication/notifications/count`),
  markNotificationsRead: (notificationIds: string[]) => fetchJson(`${API_BASE_URL}/communication/notifications/mark-read`, { method: 'POST', body: JSON.stringify({ notificationIds }) }),
  getMyNotifications: (status?: string) => fetchJson(`${API_BASE_URL}/communication/my-notifications${status ? `?status=${status}` : ''}`),
  savePushSubscription: (subscription: PushSubscriptionJSON) => fetchJson(`${API_BASE_URL}/communication/push-subscriptions`, { method: 'POST', body: JSON.stringify({ subscription }) }),
  removePushSubscription: (endpoint: string) => fetchJson(`${API_BASE_URL}/communication/push-subscriptions`, { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  getEmailLogs: (params?: { page?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.status) q.set('status', params.status);
    return fetchJson(`${API_BASE_URL}/communication/emails?${q}`);
  },
  getEmailAnalytics: () => fetchJson(`${API_BASE_URL}/communication/emails/analytics`),
  getEmailById: (id: string) => fetchJson(`${API_BASE_URL}/communication/emails/${id}`),
  getCommunicationTimeline: (userId: string, studentId?: string) => {
    const q = studentId ? `?studentId=${studentId}` : '';
    return fetchJson(`${API_BASE_URL}/communication/timeline/${userId}${q}`);
  },
  sendMultiChannelNotification: (payload: any) => fetchJson(`${API_BASE_URL}/communication/send-email`, { method: 'POST', body: JSON.stringify(payload) }),
  sendReceipt: (payload: { feePaymentId: string }) => fetchJson(`${API_BASE_URL}/communication/send-receipt`, { method: 'POST', body: JSON.stringify(payload) }),
  sendReceiptEmail: (payload: { feePaymentId: string }) => fetchJson(`${API_BASE_URL}/communication/send-receipt`, { method: 'POST', body: JSON.stringify(payload) }),
  triggerReminders: () => fetchJson(`${API_BASE_URL}/communication/trigger-due-reminders`, { method: 'POST', body: JSON.stringify({}) }),
  sendEmergencyAlert: (payload: { studentId: string; message?: string; channels?: string[] }) => fetchJson(`${API_BASE_URL}/communication/emergency-alert`, { method: 'POST', body: JSON.stringify(payload) }),

  // ── Queries / Support Tickets ─────────────────────────────
  getQueries: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/queries${q}`);
  },
  getQueryById: (id: string) => fetchJson(`${API_BASE_URL}/queries/${id}`),
  createQuery: (payload: { category: string; subject: string; description: string; studentId?: string; priority?: string }) =>
    fetchJson(`${API_BASE_URL}/queries`, { method: 'POST', body: JSON.stringify(payload) }),
  replyToQuery: (id: string, message: string) =>
    fetchJson(`${API_BASE_URL}/queries/${id}/reply`, { method: 'POST', body: JSON.stringify({ message }) }),
  updateQuery: (id: string, payload: { status?: string; priority?: string; assignedTo?: string }) =>
    fetchJson(`${API_BASE_URL}/queries/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  publishTimetable: (sectionId: string) =>
    fetchJson(`${API_BASE_URL}/timetable/publish`, { method: 'POST', body: JSON.stringify({ sectionId }) }),


  // ── Auth & Users ─────────────────────────────────────────
  login: async (loginId: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },
  register: async (payload: any) => {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = 'Registration failed';
      try { const e = await res.json(); msg = e.error || e.message || msg; } catch { }
      throw new Error(msg);
    }
    return res.json();
  },
  updateUserStatus: (userId: string, isActive: boolean) => fetchJson(`${API_BASE_URL}/auth/update-status`, { method: 'POST', body: JSON.stringify({ userId, isActive }) }),
  deleteUser: (id: string) => fetchJson(`${API_BASE_URL}/auth/${id}`, { method: 'DELETE' }),

  // ── Payroll ────────────────────────────────────────────────
  getPayrollHistory: (teacherId?: string) => {
    const q = teacherId ? `?teacher_id=${teacherId}` : '';
    return fetchJson(`${API_BASE_URL}/payroll${q}`);
  },
  payTeacher: (id: string, data: { accountNumber: string; ifsc: string }) => fetchJson(`${API_BASE_URL}/payroll/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  createPayrollEntry: (payload: any) => fetchJson(`${API_BASE_URL}/payroll`, { method: 'POST', body: JSON.stringify(payload) }),
  processTeacherPayout: async (data: { teacherId: string; amount: number; accountNumber: string; ifsc: string; name: string }) => {
    // 1. Create payroll entry
    const entry = await api.createPayrollEntry({
      teacher_id: data.teacherId,
      amount: data.amount,
      month: new Date().toLocaleString('default', { month: 'long' }),
      year: new Date().getFullYear().toString(),
      status: 'pending'
    });
    // 2. Pay it
    return api.payTeacher(entry.id, { accountNumber: data.accountNumber, ifsc: data.ifsc });
  },

  // Payroll Structures
  getPayrollStructures: () => fetchJson(`${API_BASE_URL}/payroll/structures`),
  createPayrollStructure: (payload: { name: string; amount: number; frequency?: string }) =>
    fetchJson(`${API_BASE_URL}/payroll/structures`, { method: 'POST', body: JSON.stringify(payload) }),
  updatePayrollStructure: (id: string, payload: any) =>
    fetchJson(`${API_BASE_URL}/payroll/structures/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePayrollStructure: (id: string) =>
    fetchJson(`${API_BASE_URL}/payroll/structures/${id}`, { method: 'DELETE' }),
  bulkAssignPayroll: (payload: { teacherIds: string[]; structureId?: string; month: string; year: string }) =>
    fetchJson(`${API_BASE_URL}/payroll/bulk-assign`, { method: 'POST', body: JSON.stringify(payload) }),
  getStaffForPayroll: () => fetchJson(`${API_BASE_URL}/payroll/staff`),
  assignStructureToTeacher: (payload: { teacherId: string; structureId: string }) =>
    fetchJson(`${API_BASE_URL}/payroll/assign-structure`, { method: 'POST', body: JSON.stringify(payload) }),
  notifyMonthlySalaryDue: () =>
    fetchJson(`${API_BASE_URL}/payroll/notify-due`, { method: 'POST' }),

  // ── AI insights ─────────────────────────────────────────────
  getAIInsights: (period = 'monthly') => fetchJson(`${API_BASE_URL}/admin/ai-insights?period=${period}`),
  getDropoutRisks: () => fetchJson(`${API_BASE_URL}/admin/dropout-risks`),
  getFeePredictions: () => fetchJson(`${API_BASE_URL}/admin/fee-predictions`),
  getPaymentSettings: () => fetchJson(`${API_BASE_URL}/admin/payments/settings`),
  updatePaymentSettings: (payload: { keyId: string; keySecret: string }) => fetchJson(`${API_BASE_URL}/admin/payments/settings`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolProfile: (payload: { schoolName?: string; schoolAddress?: string; schoolPhone?: string; schoolEmail?: string; schoolWebsite?: string }) => fetchJson(`${API_BASE_URL}/admin/school-profile`, { method: 'PUT', body: JSON.stringify(payload) }),
  getMe: () => fetchJson(`${API_BASE_URL}/auth/me`),

  // ── Operations (New Modules) ─────────────────────────────
  // Transport
  getVehicles: () => fetchJson(`${API_BASE_URL}/ops/transport/vehicles`),
  createVehicle: (payload: any) => fetchJson(`${API_BASE_URL}/ops/transport/vehicles`, { method: 'POST', body: JSON.stringify(payload) }),
  getRoutes: () => fetchJson(`${API_BASE_URL}/ops/transport/routes`),
  assignTransport: (studentId: string, routeId: string) => fetchJson(`${API_BASE_URL}/ops/transport/assign`, { method: 'POST', body: JSON.stringify({ studentId, routeId }) }),

  // Library
  getBooks: () => fetchJson(`${API_BASE_URL}/ops/library/books`),
  addBook: (payload: any) => fetchJson(`${API_BASE_URL}/ops/library/books`, { method: 'POST', body: JSON.stringify(payload) }),
  issueBook: (payload: any) => fetchJson(`${API_BASE_URL}/ops/library/issue`, { method: 'POST', body: JSON.stringify(payload) }),
  returnBook: (issueId: string) => fetchJson(`${API_BASE_URL}/ops/library/return`, { method: 'POST', body: JSON.stringify({ issueId }) }),

  // LMS & Vault
  submitAssignment: (payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/submit`, { method: 'POST', body: JSON.stringify(payload) }),
  gradeAssignment: (payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/grade`, { method: 'POST', body: JSON.stringify(payload) }),
  uploadVaultDoc: (payload: any) => fetchJson(`${API_BASE_URL}/ops/vault/upload`, { method: 'POST', body: JSON.stringify(payload) }),
  getUserDocs: (userId: string) => fetchJson(`${API_BASE_URL}/ops/vault/${userId}`),
  getAssignments: (q: string | Record<string, string> = '') => {
    if (typeof q === 'object') {
      const params = new URLSearchParams(q);
      return fetchJson(`${API_BASE_URL}/ops/lms/assignments?${params.toString()}`);
    }
    return fetchJson(`${API_BASE_URL}/ops/lms/assignments${q}`);
  },
  getAssignmentSubmissions: (id: string) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/${id}/submissions`),
  toggleAssignmentStatus: (payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/toggle`, { method: 'POST', body: JSON.stringify(payload) }),
  createAssignment: (payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/assignments`, { method: 'POST', body: JSON.stringify(payload) }),
  updateAssignment: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAssignment: (id: string) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/${id}`, { method: 'DELETE' }),

  // Homework aliases
  getHomework: (q?: any) => {
    let qs = '?type=homework';
    if (q) {
      if (typeof q === 'object') {
        const p = new URLSearchParams(q);
        qs += '&' + p.toString();
      } else {
        qs += q.replace('?', '&');
      }
    }
    return fetchJson(`${API_BASE_URL}/ops/lms/assignments${qs}`);
  },
  createHomework: (payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/assignments`, { method: 'POST', body: JSON.stringify({ ...payload, maxMarks: -1 }) }),
  deleteHomework: (id: string) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/${id}`, { method: 'DELETE' }),
  getHomeworkSubmissions: (id: string) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/${id}/submissions`),
  toggleHomeworkStatus: (payload: any) => fetchJson(`${API_BASE_URL}/ops/lms/assignments/toggle`, { method: 'POST', body: JSON.stringify({ ...payload, assignmentId: payload.homeworkId }) }),

  // ── Academic Years ────────────────────────────────────────
  getAcademicYears: () => fetchJson(`${API_BASE_URL}/academic-years`),
  getCurrentAcademicYear: () => fetchJson(`${API_BASE_URL}/academic-years/current`),
  createAcademicYear: (payload: any) => fetchJson(`${API_BASE_URL}/academic-years`, { method: 'POST', body: JSON.stringify(payload) }),
  updateAcademicYear: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/academic-years/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAcademicYear: (id: string) => fetchJson(`${API_BASE_URL}/academic-years/${id}`, { method: 'DELETE' }),
  setCurrentAcademicYear: (id: string, autoRollover = false) => fetchJson(`${API_BASE_URL}/academic-years/${id}/set-current`, { method: 'PATCH', body: JSON.stringify({ auto_rollover: autoRollover }) }),

  // Granular Finance
  getFeeHeads: () => fetchJson(`${API_BASE_URL}/ops/finance/heads`),
  getFeeComponents: (structureId: string) => fetchJson(`${API_BASE_URL}/ops/finance/structure/${structureId}/components`),

  // ── Sports ────────────────────────────────────────────────
  getSportsData: () => fetchJson(`${API_BASE_URL}/sports`),
  upsertSportsTeam: (payload: any) => fetchJson(`${API_BASE_URL}/sports/teams`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteSportsTeam: (id: string) => fetchJson(`${API_BASE_URL}/sports/teams/${id}`, { method: 'DELETE' }),

  // ── Planners & Assemblies ────────────────────────────────────────────────
  getLecturePlans: (params?: Record<string, any>) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/planners/lectures?${qs}`);
  },
  createLecturePlan: (payload: any) => fetchJson(`${API_BASE_URL}/planners/lectures`, { method: 'POST', body: JSON.stringify(payload) }),
  updateLecturePlan: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/planners/lectures/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getAssessments: (params?: Record<string, any>) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/planners/assessments?${qs}`);
  },
  createAssessment: (payload: any) => fetchJson(`${API_BASE_URL}/planners/assessments`, { method: 'POST', body: JSON.stringify(payload) }),
  updateAssessment: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/planners/assessments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getAssemblies: (params?: Record<string, any>) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_BASE_URL}/assemblies?${qs}`);
  },
  createAssembly: (payload: any) => fetchJson(`${API_BASE_URL}/assemblies`, { method: 'POST', body: JSON.stringify(payload) }),
  updateAssembly: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/assemblies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAssembly: (id: string) => fetchJson(`${API_BASE_URL}/assemblies/${id}`, { method: 'DELETE' }),

  // ── Academic Year Rollover ──────────────────────────────────────────
  getRolloverPreview: (fromAcademicYearId: string, toAcademicYearId: string) =>
    fetchJson(`${API_BASE_URL}/rollover/preview?fromAcademicYearId=${fromAcademicYearId}&toAcademicYearId=${toAcademicYearId}`),
  executeRollover: (payload: any) => fetchJson(`${API_BASE_URL}/rollover/execute`, { method: 'POST', body: JSON.stringify(payload), timeoutMs: 300_000 }),
  revertRollover: (rolloverId: string) => fetchJson(`${API_BASE_URL}/rollover/${rolloverId}/revert`, { method: 'POST', body: JSON.stringify({}) }),
  getRolloverLogs: () => fetchJson(`${API_BASE_URL}/rollover/logs`),
  getRolloverStatus: (rolloverId: string) => fetchJson(`${API_BASE_URL}/rollover/logs/${rolloverId}`),
  markStudentsRepeating: (studentIds: string[]) => fetchJson(`${API_BASE_URL}/rollover/mark-repeating`, { method: 'POST', body: JSON.stringify({ studentIds }) }),
  triggerSchoolRollover: (payload: { targetAcademicYearId: string; feeIncreasePercent?: number }) =>
    fetchJson(`${API_BASE_URL}/rollover/execute`, { method: 'POST', body: JSON.stringify(payload), timeoutMs: 300_000 }),

  // ── Integrations ─────────────────────────────────────────────────────────
  getWhatsAppStatus: () => fetchJson(`${API_BASE_URL}/integrations/whatsapp/status`),
  connectWhatsApp: () => fetchJson(`${API_BASE_URL}/integrations/whatsapp/connect`),
  updateWhatsAppIds: (data: { phone_number_id: string, whatsapp_business_account_id: string }) => fetchJson(`${API_BASE_URL}/integrations/whatsapp/update-ids`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Exam Paper Generation ────────────────────────────────────────────────
  // Templates
  getExamPaperTemplates: (params?: { classId?: string; subjectId?: string }) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/exam-papers/templates${q}`);
  },
  createExamPaperTemplate: (payload: any) => fetchJson(`${API_BASE_URL}/exam-papers/templates`, { method: 'POST', body: JSON.stringify(payload) }),
  updateExamPaperTemplate: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/exam-papers/templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExamPaperTemplate: (id: string) => fetchJson(`${API_BASE_URL}/exam-papers/templates/${id}`, { method: 'DELETE' }),

  // Questions Bank
  getQuestions: (params?: { subjectId?: string; classId?: string; chapter?: string; difficulty?: string; search?: string }) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/exam-papers/questions${q}`);
  },
  createQuestion: (payload: any) => fetchJson(`${API_BASE_URL}/exam-papers/questions`, { method: 'POST', body: JSON.stringify(payload) }),
  bulkImportQuestions: (questions: any[]) => fetchJson(`${API_BASE_URL}/exam-papers/questions/bulk-import`, { method: 'POST', body: JSON.stringify({ questions }) }),
  checkDuplicateQuestions: (questionIds: string[], paperId: string) => fetchJson(`${API_BASE_URL}/exam-papers/questions/check-duplicates`, { method: 'POST', body: JSON.stringify({ questionIds, paperId }) }),

  // Exam Papers
  getExamPapers: (params?: { templateId?: string; examId?: string }) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson(`${API_BASE_URL}/exam-papers/papers${q}`);
  },
  createExamPaper: (payload: any) => fetchJson(`${API_BASE_URL}/exam-papers/papers`, { method: 'POST', body: JSON.stringify(payload) }),
  updateExamPaper: (id: string, payload: any) => fetchJson(`${API_BASE_URL}/exam-papers/papers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  generateExamPaperHTML: (paperId: string) => fetchJson(`${API_BASE_URL}/exam-papers/papers/${paperId}/html`),
  updatePaperStatus: (paperId: string, status: string, comments?: string) => fetchJson(`${API_BASE_URL}/exam-papers/papers/${paperId}/status`, { method: 'PATCH', body: JSON.stringify({ status, comments }) }),
  trackQuestionUsage: (paperId: string, questionIds: string[], examId?: string) => fetchJson(`${API_BASE_URL}/exam-papers/papers/${paperId}/track-usage`, { method: 'POST', body: JSON.stringify({ paperId, questionIds, examId }) }),

  // Upload an image (base64 data URL) to S3 for exam papers / questions
  uploadExamPaperImage: (dataUrl: string, filename?: string, type?: string) =>
    fetchJson(`${API_BASE_URL}/exam-papers/upload`, { method: 'POST', body: JSON.stringify({ dataUrl, filename, type }), timeoutMs: 60_000 }),

  // Blueprint Compliance
  checkBlueprintCompliance: (templateId: string, questions: any[]) => fetchJson(`${API_BASE_URL}/exam-papers/templates/check-blueprint`, { method: 'POST', body: JSON.stringify({ templateId, questions }) }),
};
