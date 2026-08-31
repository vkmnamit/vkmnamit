import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { ChatBot } from '../components/ai/ChatBot';
import { SetupGuideModal } from '../components/onboarding/SetupGuide';
import { useEffect } from 'react';

export function DashboardLayout() {
  const { isAuthenticated, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login', { state: { from: location } });
    } else if (isAuthenticated) {
      localStorage.setItem('lastPath', location.pathname);
    }
  }, [isAuthenticated, loading, navigate, location]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const isStudentOrParent = user?.role === 'student' || user?.role === 'parent';

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="hidden lg:block">
          <Header />
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full pt-20 lg:pt-6 pb-32 page-shell">
          <div className="min-h-full w-full min-w-0 p-3 sm:p-4 lg:p-6 pb-0">
            <Outlet />
          </div>
        </main>
      </div>

      <ChatBot />
      <SetupGuideModal />
    </div>
  );
}
