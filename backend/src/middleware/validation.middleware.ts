import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

// Generic validation middleware factory
export const validate = (schema: z.ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: err.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
                });
            }
            next(err);
        }
    };
};

// ── Auth schemas ──────────────────────────────────────────────
export const loginSchema = z.object({
    loginId: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
    role: z.string().optional(),
});

export const registerSchema = z.object({
    email: z.string().email().max(200),
    password: z.string().min(8).max(100).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Password must contain uppercase, lowercase, number and special character'),
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    schoolName: z.string().min(1).max(200),
    schoolCode: z.string().max(50).optional(),
    board: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    pincode: z.string().max(10).optional(),
    principalName: z.string().max(100).optional(),
    establishedYear: z.string().max(10).optional(),
    schoolEmail: z.string().email().max(200).optional(),
    schoolPhone: z.string().max(20).optional(),
    website: z.string().max(200).optional(),
    logoUrl: z.string().max(500).optional(),
    domain: z.string().max(200).optional(),
});

export const forgotPasswordSchema = z.object({
    email: z.string().email().max(200),
});

export const resetPasswordSchema = z.object({
    email: z.string().email().max(200),
    otp: z.string().min(6).max(6),
    newPassword: z.string().min(8).max(200).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@^#$%*?&])/, 'Password must contain 8 characters, uppercase, lowercase, digit, special character'),
});

export const createUserSchema = z.object({
    email: z.string().email().max(200),
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    role: z.enum(['admin', 'teacher', 'student', 'parent']),
    password: z.string().min(8).max(200).optional(),
    academicYearId: z.string().max(100).optional(),
});

export const resendCredentialsSchema = z.object({
    userId: z.string().min(1).max(100),
    customPassword: z.string().min(8).max(200).optional(),
});

export const updateUserStatusSchema = z.object({
    userId: z.string().min(1).max(100),
    isActive: z.boolean(),
});

// ── Student schemas ───────────────────────────────────────────
export const createStudentSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    email: z.string().email().max(200).optional(),
    phone: z.string().max(20).optional(),
    admissionNumber: z.string().max(50).optional(),
    rollNumber: z.string().max(20).optional(),
    sectionId: z.string().max(100).optional(),
    classId: z.string().max(100).optional(),
    gender: z.string().max(20).optional(),
    dateOfBirth: z.string().max(20).optional(),
    fatherName: z.string().max(100).optional(),
    motherName: z.string().max(100).optional(),
    guardianPhone: z.string().max(20).optional(),
    guardianEmail: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    pincode: z.string().max(10).optional(),
    transportRouteId: z.string().max(100).optional(),
    transportRouteName: z.string().max(200).optional(),
    transportFeeAmount: z.number().optional(),
    academicYearId: z.string().max(100).optional(),
    isActive: z.boolean().optional(),
    generateFees: z.array(z.string()).optional(),
    selectedKits: z.array(z.string()).optional(),
    sendNotification: z.boolean().optional(),
    generateFeesConfirm: z.boolean().optional(),
}).passthrough();

export const updateStudentSchema = z.object({
    firstName: z.string().max(100).optional().or(z.literal('')),
    lastName: z.string().max(100).optional().or(z.literal('')),
    email: z.string().max(200).optional().or(z.literal('')),
    phone: z.string().max(20).optional().or(z.literal('')),
    admissionNumber: z.coerce.string().max(50).optional().or(z.literal('')),
    rollNumber: z.coerce.string().max(20).optional().or(z.literal('')),
    sectionId: z.string().max(100).optional().or(z.literal('')),
    classId: z.string().max(100).optional().or(z.literal('')),
    gender: z.string().max(20).optional().or(z.literal('')),
    dateOfBirth: z.string().max(20).optional().or(z.literal('')),
    fatherName: z.string().max(100).optional().or(z.literal('')),
    motherName: z.string().max(100).optional().or(z.literal('')),
    guardianPhone: z.string().max(20).optional().or(z.literal('')),
    guardianEmail: z.string().max(200).optional().or(z.literal('')),
    address: z.string().max(500).optional().or(z.literal('')),
    city: z.string().max(100).optional().or(z.literal('')),
    state: z.string().max(100).optional().or(z.literal('')),
    pincode: z.coerce.string().max(10).optional().or(z.literal('')),
    emergencyContact: z.string().max(20).optional().or(z.literal('')),
    bloodGroup: z.string().max(10).optional().or(z.literal('')),
    medicalConditions: z.string().max(500).optional().or(z.literal('')),
    allergies: z.string().max(500).optional().or(z.literal('')),
    previousSchool: z.string().max(200).optional().or(z.literal('')),
    riskLevel: z.string().max(20).optional().or(z.literal('')),
    transportRouteId: z.string().max(100).optional().or(z.literal('')),
    academicYearId: z.string().max(100).optional().or(z.literal('')),
    isActive: z.boolean().optional(),
}).passthrough();

export const bulkCreateStudentsSchema = z.object({
    students: z.array(z.record(z.string(), z.any())).min(1).max(5000),
    generateFees: z.boolean().optional(),
    sendNotification: z.boolean().optional(),
});

// ── Fee schemas ───────────────────────────────────────────────
export const collectFeeSchema = z.object({
    paymentId: z.string().min(1).max(100),
    amount: z.number().positive(),
    paymentMethod: z.string().max(50).optional(),
    remarks: z.string().max(500).optional(),
    referenceNumber: z.string().max(100).optional(),
    paidDate: z.string().max(20).optional(),
    notifyEmail: z.boolean().optional(),
    notifyWhatsapp: z.boolean().optional(),
    discountAmount: z.number().nonnegative().optional(),
    lateFee: z.number().nonnegative().optional(),
});

export const createFeeStructureSchema = z.object({
    name: z.string().min(1).max(200),
    amount: z.number().positive(),
    frequency: z.string().max(20).optional(),
    dueDay: z.number().min(1).max(31).optional(),
    isMandatory: z.boolean().optional(),
    classId: z.string().max(100).optional(),
    academicYearId: z.string().max(100).optional(),
    transportRouteId: z.string().max(100).optional(),
    appliesTo: z.string().max(50).optional(),
    pushImmediately: z.boolean().optional(),
});

export const addExtraFeeSchema = z.object({
    studentId: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    amount: z.number().positive(),
    remarks: z.string().max(500).optional(),
    dueDate: z.string().max(20).optional(),
    lateFee: z.number().nonnegative().optional(),
    notifyEmail: z.boolean().optional(),
    notifyWhatsapp: z.boolean().optional(),
});

// ── Attendance schema ─────────────────────────────────────────
export const markAttendanceSchema = z.object({
    date: z.string().max(20),
    records: z.array(z.object({
        studentId: z.string().min(1).max(100),
        status: z.enum(['present', 'absent', 'late', 'half-day']),
        remarks: z.string().max(200).optional(),
    })).min(1).max(5000),
});

// ── Generic sanitization helper ──────────────────────────────
export const sanitizeString = (value: any): string => {
    if (typeof value !== 'string') return '';
    return value
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
};