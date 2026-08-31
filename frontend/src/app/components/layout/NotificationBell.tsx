import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Check, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { useNotifications, broadcastNotificationUpdate } from '../../context/NotificationContext';

interface Props {
  variant?: 'light' | 'dark';
  className?: string;
}

export function NotificationBell({ variant = 'light', className = '' }: Props) {
  const navigate = useNavigate();
  const { unreadCount, refresh, pushStatus, enablePushNotifications } = useNotifications();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    }
  };

  useEffect(() => {
    if (open) fetchNotifs();
    const interval = setInterval(() => { if (open) fetchNotifs(); else refresh(); }, 30000);
    return () => clearInterval(interval);
  }, [open, refresh]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener('openNotificationPanel', openPanel);
    return () => window.removeEventListener('openNotificationPanel', openPanel);
  }, []);

  const openNotification = async (n: any) => {
    try {
      await api.markNotificationsRead([n.id]);
      setNotifications(prev => prev.filter(item => item.id !== n.id));
      broadcastNotificationUpdate();
    } catch { /* silent */ }
    refresh();
    setOpen(false);
    if (n.type === 'assignment' || n.source_type === 'assignment') {
      navigate('/assignments');
    } else if (n.type === 'exam' || n.type === 'exam_result') {
      navigate('/exams');
    } else if (n.type === 'timetable' || n.type?.includes('lecture')) {
      navigate('/timetable');
    } else if (n.type === 'enrollment_confirmation' || n.type === 'credentials') {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'teacher') navigate('/dashboard/teacher');
      else navigate('/dashboard/student');
    } else if (n.type?.includes('fee') || n.type === 'payment_receipt') {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'parent') navigate('/dashboard/parent');
      else if (user.role === 'student') navigate('/dashboard/student');
      else navigate('/fees');
      window.dispatchEvent(new Event('refreshFees'));
    } else if (n.type?.includes('query') || n.type === 'communication') {
      navigate('/communication');
    } else if (n.type?.includes('inventory')) {
      navigate('/inventory');
    } else if (n.type?.includes('assembly')) {
      navigate('/assembly');
    } else if (n.type?.includes('attendance')) {
      navigate('/attendance');
    }
  };

  const markOne = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.markNotificationsRead([id]);
      setNotifications(prev => prev.filter(n => n.id !== id));
      broadcastNotificationUpdate();
    } catch { /* silent */ }
    refresh();
  };

  const markAll = async () => {
    if (!notifications.length) return;
    setLoading(true);
    try {
      await api.markNotificationsRead(notifications.map(n => n.id));
      setNotifications([]);
      broadcastNotificationUpdate();
    } finally {
      setLoading(false);
      refresh();
    }
  };

  const btnClass = variant === 'dark'
    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
    : 'bg-gray-100 text-gray-600 hover:bg-gray-200';

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all ${btnClass}`}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-600 rounded-full border-2 border-white text-[9px] flex items-center justify-center font-bold text-white px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute top-16 sm:top-full left-1/2 sm:left-auto -translate-x-1/2 sm:translate-x-0 right-auto sm:right-0 mt-0 sm:mt-2 w-[95vw] sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[100] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <p className="text-sm font-bold text-gray-900">Notifications</p>
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs font-bold text-blue-600" onClick={markAll} loading={loading}>
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark all read'}
              </Button>
            )}
          </div>

          {pushStatus === 'default' && (
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
              <p className="text-xs font-medium text-blue-900">Enable desktop notifications to never miss an update.</p>
              <Button size="sm" onClick={enablePushNotifications} className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0 ml-3">
                Enable
              </Button>
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400 font-medium">No new notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{n.title || n.type || 'Notification'}</p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message || n.body || ''}</p>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                      </p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => markOne(n.id, e)}
                      onKeyDown={(e) => e.key === 'Enter' && markOne(n.id, e as unknown as React.MouseEvent)}
                      className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 hover:bg-emerald-100 text-gray-500 hover:text-emerald-600 flex items-center justify-center"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
