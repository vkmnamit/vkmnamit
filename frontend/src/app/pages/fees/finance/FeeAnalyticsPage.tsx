import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Users, BarChart2, IndianRupee, AlertCircle, Target } from 'lucide-react';

const fmtShort = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`;
const monthLabel = (key: string) => { const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const [,mo] = key.split('-'); return m[parseInt(mo) - 1] || mo; };

export function FeeAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const d = await api.getFinanceDashboard();
      setData(d);
    } catch { toast.error('Failed to load analytics'); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
    </div>
  );

  const trend = data?.charts?.monthlyTrend || [];
  const maxTrend = Math.max(...trend.map((t: any) => t.amount), 1);
  const classWise = (data?.charts?.classWise || []).sort((a: any, b: any) => b.collected - a.collected);
  const maxClass = Math.max(...classWise.map((c: any) => c.collected), 1);

  // Calculate growth
  const lastTwo = trend.slice(-2);
  const growth = lastTwo.length === 2 && lastTwo[0].amount > 0
    ? Math.round(((lastTwo[1].amount - lastTwo[0].amount) / lastTwo[0].amount) * 100)
    : 0;

  // Top defaulters (classes with low collection rate)
  const defaulterClasses = classWise.filter((c: any) => c.expected > 0)
    .map((c: any) => ({ ...c, rate: Math.round((c.collected / c.expected) * 100) }))
    .filter((c: any) => c.rate < 80)
    .sort((a: any, b: any) => a.rate - b.rate)
    .slice(0, 5);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Fee Analytics</h1>
        <p className="text-sm text-gray-500 font-medium mt-1">Revenue trends, collection analysis & financial insights</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Collection Rate', value: `${data?.cards?.collectionPct || 0}%`, icon: Target, color: 'from-blue-600 to-blue-700', desc: 'vs expected revenue' },
          { label: 'Monthly Growth', value: `${growth >= 0 ? '+' : ''}${growth}%`, icon: growth >= 0 ? TrendingUp : TrendingDown, color: growth >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600', desc: 'vs previous month' },
          { label: 'Outstanding', value: fmtShort(data?.cards?.outstandingAmount || 0), icon: AlertCircle, color: 'from-amber-500 to-amber-600', desc: 'total pending fees' },
          { label: 'Students w/ Dues', value: data?.cards?.studentsWithDue || 0, icon: Users, color: 'from-purple-500 to-purple-600', desc: 'need follow-up' },
        ].map((k, i) => (
          <Card key={i} className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-lg transition-all">
            <CardContent className="p-5">
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${k.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg`}>
                <k.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-black text-gray-900">{k.value}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{k.label}</p>
              <p className="text-xs text-gray-400 font-medium mt-1">{k.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Trend Area Chart */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest">Revenue Collection Trend (6 Months)</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="flex items-end gap-4 h-48 border-b border-l border-gray-100 relative pl-8">
            {/* Y-axis labels */}
            {[0, 25, 50, 75, 100].map(p => (
              <div key={p} className="absolute left-0 text-[9px] font-bold text-gray-300" style={{ bottom: `${p * 1.76}px` }}>
                {fmtShort((maxTrend * p) / 100)}
              </div>
            ))}
            {trend.map((t: any, i: number) => {
              const h = maxTrend > 0 ? Math.max(2, Math.round((t.amount / maxTrend) * 176)) : 2;
              const isLast = i === trend.length - 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group/bar">
                  <div className="relative w-full flex items-end justify-center">
                    {t.amount > 0 && (
                      <div className="absolute -top-6 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-gray-900 text-white text-[9px] font-black px-2 py-0.5 rounded-md whitespace-nowrap">
                        {fmtShort(t.amount)}
                      </div>
                    )}
                    <div className={`w-full rounded-t-lg transition-all ${isLast ? 'bg-blue-600' : 'bg-blue-400 hover:bg-blue-500'}`} style={{ height: h }} />
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 mt-1">{monthLabel(t.month)}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Class-wise collection */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest">Class-wise Collection</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            {classWise.slice(0, 8).map((c: any, i: number) => {
              const pct = c.expected > 0 ? Math.round((c.collected / c.expected) * 100) : 0;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-black text-gray-900">{c.name}</span>
                    <span className="font-bold text-gray-500">{fmtShort(c.collected)} / {fmtShort(c.expected)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[10px] font-black w-8 text-right ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                  </div>
                </div>
              );
            })}
            {classWise.length === 0 && <p className="text-gray-400 text-sm font-bold text-center py-8">No data available</p>}
          </CardContent>
        </Card>

        {/* Low collection classes (defaulters) */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" /> Classes Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {defaulterClasses.length === 0 ? (
              <div className="py-10 text-center">
                <TrendingUp className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                <p className="text-emerald-600 font-bold text-sm">All classes are above 80% collection</p>
              </div>
            ) : defaulterClasses.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-all">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <span className="text-red-600 font-black text-sm">{c.rate}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400 font-medium">{fmtShort(c.collected)} collected of {fmtShort(c.expected)}</p>
                </div>
                <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${c.rate}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
