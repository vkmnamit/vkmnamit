import express from 'express';
import { supabaseAdmin } from './config/supabase';
import authRoutes from './routes/auth.route';
import studentRoutes from './routes/student.route';
import teacherRoutes from './routes/teacher.route';
import parentRoutes from './routes/parents.route';
import adminRoutes from './routes/admin.route';
import timetableRoutes from './routes/timetable.route';
import examRoutes from './routes/exam.route';
import attendanceRoutes from './routes/attendance.route';
import feeRoutes from './routes/fees.route';
import inventoryRoutes from './routes/inventory.route';
import aiRoutes from './routes/ai.route';
import payrollRoutes from './routes/payroll.route';
import canteenRoutes from './routes/canteen.route';
import transportRoutes from './routes/transport.route';
import communicationRoutes from './routes/communication.route';
import lmsRoutes from './routes/lms.route';
import financeRoutes from './routes/finance.route';
import operationsRoutes from './routes/operations.route';
import queriesRoutes from './routes/queries.route';
import academicYearsRoutes from './routes/academic-years.route';
import onboardingRoutes from './routes/onboarding.route';
import rolloverRoutes from './routes/rollover.route';
import plannerRoutes from './routes/planner.route';
import assemblyRoutes from './routes/assembly.route';
import integrationsRoutes from './routes/integrations.route';
import debugRoutes from './routes/debug.route';
import publicRoutes from './routes/public.route';
import examPaperRoutes from './routes/exam-paper.route';

export const router = express.Router();

router.use('/public', publicRoutes);

// Health check with database connectivity
router.get('/health', async (req, res) => {
  const start = Date.now();
  try {
    // Verify Supabase connectivity with a lightweight query
    const { error } = await supabaseAdmin
      .from('schools')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        error: error.message,
        uptime: process.uptime(),
        responseTimeMs: Date.now() - start,
      });
    }

    return res.json({
      status: 'ok',
      database: 'connected',
      uptime: process.uptime(),
      responseTimeMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'degraded',
      database: 'error',
      error: err.message,
      uptime: process.uptime(),
      responseTimeMs: Date.now() - start,
    });
  }
});

// Example placeholder route
router.get('/hello', (req, res) => {
  res.json({ message: 'Hello from backend' });
});

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/parents', parentRoutes);
router.use('/admin', adminRoutes);
router.use('/timetable', timetableRoutes);
router.use('/exams', examRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/fees', feeRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/ai', aiRoutes);
router.use('/payroll', payrollRoutes);
router.use('/canteen', canteenRoutes);
router.use('/transport', transportRoutes);
router.use('/communication', communicationRoutes);
router.use('/lms', lmsRoutes);
router.use('/finance', financeRoutes);
router.use('/ops', operationsRoutes);
router.use('/queries', queriesRoutes);
router.use('/academic-years', academicYearsRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/rollover', rolloverRoutes);
router.use('/planners', plannerRoutes);
router.use('/assemblies', assemblyRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/exam-papers', examPaperRoutes);
router.use('/debug', debugRoutes);
