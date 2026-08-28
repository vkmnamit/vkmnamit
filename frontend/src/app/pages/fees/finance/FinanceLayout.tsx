import { NavLink, Outlet, useLocation, Navigate } from 'react-router';
import { BarChart3, FileText, Layers, Tag, CreditCard, Receipt, Percent, ShieldBan, AlertTriangle, RefreshCw, Package, BarChart2, TrendingUp, Settings2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '../../../../lib/utils';

const navItems = [
  { icon: BarChart3, label: 'Dashboard', path: '/fees', exact: true },
  { icon: FileText, label: 'Fee Register', path: '/fees/register' },
  { icon: Receipt, label: 'Past Dues Upload', path: '/fees/past-dues' },
  { icon: Layers, label: 'Structures', path: '/fees/structures' },
  { icon: Tag, label: 'Categories', path: '/fees/categories' },
  { icon: CreditCard, label: 'Payments', path: '/fees/payments' },
  { icon: Percent, label: 'Discounts', path: '/fees/discounts' },
  { icon: ShieldBan, label: 'Exemptions', path: '/fees/exemptions' },
  { icon: AlertTriangle, label: 'Fines', path: '/fees/fines' },
  { icon: RefreshCw, label: 'Refunds', path: '/fees/refunds' },
  { icon: Package, label: 'Bulk Ops', path: '/fees/bulk' },
  { icon: BarChart2, label: 'Reports', path: '/fees/reports' },
  { icon: TrendingUp, label: 'Analytics', path: '/fees/analytics' },
];

export function FinanceLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  if (user?.role === 'parent') return <Navigate to="/dashboard/parent" replace />;
  if (user?.role === 'student') return <Navigate to="/dashboard/student" replace />;

  return (
    <div className="flex flex-col min-h-full">
      {/* Top scroll nav for all screen sizes */}
      <div className="flex gap-1 py-2 mb-6 border-b border-gray-100 overflow-x-auto bg-white/50 px-2 rounded-xl mobile-edge">
        {navItems.map(({ icon: Icon, label, path, exact }) => {
          if (!isAdmin && ['/fees/discounts', '/fees/exemptions', '/fees/fines', '/fees/refunds', '/fees/bulk', '/fees/structures', '/fees/categories'].includes(path)) return null;
          
          const active = exact ? location.pathname === path : location.pathname.startsWith(path) && path !== '/fees';
          const dashActive = path === '/fees' && location.pathname === '/fees';
          const isActive = active || dashActive;

          return (
            <NavLink key={path} to={path} end={exact}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all',
                isActive ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              )}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          );
        })}
      </div>

      <div className="flex-1 w-full max-w-full">
        <Outlet />
      </div>
    </div>
  );
}
