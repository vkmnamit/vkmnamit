import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Users, Calendar, DollarSign, FileText, MessageSquare,
  BookOpen, Bus, GraduationCap, Package, Trophy, CalendarDays, Coffee,
  BarChart3, Clock, Menu, X, Layers, ChevronLeft, ChevronRight,
  Bot, CreditCard, ClipboardList, Bell, Activity, Tag,
  CalendarRange, BookOpenCheck, Megaphone, Settings, Award, CircleHelp, FileCheck
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const adminMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard/admin' },
    { icon: Users, label: 'Students', path: '/students' },
    { icon: BookOpen, label: 'Teachers', path: '/teachers' },
    { icon: Users, label: 'Parents', path: '/parents' },
    { icon: Calendar, label: 'Attendance', path: '/attendance' },
    { icon: DollarSign, label: 'Fees & Collections', path: '/fees' },
    { icon: Bus, label: 'Transport Routes', path: '/transport' },
    { icon: Package, label: 'Inventory & Distribution', path: '/inventory' },
    { icon: CreditCard, label: 'Payroll Management', path: '/payroll' },
    { icon: ClipboardList, label: 'Assignments', path: '/assignments' },
    { icon: BookOpenCheck, label: 'Homework', path: '/assignments/homework' },
    { icon: FileText, label: 'Exams', path: '/exams' },
    { icon: BookOpen, label: 'Marks Management', path: '/marks-management' },
    { icon: FileCheck, label: 'Exam Paper Templates', path: '/dashboard/exam-templates' },
    { icon: MessageSquare, label: 'Communication', path: '/communication' },
    { icon: Bell, label: 'Queries & Support', path: '/queries' },
    { icon: Clock, label: 'Timetable', path: '/timetable' },
    { icon: Layers, label: 'Classes & Sections', path: '/classes-sections' },
    { icon: Tag, label: 'Subjects', path: '/subjects' },
    { icon: CalendarRange, label: 'Unified Calendar', path: '/academic/calendar' },
    { icon: CalendarRange, label: 'Lecture Planner', path: '/academic/lecture-planner' },
    { icon: BookOpenCheck, label: 'Assessment Planner', path: '/academic/assessment-planner' },
    { icon: Megaphone, label: 'Morning Assembly', path: '/academic/assembly-planner' },
    { icon: CircleHelp, label: 'Setup & Help', path: '/dashboard/onboarding' },
    { icon: Layers, label: 'Academic Setup & Promotions', path: '/dashboard/academic-setup' },
    { icon: Users, label: 'User Management', path: '/users' },
  ];


  const studentMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard/student' },
    { icon: Calendar, label: 'Attendance', path: '/attendance' },
    { icon: ClipboardList, label: 'Assignments', path: '/assignments' },
    { icon: BookOpenCheck, label: 'Homework', path: '/assignments/homework' },
    { icon: FileText, label: 'Exams', path: '/exams' },
    { icon: Award, label: 'Results & Report Cards', path: '/results' },
    { icon: DollarSign, label: 'Fee Status', path: '/fees/status' },
    { icon: Clock, label: 'Timetable', path: '/timetable' },
    { icon: CalendarRange, label: 'Unified Calendar', path: '/academic/calendar' },
    { icon: CalendarRange, label: 'Lecture Planner', path: '/academic/lecture-planner' },
    { icon: BookOpenCheck, label: 'Assessment Planner', path: '/academic/assessment-planner' },
    { icon: Megaphone, label: 'Morning Assembly', path: '/academic/assembly-planner' },
    { icon: Bell, label: 'Queries & Support', path: '/queries' },
  ];

  const teacherMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard/teacher' },
    { icon: Users, label: 'My Students', path: '/students' },
    { icon: Calendar, label: 'Attendance', path: '/attendance' },
    { icon: ClipboardList, label: 'Assignments', path: '/assignments' },
    { icon: BookOpenCheck, label: 'Homework', path: '/assignments/homework' },
    { icon: FileText, label: 'Exams', path: '/exams' },
    { icon: BookOpen, label: 'Marks Management', path: '/exams/marks-entry' },
    { icon: FileText, label: 'Class Reports', path: '/exams/class-reports' },
    { icon: FileCheck, label: 'Create Exam Paper', path: '/teachers/create-exam-paper' },
    { icon: MessageSquare, label: 'Communication', path: '/communication' },
    { icon: Bell, label: 'Queries & Support', path: '/queries' },
    { icon: Clock, label: 'Timetable', path: '/timetable' },
    { icon: CalendarRange, label: 'Unified Calendar', path: '/academic/calendar' },
    { icon: CalendarRange, label: 'Lecture Planner', path: '/academic/lecture-planner' },
  ];

  const parentMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard/parent' },
    { icon: Users, label: 'My Children', path: '/students' },
    { icon: Calendar, label: 'Attendance', path: '/attendance' },
    { icon: Award, label: 'Results & Report Cards', path: '/results' },
    { icon: CalendarRange, label: 'Unified Calendar', path: '/academic/calendar' },
    { icon: CalendarRange, label: 'Lecture Planner', path: '/academic/lecture-planner' },
    { icon: BookOpenCheck, label: 'Assessment Planner', path: '/academic/assessment-planner' },
    { icon: Megaphone, label: 'Morning Assembly', path: '/academic/assembly-planner' },
    { icon: Bell, label: 'Queries & Support', path: '/queries' },
  ];

  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin': return adminMenuItems;
      case 'student': return studentMenuItems;
      case 'teacher': return teacherMenuItems;
      case 'parent': return parentMenuItems;
      default: return adminMenuItems;
    }
  };

  const menuItems = [...getMenuItems(), { icon: Settings, label: 'Settings', path: '/settings' }];
  const dashboardPath = user?.role === 'teacher'
    ? '/dashboard/teacher'
    : user?.role === 'student'
      ? '/dashboard/student'
      : user?.role === 'parent'
        ? '/dashboard/parent'
        : '/dashboard/admin';

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={`bg-slate-950 text-white flex flex-col h-screen sticky top-0 z-50 ${mobile ? 'w-72' : collapsed ? 'w-[72px]' : 'w-64'} transition-all duration-300`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b border-slate-800 ${collapsed && !mobile ? 'px-3' : 'px-5'}`}>
        {(!collapsed || mobile) && (
          <Link to={dashboardPath} onClick={() => mobile && setMobileOpen(false)} aria-label="Go to dashboard" className="flex items-center gap-3 rounded-lg [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-10 w-auto brightness-0 invert" />
            <div>
              <p className="text-[10px] font-medium text-slate-400 capitalize tracking-wider">{user?.role} Portal</p>
            </div>
          </Link>
        )}
        {collapsed && !mobile && (
          <Link to={dashboardPath} aria-label="Go to dashboard" className="rounded-lg [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-8 w-auto brightness-0 invert mx-auto" />
          </Link>
        )}
        {!mobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-7 h-7 rounded-lg items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all flex-shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {mobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-none">
        <div className="space-y-0.5 px-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                title={collapsed && !mobile ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  } ${collapsed && !mobile ? 'justify-center' : ''}`}
              >
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                {(!collapsed || mobile) && (
                  <span className="text-sm font-medium truncate">{item.label}</span>
                )}
                {isActive && (!collapsed || mobile) && (
                  <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full opacity-70" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className={`p-3 border-t border-slate-800 ${collapsed && !mobile ? 'px-2' : 'px-3'}`}>
        {(!collapsed || mobile) && user && (
          <div className="mb-2 px-3 py-2.5 bg-slate-900 rounded-xl">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{user.name || 'Admin'}</p>
              <p className="text-[10px] font-medium text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex h-full">
        <SidebarContent />
      </div>

      {/* Mobile Top Bar */}
      <div className={`lg:hidden fixed top-0 left-0 right-0 z-50 border-b flex items-center justify-between gap-3 px-3 py-3 ${user?.role === 'student' || user?.role === 'parent' ? 'bg-white border-gray-200' : 'bg-slate-950 border-slate-800'}`}>
        <Link to={dashboardPath} aria-label="Go to dashboard" className={`flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${user?.role === 'student' || user?.role === 'parent' ? 'focus-visible:outline-slate-900' : 'focus-visible:outline-white'}`}>
          <img
            src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png"
            alt="Kautix Logo"
            className={`h-8 w-auto max-w-[118px] object-contain flex-shrink-0 ${user?.role === 'student' || user?.role === 'parent' ? 'grayscale brightness-0' : 'brightness-0 invert'}`}
          />
          {(user?.role === 'student' || user?.role === 'parent') && (
            <span className="truncate text-xs font-bold text-gray-800">Kautix Management</span>
          )}
        </Link>
        <div className="relative z-[51] flex flex-shrink-0 items-center gap-2">
          <NotificationBell variant={user?.role === 'student' || user?.role === 'parent' ? 'light' : 'dark'} />
          <button
            onClick={() => setMobileOpen(true)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${user?.role === 'student' || user?.role === 'parent' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 z-[70] transform transition-transform duration-300 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <SidebarContent mobile />
      </div>
    </>
  );
}
