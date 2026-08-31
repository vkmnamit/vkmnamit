import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import {
  IndianRupee, TrendingUp, TrendingDown, Users, Percent, AlertCircle,
  Zap, Bell, Download, Plus, RefreshCw, BarChart3, ArrowUpRight
} from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtShort = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`;

export function FinanceDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const d = await api.getFinanceDashboard();
      setData(d);
    } catch { toast.error('Failed to load finance dashboard'); }
    finally { setLoading(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await api.syncFeeDues(); toast.success('Dues synced'); fetchDashboard(); }
    catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  const handleSendReminders = async () => {
    try { await api.sendFeeReminders(); toast.success('Reminders sent to all pending students'); }
    catch { toast.error('Failed to send reminders'); }
  };

  const cards = data ? [
    { label: "Today's Collection", value: fmtShort(data.cards.todayCollection), icon: IndianRupee, color: 'from-blue-600 to-blue-700', change: data.cards.todayGrowth || '+0%', positive: !(data.cards.todayGrowth || '').startsWith('-'), link: '/fees' },
    { label: 'Monthly Collection', value: fmtShort(data.cards.monthlyCollection), icon: TrendingUp, color: 'from-emerald-500 to-emerald-600', change: data.cards.monthlyGrowth || '+0%', positive: !(data.cards.monthlyGrowth || '').startsWith('-'), link: '/fees' },
    { label: 'Pending Fees', value: fmtShort(data.cards.totalPending), icon: AlertCircle, color: 'from-amber-500 to-amber-600', change: '', positive: false, link: '/fees?status=pending' },
    { label: 'Overdue Fees', value: fmtShort(data.cards.totalOverdue), icon: TrendingDown, color: 'from-red-500 to-red-600', change: '', positive: false, link: '/fees?status=overdue' },
    { label: 'Students w/ Dues', value: data.cards.studentsWithDue, icon: Users, color: 'from-purple-500 to-purple-600', change: '', positive: false, link: '/fees?status=pending' },
    { label: 'Total Discounts', value: fmtShort(data.cards.totalDiscounts), icon: Percent, color: 'from-cyan-500 to-cyan-600', change: '', positive: true, link: '/fees/discounts' },
    { label: 'Total Fines', value: fmtShort(data.cards.totalFines), icon: AlertCircle, color: 'from-orange-500 to-orange-600', change: '', positive: false, link: '/fees/fines' },
    { label: 'Collection %', value: `${data.cards.collectionPct}%`, icon: BarChart3, color: 'from-indigo-500 to-indigo-600', change: '', positive: true, link: '/fees' },
    { label: 'Expected Revenue', value: fmtShort(data.cards.expectedRevenue), icon: IndianRupee, color: 'from-teal-500 to-teal-600', change: '', positive: true, link: '/fees' },
    { label: 'Outstanding', value: fmtShort(data.cards.outstandingAmount), icon: TrendingDown, color: 'from-rose-500 to-rose-600', change: '', positive: false, link: '/fees' },
  ] : [];

  if (loading) return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    </div>
  );

  const maxTrend = Math.max(...(data?.charts?.monthlyTrend || []).map((t: any) => t.amount), 1);
  const maxClass = Math.max(...(data?.charts?.classWise || []).map((c: any) => c.expected), 1);
  const totalMethods = (data?.charts?.paymentMethods || []).reduce((s: number, m: any) => s + m.amount, 0) || 1;
  const methodColors: Record<string, string> = { cash: '#3b82f6', upi: '#10b981', card: '#8b5cf6', bank: '#f59e0b', cheque: '#6b7280', online: '#06b6d4' };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Finance Dashboard</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Complete fee management overview</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-xl font-bold text-xs" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Sync Dues
            </Button>
            <Button size="sm" className="h-9 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={handleSendReminders}>
              <Bell className="w-3.5 h-3.5 mr-1.5" /> Send Reminders
            </Button>
            <Button size="sm" className="h-9 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700" onClick={() => navigate('/fees/register')}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Generate Fee
            </Button>
          </div>
        )}
      </div>

      {/* 10 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {cards.map((card, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-lg transition-all group bg-white overflow-hidden cursor-pointer" onClick={() => navigate(card.link)}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-xl font-black text-gray-900">{card.value}</p>
              {card.change && (
                <p className={`text-[10px] font-bold mt-1 flex items-center gap-0.5 ${card.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                  <ArrowUpRight className="w-2.5 h-2.5" />{card.change} vs last month
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Monthly Revenue Trend */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest">Monthly Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-end gap-2 h-40">
              {(data?.charts?.monthlyTrend || []).map((t: any, i: number) => {
                const h = maxTrend > 0 ? Math.max(4, Math.round((t.amount / maxTrend) * 140)) : 4;
                const label = t.month?.slice(5) || '';
                const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group/bar">
                    <p className="text-[9px] font-black text-gray-500 opacity-0 group-hover/bar:opacity-100 transition-opacity">{fmtShort(t.amount)}</p>
                    <div className="w-full relative">
                      <div className="w-full bg-blue-600 rounded-t-lg transition-all hover:bg-blue-700 cursor-default" style={{ height: h }} />
                    </div>
                    <p className="text-[9px] font-bold text-gray-400">{months[parseInt(label)] || label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Distribution */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {(data?.charts?.paymentMethods || []).length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-gray-400 text-xs font-bold uppercase">No payments today</p>
              </div>
            ) : (data?.charts?.paymentMethods || []).map((m: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="capitalize text-gray-700">{m.method}</span>
                  <span className="text-gray-500">{Math.round((m.amount / totalMethods) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(m.amount / totalMethods) * 100}%`, backgroundColor: methodColors[m.method] || '#6b7280' }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Class-wise Collection */}
      {(data?.charts?.classWise || []).length > 0 && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest">Class-wise Collection</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {(data?.charts?.classWise || []).slice(0, 8).map((c: any, i: number) => {
              const pct = c.expected > 0 ? Math.round((c.collected / c.expected) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-20 shrink-0">
                    <p className="text-xs font-black text-gray-900 truncate">{c.name}</p>
                  </div>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <p className="text-xs font-black text-gray-900">{fmtShort(c.collected)}</p>
                    <p className="text-[9px] text-gray-400 font-bold">{pct}% of {fmtShort(c.expected)}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      {isAdmin && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
              <Zap className="w-4 h-4" /> Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Generate Fee', icon: Plus, path: '/fees/register', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
              { label: 'Add Extra Fee', icon: Plus, path: '/fees/register', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
              { label: 'Apply Discount', icon: Percent, path: '/fees/discounts', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
              { label: 'Add Fine', icon: AlertCircle, path: '/fees/fines', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
              { label: 'Send Reminder', icon: Bell, action: handleSendReminders, color: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
              { label: 'View Reports', icon: BarChart3, path: '/fees/reports', color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
            ].map((qa, i) => (
              <button key={i} onClick={qa.action || (() => navigate(qa.path!))}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl font-bold text-xs transition-all ${qa.color}`}>
                <qa.icon className="w-5 h-5" />
                {qa.label}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
