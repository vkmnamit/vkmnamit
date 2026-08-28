import { Router } from "express";
import * as adminController from "../controllers/admin.controller";
import { downloadBulkTemplate } from "../controllers/bulkTemplate.controller";
import { authMiddleware, roleGuard } from "../middleware/auth.middleware";
import { cacheGet, clearCache } from "../middleware/cache.middleware";
import { bulkOperationLimiter } from "../middleware/rateLimit.middleware";

// All routes in this router require admin role
const adminOnly = [authMiddleware, roleGuard('admin')];

const router = Router();

// Debug route to list registered paths in this router
router.get("/debug-routes", (req, res) => {
    res.json({
        routes: router.stack.filter(r => r.route).map(r => r.route?.path)
    });
});

router.get(
    "/dashboard-stats",
    ...adminOnly,
    cacheGet(300),
    adminController.getDashboardStats
);
router.get("/ai-insights", ...adminOnly, adminController.getAIInsights);
router.get("/dropout-risks", ...adminOnly, adminController.getDropoutRisks);
router.get(
    "/student-prediction/:studentId",
    ...adminOnly,
    adminController.getStudentPrediction
);
router.get("/fee-predictions", ...adminOnly, adminController.getFeeDefaultPredictions);

router.get("/academic-years/:yearId/stats", ...adminOnly, adminController.getAcademicYearStats);

router.get("/classes", ...adminOnly, cacheGet(300), adminController.getClasses);
router.post("/classes", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.createClass);
router.put("/classes/:classId", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.updateClass);
router.delete("/classes/:classId", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.deleteClass);
router.post("/classes/:classId/sections", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.addSection);
router.put("/sections/:sectionId", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.updateSection);
router.delete("/sections/:sectionId", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.deleteSection);

router.get("/timetable", ...adminOnly, adminController.getTimetable);
router.post(
    "/timetable/generate",
    ...adminOnly,
    adminController.generateSmartTimetable
);
router.post("/timetable/save", ...adminOnly, adminController.saveTimetable);

router.get("/audit-logs", ...adminOnly, adminController.getAuditLogs);

// Bulk template downloads
router.get("/bulk-template/:type", ...adminOnly, downloadBulkTemplate);

// Bulk Imports — protected + rate-limited
router.post(
    "/import-students",
    ...adminOnly,
    bulkOperationLimiter,
    (req, res, next) => { clearCache((req as any).user?.school_id); next(); },
    adminController.bulkImportStudents
);
router.post(
    "/import-teachers",
    ...adminOnly,
    bulkOperationLimiter,
    (req, res, next) => { clearCache((req as any).user?.school_id); next(); },
    adminController.bulkImportTeachers
);
router.post(
    "/import-fee-structures",
    ...adminOnly,
    bulkOperationLimiter,
    (req, res, next) => { clearCache((req as any).user?.school_id); next(); },
    adminController.bulkImportFeeStructures
);
router.post(
    "/promote-students",
    ...adminOnly,
    bulkOperationLimiter,
    (req, res, next) => { clearCache((req as any).user?.school_id); next(); },
    adminController.bulkPromoteStudents
);
router.post(
    "/generate-fees",
    ...adminOnly,
    bulkOperationLimiter,
    (req, res, next) => { clearCache((req as any).user?.school_id); next(); },
    adminController.generateFeesForExistingStudents
);

// Automation Triggers
router.post("/automation/trigger", ...adminOnly, bulkOperationLimiter, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.triggerAutomation);
router.post("/automation/school-rollover", ...adminOnly, bulkOperationLimiter, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.triggerSchoolRollover);

// User Management
router.get("/admins", ...adminOnly, adminController.getAdmins);
router.post("/automation/resend-all-admins", ...adminOnly, bulkOperationLimiter, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.resendAllAdmins);
router.patch("/users/:userId", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.updateUserDetails);
router.put("/school-profile", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.updateSchoolProfile);
router.delete("/users/:userId", ...adminOnly, (req, res, next) => { clearCache((req as any).user?.school_id); next(); }, adminController.removeUser);

export default router;
