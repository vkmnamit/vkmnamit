import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { TrendingUp, Users, DollarSign, Award, Download, Calendar, BookOpen } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

export function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState('monthly');

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const stats = await api.getDashboardStats();
      setData(stats);
    } catch (err) {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const attendanceTrends = data?.attendance?.trends || [
    { month: 'Jan', present: 88, absent: 12 },
    { month: 'Feb', present: 90, absent: 10 },
    { month: 'Mar', present: 85, absent: 15 },
    { month: 'Apr', present: 92, absent: 8 },
    { month: 'May', present: 89, absent: 11 },
    { month: 'Jun', present: 94, absent: 6 },
  ];

  const feeCollectionData = data?.fees?.monthlyTrends || [
    { month: 'Jan', collected: 820000, pending: 180000 },
    { month: 'Feb', collected: 850000, pending: 150000 },
    { month: 'Mar', collected: 780000, pending: 220000 },
    { month: 'Apr', collected: 920000, pending: 80000 },
    { month: 'May', collected: 870000, pending: 130000 },
  ];

  const performanceData = [
    { name: 'Excellent (A+)', value: 28, color: '#10b981' },
    { name: 'Good (A)', value: 35, color: '#3b82f6' },
    { name: 'Average (B)', value: 25, color: '#f59e0b' },
    { name: 'Below Avg (C)', value: 12, color: '#ef4444' },
  ];

  const subjectPerformance = [
    { subject: 'Mathematics', avg: 78, passRate: 92 },
    { subject: 'Science', avg: 82, passRate: 95 },
    { subject: 'English', avg: 85, passRate: 97 },
    { subject: 'Social Studies', avg: 79, passRate: 94 },
    { subject: 'Hindi', avg: 88, passRate: 98 },
  ];

  const kpis = [
    { label: 'Total Students', value: data?.students?.total ?? '—', sub: '+8% vs last year', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', trend: 'up' },
    { label: 'Fee Collection', value: `₹${((data?.fees?.collected ?? 0) / 100000).toFixed(1)}L`, sub: `${data?.fees?.rate ?? 0}% collected`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', trend: 'up' },
    { label: 'Attendance Rate', value: `${data?.attendance?.rate ?? 0}%`, sub: 'Current month', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100', trend: 'up' },
    { label: 'Total Teachers', value: data?.teachers?.total ?? '—', sub: 'Active faculty', icon: BookOpen, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', trend: 'stable' },
  ];

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analytics & Insights</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Comprehensive performance and financial metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-10 w-36 rounded-xl border-gray-200 font-medium text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">This Week</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
              <SelectItem value="yearly">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-blue-600 hover:bg-blue-700 h-10 px-5 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-xs">
            <Download className="w-4 h-4 mr-2" /> Export Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="border-none shadow-sm bg-white overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 ${kpi.bg} rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${kpi.color}`} />
                  </div>
                  <Badge className={`text-[10px] font-bold border-none px-2 py-0.5 ${kpi.trend === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                    {kpi.trend === 'up' ? '▲' : '—'}
                  </Badge>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 mb-1">{kpi.value}</p>
                <p className="text-[11px] font-medium text-gray-400">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-gray-50">
            <CardTitle className="text-sm font-bold text-gray-900">Attendance Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={attendanceTrends}>
                <defs>
                  <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', fontFamily: 'Inter', fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Area type="monotone" dataKey="present" stroke="#3b82f6" strokeWidth={2.5} fill="url(#presentGrad)" name="Present %" dot={{ r: 4, fill: '#3b82f6' }} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} name="Absent %" dot={{ r: 3, fill: '#ef4444' }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-gray-50">
            <CardTitle className="text-sm font-bold text-gray-900">Performance Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="55%" height={240}>
                <PieChart>
                  <Pie data={performanceData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {performanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '10px', fontSize: 11, fontFamily: 'Inter' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {performanceData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-xs font-medium text-gray-600">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-gray-50">
            <CardTitle className="text-sm font-bold text-gray-900">Fee Collection vs. Target</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={feeCollectionData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ borderRadius: '10px', fontSize: 12, fontFamily: 'Inter' }} formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, '']} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar dataKey="collected" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Collected" />
                <Bar dataKey="pending" fill="#fca5a5" radius={[6, 6, 0, 0]} name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-gray-50">
            <CardTitle className="text-sm font-bold text-gray-900">Subject-wise Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {subjectPerformance.map((s) => (
                <div key={s.subject}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-700">{s.subject}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-400">Avg: {s.avg}%</span>
                      <span className="text-[10px] font-bold text-emerald-600">Pass: {s.passRate}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-50 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${s.avg}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
