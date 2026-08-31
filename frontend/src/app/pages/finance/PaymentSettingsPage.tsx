import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ShieldCheck, CreditCard, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

export default function PaymentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    keyId: '',
    keySecret: ''
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await api.getPaymentSettings();
      setSettings({
        keyId: data.razorpay_key_id || '',
        keySecret: data.razorpay_key_secret || ''
      });
    } catch (error) {
      toast.error('Failed to load payment settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updatePaymentSettings(settings);
      toast.success('Payment gateway credentials updated');
    } catch (error) {
      toast.error('Failed to update credentials');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Payment Gateway Setup</h1>
          <p className="text-gray-500 font-medium">Configure your institutional Razorpay credentials</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <Card className="border-none shadow-xl shadow-blue-900/5 overflow-hidden rounded-[32px]">
            <CardHeader className="bg-white border-b border-gray-100 p-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20">
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-gray-900">Razorpay Integration</CardTitle>
                  <CardDescription>Enter your API keys from the Razorpay Dashboard</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 bg-white">
              <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="keyId" className="text-gray-700 font-semibold">Razorpay Key ID</Label>
                  <Input
                    id="keyId"
                    placeholder="rzp_live_..."
                    value={settings.keyId}
                    onChange={(e) => setSettings({ ...settings, keyId: e.target.value })}
                    className="h-12 bg-gray-50 border-gray-200 focus:bg-white rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keySecret" className="text-gray-700 font-semibold">Razorpay Key Secret</Label>
                  <Input
                    id="keySecret"
                    type="password"
                    placeholder="••••••••••••••••"
                    value={settings.keySecret}
                    onChange={(e) => setSettings({ ...settings, keySecret: e.target.value })}
                    className="h-12 bg-gray-50 border-gray-200 focus:bg-white rounded-xl"
                  />
                </div>

                <div className="pt-4">
                  <Button type="submit" loading={saving} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95">
                    {saving ? (
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <Save className="w-5 h-5 mr-2" />
                    )}
                    Save Credentials
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-none shadow-xl shadow-blue-900/5 rounded-[32px] bg-blue-600 text-white">
            <CardContent className="p-8 space-y-4">
              <ShieldCheck className="w-12 h-12 text-blue-200" />
              <h3 className="text-xl font-bold">Secure Integration</h3>
              <p className="text-blue-100 text-sm leading-relaxed">
                Your credentials are encrypted and used only for processing tuition and miscellaneous institutional fees.
              </p>
              <div className="pt-2">
                <Badge className="bg-white/20 hover:bg-white/30 border-none text-white px-3 py-1 rounded-full">
                  PCI-DSS Compliant
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="bg-amber-50 border border-amber-100 p-6 rounded-[24px] flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900 mb-1">Important Note</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Ensure you are using 'Live' keys for production transactions. Test keys will only simulate payments.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
