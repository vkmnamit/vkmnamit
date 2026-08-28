import { Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';

export function DashboardIndex() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  switch (user.role) {
    case 'admin':
      return <Navigate to="/dashboard/admin" replace />;
    case 'teacher':
      return <Navigate to="/dashboard/teacher" replace />;
    case 'student':
      return <Navigate to="/dashboard/student" replace />;
    case 'parent':
      return <Navigate to="/dashboard/parent" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
