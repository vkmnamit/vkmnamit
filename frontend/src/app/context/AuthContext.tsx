import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'admin' | 'teacher' | 'parent' | 'student' | 'super_admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  school?: string;
  school_id?: string;
  school_name?: string;
  student_id?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  class?: string;
  section?: string;
}

interface AuthContextType {
  user: User | null;
  login: (loginId: string, password: string, role: UserRole) => void;
  updateUser: (user: User | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  const login = async (loginId: string, password: string, role: UserRole) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
      if (!API_BASE_URL) throw new Error('API URL not configured');
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password, role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      const userData: User = {
        id: data.user.id,
        name: `${data.user.firstName} ${data.user.lastName}`.trim(),
        email: data.user.email,
        role: data.user.role,
        school: data.user.school,
        schoolAddress: data.user.schoolAddress,
        schoolPhone: data.user.schoolPhone,
        schoolEmail: data.user.schoolEmail,
        schoolWebsite: data.user.schoolWebsite,
      };

      updateUser(userData);
      localStorage.setItem('token', data.token);
      localStorage.setItem('lastPath', `/dashboard/${role}`);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  useEffect(() => {
    // On page load, fetch fresh user data from the database so school settings
    // (address, phone, email, website) are always up-to-date, not stale from localStorage.
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
    if (!API_BASE_URL) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
      })
      .then((data) => {
        const dbUser = data?.user;
        if (dbUser) {
          const freshUser: User = {
            id: dbUser.id,
            name: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
            email: dbUser.email,
            role: dbUser.role,
            school: dbUser.schools?.name,
            schoolAddress: dbUser.schools?.address,
            schoolPhone: dbUser.schools?.phone,
            schoolEmail: dbUser.schools?.email,
            schoolWebsite: dbUser.schools?.website,
          };
          updateUser(freshUser);
        }
      })
      .catch(() => {
        // Keep localStorage user if fetch fails (offline, etc.)
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const updateUser = (nextUser: User | null) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem('user', JSON.stringify(nextUser));
    } else {
      localStorage.removeItem('user');
    }
  };

  const logout = () => {
    updateUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('lastPath');
  };

  return (
    <AuthContext.Provider value={{ user, login, updateUser, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
