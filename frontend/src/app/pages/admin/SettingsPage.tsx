import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Settings, MessageSquare, User, Bell, LogOut } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';

export function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'communication';
  const [whatsappStatus, setWhatsappStatus] = useState<any>(null);
  const [isMetaSdkReady, setIsMetaSdkReady] = useState(false);
  const [schoolProfile, setSchoolProfile] = useState({
    schoolName: user?.school || '',
    schoolAddress: user?.schoolAddress || '',
    schoolPhone: user?.schoolPhone || '',
    schoolEmail: user?.schoolEmail || '',
    schoolWebsite: user?.schoolWebsite || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const metaAppId = import.meta.env.VITE_META_APP_ID;
  const whatsappConfigId = import.meta.env.VITE_META_WHATSAPP_CONFIG_ID;
  const metaSdkVersion = import.meta.env.VITE_META_SDK_VERSION || 'v19.0';
  const metaSdkUrl = import.meta.env.VITE_META_SDK_URL || 'https://connect.facebook.net/en_US/sdk.js';

  useEffect(() => {
    if (user?.role === 'admin') {
      api.getWhatsAppStatus().then(setWhatsappStatus).catch(() => { });
    }
  }, [user]);

  useEffect(() => {
    setSchoolProfile({
      schoolName: user?.school || '',
      schoolAddress: user?.schoolAddress || '',
      schoolPhone: user?.schoolPhone || '',
      schoolEmail: user?.schoolEmail || '',
      schoolWebsite: user?.schoolWebsite || '',
    });
  }, [user]);

  useEffect(() => {
    if (!metaAppId) return;

    if (window.FB) {
      window.FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: false,
        version: metaSdkVersion,
      });
      setIsMetaSdkReady(true);
      return;
    }

    const existingScript = document.getElementById('meta-jssdk');
    if (existingScript) return;

    const script = document.createElement('script');
    script.id = 'meta-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = metaSdkUrl;

    window.fbAsyncInit = () => {
      if (!window.FB) return;

      window.FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: false,
        version: metaSdkVersion,
      });
      setIsMetaSdkReady(true);
    };

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [metaAppId, metaSdkUrl, metaSdkVersion]);

  const handleSaveSchoolProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await api.updateSchoolProfile(schoolProfile);
      const nextUser = user ? { ...user, school: updated?.name || schoolProfile.schoolName, schoolAddress: updated?.address || schoolProfile.schoolAddress, schoolPhone: updated?.phone || schoolProfile.schoolPhone, schoolEmail: updated?.email || schoolProfile.schoolEmail, schoolWebsite: updated?.website || schoolProfile.schoolWebsite } : user;
      updateUser(nextUser);
      toast.success('School profile updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update school profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleConnectWhatsApp = () => {
    if (!metaAppId || !whatsappConfigId) {
      toast.error('Missing Meta credentials in frontend env. Set VITE_META_APP_ID and VITE_META_WHATSAPP_CONFIG_ID.');
      return;
    }

    if (!window.FB || !isMetaSdkReady) {
      toast.error('Meta SDK is still loading. Please try again in a moment.');
      return;
    }

    window.FB.login((response: any) => {
      if (response?.status === 'connected' || response?.authResponse) {
        toast.success('WhatsApp connection started. Finish the Meta flow in the popup.');
        return;
      }

      if (response?.status === 'unknown' || response?.status === 'not_authorized') {
        toast.error('WhatsApp connection was not completed.');
      }
    }, {
      config_id: whatsappConfigId,
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Platform Settings</h1>
        <p className="text-sm text-gray-500 font-medium mt-1">
          Manage your profile, preferences, and third-party integrations.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="bg-gray-100 p-1 rounded-xl h-auto min-h-[48px] flex flex-wrap sm:flex-nowrap gap-1 w-full sm:w-fit justify-start">
          <TabsTrigger value="profile" className="flex-1 min-w-[120px] h-9 sm:h-10 rounded-lg px-3 sm:px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center justify-center gap-2">
            <User className="w-4 h-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex-1 min-w-[120px] h-9 sm:h-10 rounded-lg px-3 sm:px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center justify-center gap-2">
            <Bell className="w-4 h-4" /> Preferences
          </TabsTrigger>
          {user?.role === 'admin' && (
            <TabsTrigger value="communication" className="flex-1 min-w-[140px] h-9 sm:h-10 rounded-lg px-3 sm:px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center justify-center gap-2">
              <MessageSquare className="w-4 h-4" /> Communication
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="outline-none">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="py-5 px-6 border-b border-gray-50">
              <CardTitle className="text-sm font-bold text-gray-900">User Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                  <p className="text-sm font-medium text-gray-900">{user?.email}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Role</label>
                  <p className="text-sm font-medium text-gray-900 capitalize">{user?.role}</p>
                </div>
                {user?.role === 'admin' && (
                  <div className="pt-5 mt-5 border-t border-gray-100 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">School Name</label>
                        <input value={schoolProfile.schoolName} onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolName: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
                        <input value={schoolProfile.schoolPhone} onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolPhone: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                        <input value={schoolProfile.schoolEmail} onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolEmail: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Website</label>
                        <input value={schoolProfile.schoolWebsite} onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolWebsite: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase">Address</label>
                      <textarea value={schoolProfile.schoolAddress} onChange={(e) => setSchoolProfile({ ...schoolProfile, schoolAddress: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[90px]" />
                    </div>
                    <Button type="button" onClick={handleSaveSchoolProfile} disabled={savingProfile} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {savingProfile ? 'Saving...' : 'Save school profile'}
                    </Button>
                  </div>
                )}
                <div className="pt-5 mt-5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Sign out of this device</p>
                    <p className="text-xs text-gray-500 mt-1">Your current session will be closed on this device.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 w-full sm:w-auto"
                    onClick={logout}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="outline-none">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="py-5 px-6 border-b border-gray-50">
              <CardTitle className="text-sm font-bold text-gray-900">Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-gray-500">Global notification settings will appear here soon.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="communication" className="outline-none">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="py-5 px-6 border-b border-gray-50">
                <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-600" /> WhatsApp Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex flex-shrink-0 items-center justify-center">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm sm:text-base">WhatsApp Business API</h4>
                      <p className="text-xs sm:text-sm text-gray-500">Connect your official WhatsApp Business account.</p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex justify-start sm:justify-end border-t sm:border-0 border-gray-100 pt-3 sm:pt-0">
                    {whatsappStatus?.connected ? (
                      <div className="flex flex-col items-start sm:items-end gap-2 w-full">
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 w-fit">
                          Connected
                        </Badge>
                        <span className="text-[10px] sm:text-xs text-gray-400">Phone ID: {whatsappStatus.phone_number_id}</span>
                      </div>
                    ) : (
                      <Button onClick={handleConnectWhatsApp} className="bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold w-full sm:w-auto">
                        Connect WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
