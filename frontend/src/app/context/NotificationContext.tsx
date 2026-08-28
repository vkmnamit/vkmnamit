import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { api } from '../../lib/api';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  unreadCount: number;
  refresh: () => Promise<void>;
  pushStatus: NotificationPermission | 'unsupported';
  enablePushNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  refresh: async () => { },
  pushStatus: 'default',
  enablePushNotifications: async () => { },
});

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const setupBrowserPush = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    await api.savePushSubscription(existing.toJSON());
    return;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await api.savePushSubscription(subscription.toJSON());
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>('default');
  // Track if a fetch is already in-flight to avoid duplicate calls
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushStatus('unsupported');
      } else {
        setPushStatus(Notification.permission);
      }
    }
  }, []);

  const enablePushNotifications = async () => {
    try {
      if (pushStatus === 'unsupported') return;
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setPushStatus(perm);
      }
      if (perm === 'granted') {
        await setupBrowserPush();
      }
    } catch (err) {
      console.warn('Failed to enable push notifications:', err);
    }
  };

  const refresh = useCallback(async () => {
    if (!isAuthenticated || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await api.getNotificationCount();
      setUnreadCount(typeof data?.count === 'number' ? data.count : 0);
    } catch {
      try {
        const list = await api.getNotifications();
        setUnreadCount(Array.isArray(list) ? list.length : 0);
      } catch {
        setUnreadCount(0);
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }

    // Initial fetch
    refresh();

    // If already granted, set it up silently
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      setupBrowserPush().catch((error) => {
        console.warn('Browser push setup skipped:', error);
      });
    }

    // #6 OPTIMIZATION: Use BroadcastChannel for cross-tab instant sync
    // When any tab marks a notification read or receives one, all tabs update
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('kautix_notifications');
      bc.onmessage = () => refresh();
    } catch {
      // BroadcastChannel not supported in older browsers — graceful fallback
    }

    // Fallback polling at 60s (was 20s — reduced because Realtime handles instant updates)
    const interval = setInterval(refresh, 60_000);

    return () => {
      clearInterval(interval);
      bc?.close();
    };
  }, [isAuthenticated, refresh]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refresh, pushStatus, enablePushNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

// Call this from anywhere after creating/reading a notification so all tabs update instantly
export function broadcastNotificationUpdate() {
  try {
    const bc = new BroadcastChannel('kautix_notifications');
    bc.postMessage({ type: 'refresh' });
    bc.close();
  } catch { /* silent */ }
}
