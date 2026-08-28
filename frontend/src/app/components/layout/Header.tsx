import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Search, Mail, Filter, User, Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu';
import { NotificationBell } from './NotificationBell';
import { api } from '../../../lib/api';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // Other admin-specific header initializations can go here
  }, [user]);

  const [unreadMail, setUnreadMail] = useState(0);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 w-full">
      <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Global search moved to GlobalSearchFAB */}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="relative hover:bg-gray-100 rounded-xl hidden xl:flex">
            <Mail className="w-5 h-5 text-gray-600" />
            {unreadMail > 0 && (
              <Badge className="absolute -top-1 -right-1 px-1.5 min-w-[20px] h-5 bg-blue-600 border-2 border-white">
                {unreadMail}
              </Badge>
            )}
          </Button>

          <NotificationBell variant="light" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-3 focus:outline-none">
              <Avatar className="h-10 w-10 border border-gray-100 shadow-sm">
                <AvatarFallback className="bg-blue-600 text-white font-bold">
                  {user ? getInitials(user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500 font-medium capitalize">{user?.role}</p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2 rounded-xl border-gray-100 shadow-xl p-2 bg-white">
              <div className="px-2 py-2.5 mb-1 bg-gray-50 rounded-lg">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500 font-medium truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator className="bg-gray-100" />
              <DropdownMenuItem onClick={() => navigate('/settings')} className="py-2.5 px-3 rounded-lg text-sm font-medium">
                <User className="w-4 h-4 mr-2 text-gray-500" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings?tab=preferences')} className="py-2.5 px-3 rounded-lg text-sm font-medium">
                <Settings className="w-4 h-4 mr-2 text-gray-500" />
                Preferences
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-100" />
              <DropdownMenuItem
                onClick={logout}
                className="py-2.5 px-3 rounded-lg text-sm font-bold text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
