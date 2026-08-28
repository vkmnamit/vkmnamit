import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { DashboardLayout } from './layouts/DashboardLayout';

// ── Lazy-loaded pages (code-split per route) ──────────────────────────────────
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage').then(m => ({ default: m.FeaturesPage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then(m => ({ default: m.ServicesPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then(m => ({ default: m.ContactPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const ModuleDetailsPage = lazy(() => import('./pages/modules/ModuleDetailsPage').then(m => ({ default: m.ModuleDetailsPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const AdminDashboard = lazy(() => import('./pages/dashboards/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const StudentDashboard = lazy(() => import('./pages/dashboards/StudentDashboard').then(m => ({ default: m.StudentDashboard })));
const ParentDashboard = lazy(() => import('./pages/dashboards/ParentDashboard').then(m => ({ default: m.ParentDashboard })));
const TeacherDashboard = lazy(() => import('./pages/dashboards/TeacherDashboard').then(m => ({ default: m.TeacherDashboard })));
const DashboardIndex = lazy(() => import('./pages/dashboards/DashboardIndex').then(m => ({ default: m.DashboardIndex })));
const StudentsPage = lazy(() => import('./pages/students/StudentsPage').then(m => ({ default: m.StudentsPage })));
const StudentProfilePage = lazy(() => import('./pages/students/StudentProfilePage').then(m => ({ default: m.StudentProfilePage })));
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage').then(m => ({ default: m.AttendancePage })));
const FeesPage = lazy(() => import('./pages/fees/FeesPage').then(m => ({ default: m.FeesPage })));
const FinanceLayout = lazy(() => import('./pages/fees/finance/FinanceLayout').then(m => ({ default: m.FinanceLayout })));
const FinanceDashboard = lazy(() => import('./pages/fees/finance/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })));
const FeePastDuesPage = lazy(() => import('./pages/fees/finance/FeePastDuesPage').then(m => ({ default: m.FeePastDuesPage })));
const FeeCategoriesPage = lazy(() => import('./pages/fees/finance/FeeCategoriesPage').then(m => ({ default: m.FeeCategoriesPage })));
const FeeDiscountsPage = lazy(() => import('./pages/fees/finance/FeeDiscountsPage').then(m => ({ default: m.FeeDiscountsPage })));
const FeeExemptionsPage = lazy(() => import('./pages/fees/finance/FeeExemptionsPage').then(m => ({ default: m.FeeExemptionsPage })));
const FeeFinesPage = lazy(() => import('./pages/fees/finance/FeeFinesPage').then(m => ({ default: m.FeeFinesPage })));
const FeeRefundsPage = lazy(() => import('./pages/fees/finance/FeeRefundsPage').then(m => ({ default: m.FeeRefundsPage })));
const FeeAnalyticsPage = lazy(() => import('./pages/fees/finance/FeeAnalyticsPage').then(m => ({ default: m.FeeAnalyticsPage })));
const FeeReportsPage = lazy(() => import('./pages/fees/finance/FeeReportsPage').then(m => ({ default: m.FeeReportsPage })));
const FeeBulkPage = lazy(() => import('./pages/fees/finance/FeeBulkPage').then(m => ({ default: m.FeeBulkPage })));
const StudentFeePage = lazy(() => import('./pages/fees/StudentFeePage').then(m => ({ default: m.StudentFeePage })));
const ExamsPage = lazy(() => import('./pages/exams/ExamsPage').then(m => ({ default: m.ExamsPage })));
const MarksManagementPage = lazy(() => import('./pages/exams/MarksManagementPage').then(m => ({ default: m.MarksManagementPage })));
const StudentResultsPage = lazy(() => import('./pages/academic/StudentResultsPage').then(m => ({ default: m.StudentResultsPage })));
const ReportCardPage = lazy(() => import('./pages/academic/ReportCardPage').then(m => ({ default: m.ReportCardPage })));
const CommunicationPage = lazy(() => import('./pages/communication/CommunicationPage').then(m => ({ default: m.CommunicationPage })));
const QueriesPage = lazy(() => import('./pages/communication/QueriesPage').then(m => ({ default: m.QueriesPage })));
const TeachersPage = lazy(() => import('./pages/teachers/TeachersPage').then(m => ({ default: m.TeachersPage })));
const TeacherProfilePage = lazy(() => import('./pages/teachers/TeacherProfilePage').then(m => ({ default: m.TeacherProfilePage })));
const TimetablePage = lazy(() => import('./pages/timetable/TimetablePage').then(m => ({ default: m.TimetablePage })));
const ParentsPage = lazy(() => import('./pages/parents/ParentsPage').then(m => ({ default: m.ParentsPage })));
const ParentProfilePage = lazy(() => import('./pages/parents/ParentProfilePage').then(m => ({ default: m.ParentProfilePage })));
const FinancePage = lazy(() => import('./pages/finance/FinancePage').then(m => ({ default: m.FinancePage })));
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage').then(m => ({ default: m.PayrollPage })));
const UserManagementPage = lazy(() => import('./pages/admin/users/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const SchoolOnboarding = lazy(() => import('./pages/admin/SchoolOnboarding'));
const ClassesPage = lazy(() => import('./pages/admin/ClassesPage'));
const AssignmentManagementPage = lazy(() => import('./pages/lms/AssignmentManagementPage').then(m => ({ default: m.AssignmentManagementPage })));
const HomeworkManagementPage = lazy(() => import('./pages/lms/HomeworkManagementPage').then(m => ({ default: m.HomeworkManagementPage })));
const SubjectsPage = lazy(() => import('./pages/admin/SubjectsPage'));
const LecturePlannerPage = lazy(() => import('./pages/academic/LecturePlannerPage'));
const AssessmentPlannerPage = lazy(() => import('./pages/academic/AssessmentPlannerPage'));
const AssemblyPlannerPage = lazy(() => import('./pages/academic/AssemblyPlannerPage'));
const UnifiedCalendarPage = lazy(() => import('./pages/academic/UnifiedCalendarPage'));
const InventoryHub = lazy(() => import('./pages/inventory/InventoryHub').then(m => ({ default: m.InventoryHub })));
const TransportRoutesPage = lazy(() => import('./pages/transport/TransportRoutesPage').then(m => ({ default: m.TransportRoutesPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const AcademicYearsPage = lazy(() => import('./pages/admin/AcademicYearsPage'));
const ExamTemplatesPage = lazy(() => import('./pages/admin/ExamTemplatesPage').then(m => ({ default: m.ExamTemplatesPage })));
const ExamPaperCreationPage = lazy(() => import('./pages/teachers/SimpleExamPaperCreator').then(m => ({ default: m.SimpleExamPaperCreator })));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));

// Shared page-level loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500 font-medium">Loading...</p>
    </div>
  </div>
);

// Wrap element in Suspense
const S = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;


export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      {
        path: 'about',
        element: <AboutPage />,
      },
      {
        path: 'features',
        element: <FeaturesPage />,
      },
      {
        path: 'services',
        element: <ServicesPage />,
      },
      {
        path: 'contact',
        element: <ContactPage />,
      },
      {
        path: 'legal',
        element: <LegalPage />,
      },
      {
        path: 'privacy-policy',
        element: <LegalPage document="privacy" />,
      },
      {
        path: 'terms-and-conditions',
        element: <LegalPage document="terms" />,
      },
      {
        path: 'terms',
        element: <LegalPage document="terms" />,
      },
      {
        path: 'data-deletion',
        element: <LegalPage document="deletion" />,
      },
      {
        path: 'modules/:moduleId',
        element: <ModuleDetailsPage />,
      },
      {
        path: 'dashboard',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: <DashboardIndex />,
          },
          {
            path: 'admin',
            element: <AdminDashboard />,
          },
          {
            path: 'student',
            element: <StudentDashboard />,
          },
          {
            path: 'parent',
            element: S(<ParentDashboard />),
          },
          {
            path: 'teacher',
            element: S(<TeacherDashboard />),
          },
          {
            path: 'onboarding',
            element: S(<SchoolOnboarding />),
          },
          {
            path: 'academic-setup',
            element: S(<AcademicYearsPage />),
          },
          {
            path: 'settings',
            element: S(<SettingsPage />),
          },
          {
            path: 'exam-templates',
            element: S(<ExamTemplatesPage />),
          },
        ],
      },
      {
        path: 'classes-sections',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<ClassesPage />),
          },
        ],
      },

      {
        path: 'students',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<StudentsPage />),
          },
          {
            path: ':id',
            element: S(<StudentProfilePage />),
          },
        ],
      },
      {
        path: 'attendance',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<AttendancePage />),
          },
        ],
      },
      {
        path: 'timetable',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<TimetablePage />),
          },
        ],
      },
      {
        path: 'fees',
        element: <DashboardLayout />,
        children: [
          {
            path: 'status',
            element: S(<StudentFeePage />),
          },
          {
            element: S(<FinanceLayout />),
            children: [
              { index: true, element: S(<FinanceDashboard />) },
              { path: 'register', element: S(<FeesPage />) },
              { path: 'past-dues', element: S(<FeePastDuesPage />) },
              { path: 'structures', element: S(<FeesPage />) },
              { path: 'categories', element: S(<FeeCategoriesPage />) },
              { path: 'payments', element: S(<FeesPage />) },
              { path: 'discounts', element: S(<FeeDiscountsPage />) },
              { path: 'exemptions', element: S(<FeeExemptionsPage />) },
              { path: 'fines', element: S(<FeeFinesPage />) },
              { path: 'refunds', element: S(<FeeRefundsPage />) },
              { path: 'bulk', element: S(<FeeBulkPage />) },
              { path: 'reports', element: S(<FeeReportsPage />) },
              { path: 'analytics', element: S(<FeeAnalyticsPage />) },
            ],
          },
        ],
      },
      {
        path: 'finance',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<FinancePage />),
          },
        ],
      },
      {
        path: 'payroll',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<PayrollPage />),
          },
        ],
      },
      {
        path: 'exams',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<ExamsPage />),
          },
        ],
      },
      {
        path: 'marks-management',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<MarksManagementPage />),
          },
        ],
      },
      {
        path: 'results',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<StudentResultsPage />),
          },
        ],
      },
      {
        path: 'report-card',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<ReportCardPage />),
          },
        ],
      },
      {
        path: 'communication',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<CommunicationPage />),
          },
        ],
      },
      {
        path: 'queries',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<QueriesPage />),
          },
        ],
      },
      {
        path: 'teachers',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<TeachersPage />),
          },
          {
            path: ':id',
            element: S(<TeacherProfilePage />),
          },
          {
            path: 'create-exam-paper',
            element: S(<ExamPaperCreationPage />),
          },
        ],
      },
      {
        path: 'parents',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<ParentsPage />),
          },
          {
            path: ':id',
            element: S(<ParentProfilePage />),
          },
        ],
      },
      {
        path: 'timetable',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<TimetablePage />),
          },
        ],
      },
      {
        path: 'assignments',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<AssignmentManagementPage />),
          },
          {
            path: 'homework',
            element: S(<HomeworkManagementPage />),
          },
        ],
      },
      {
        path: 'subjects',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<SubjectsPage />),
          },
        ],
      },
      {
        path: 'academic',
        element: <DashboardLayout />,
        children: [
          {
            path: 'lecture-planner',
            element: S(<LecturePlannerPage />),
          },
          {
            path: 'assessment-planner',
            element: S(<AssessmentPlannerPage />),
          },
          {
            path: 'assembly-planner',
            element: S(<AssemblyPlannerPage />),
          },
          {
            path: 'calendar',
            element: S(<UnifiedCalendarPage />),
          },
        ],
      },
      {
        path: 'inventory',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<InventoryHub />),
          },
        ],
      },
      {
        path: 'transport',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<TransportRoutesPage />),
          },
        ],
      },
      {
        path: 'settings',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<SettingsPage />),
          },
        ],
      },
      {
        path: 'users',
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: S(<UserManagementPage />),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
