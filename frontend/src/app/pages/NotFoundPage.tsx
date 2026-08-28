import { useRouteError } from 'react-router';
import { Button } from '../components/ui/button';
import { Link } from 'react-router';
import { Home, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import { useEffect } from 'react';

const dashboardByRole: Record<string, string> = {
  admin: '/dashboard/admin',
  teacher: '/dashboard/teacher',
  student: '/dashboard/student',
  parent: '/dashboard/parent',
};

export function NotFoundPage() {
  const error: any = useRouteError();
  const { user } = useAuth();
  const homePath = dashboardByRole[user?.role || ''] || '/login';

  useEffect(() => {
    if (error?.message?.includes('Failed to fetch dynamically imported module')) {
      const reloaded = sessionStorage.getItem('chunk_failed_reloaded');
      if (!reloaded) {
        sessionStorage.setItem('chunk_failed_reloaded', 'true');
        window.location.reload();
      }
    } else {
      // Clear flag on successful load of other pages
      sessionStorage.removeItem('chunk_failed_reloaded');
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 w-full">
      <div className="max-w-md w-full text-center space-y-6 bg-white p-10 rounded-3xl shadow-xl shadow-blue-900/5 border border-slate-100">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-slate-900 mb-2">404</h1>
          <h2 className="text-xl font-bold text-slate-700">Page Not Found</h2>
          <p className="text-slate-500 mt-3 text-sm">
            {error?.statusText || error?.message || "The module you are looking for doesn't exist or has been moved."}
          </p>
        </div>
        <Link to={homePath} className="block mt-8">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 rounded-xl font-bold shadow-lg shadow-blue-600/20">
            <Home className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
