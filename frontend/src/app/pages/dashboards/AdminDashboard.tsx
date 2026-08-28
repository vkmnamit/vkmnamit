import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { api } from '../../../lib/api';
import { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  DollarSign,
  Calendar,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Library,
  GraduationCap,
  Activity,
  Settings,
  CreditCard,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

type DashboardData = {
  students: { total: number; growth?: string };
  teachers: { total: number; growth?: string };
  fees: { collected: number; pending: number; growth?: string };
  attendance: {
    rate: number;
    growth?: string;
    trends: { month: string; present: number; absent: number }[];
  };
};

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [academicStats, setAcademicStats] = useState<any>(null);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState('');

  useEffect(() => {
    fetchStats();
    api.getAcademicYears().then(years => {
      setAcademicYears(years);
      const current = years.find((y: any) => y.is_current);
      if (current) setSelectedYear(current.id);
      else if (years.length > 0) setSelectedYear(years[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    api.getAcademicYearStats(selectedYear)
      .then(res => setAcademicStats(res))
      .catch(() => setAcademicStats(null));
  }, [selectedYear]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const statsData = await api.getDashboardStats();
      setData(statsData);
    } catch (err) {
      console.error('Failed to fetch dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-[400px] w-full rounded-2xl" />
          <Skeleton className="h-[400px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Active Students',
      value: data?.students?.total ?? 0,
      change: data?.students?.growth || '+0%',
      trend: (data?.students?.growth || '').startsWith('-') ? 'down' : 'up',
      icon: GraduationCap,
      color: 'bg-blue-600',
      shadow: 'shadow-blue-600/20'
    },
    {
      title: 'Total Faculty',
      value: data?.teachers?.total ?? 0,
      change: data?.teachers?.growth || '+0%',
      trend: (data?.teachers?.growth || '').startsWith('-') ? 'down' : 'up',
      icon: Users,
      color: 'bg-emerald-600',
      shadow: 'shadow-emerald-600/20'
    },
    {
      title: 'Revenue (AY 26)',
      value: data?.fees?.collected !== undefined ? `₹${(data.fees.collected / 100000).toFixed(2)}L` : '₹0.00L',
      change: data?.fees?.growth || '+0%',
      trend: (data?.fees?.growth || '').startsWith('-') ? 'down' : 'up',
      icon: DollarSign,
      color: 'bg-amber-600',
      shadow: 'shadow-amber-600/20'
    },
    {
      title: 'Total Payable',
      value: data?.fees?.pending !== undefined ? `₹${(data.fees.pending / 100000).toFixed(2)}L` : '₹0.00L',
      change: 'Pending',
      trend: 'up',
      icon: CreditCard,
      color: 'bg-red-600',
      shadow: 'shadow-red-600/20'
    },
  ];

  const attendanceData = data?.attendance?.trends?.length > 0 ? data.attendance.trends : [
    { month: 'Jan', present: 0, absent: 0 },
    { month: 'Feb', present: 0, absent: 0 },
    { month: 'Mar', present: 0, absent: 0 },
    { month: 'Apr', present: 0, absent: 0 },
    { month: 'May', present: 0, absent: 0 },
  ];

  const feeData = [
    { name: 'Collected', value: data?.fees?.collected || 0, color: '#2563eb' },
    { name: 'Pending', value: data?.fees?.pending || 0, color: '#ef4444' },
  ];

  return (
    <div className="space-y-10 pb-16">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-blue-50 text-blue-700 border-none px-2 py-0.5 font-medium text-xs">
              {academicYears.find(y => y.is_current)?.name ? `Academic Year: ${academicYears.find(y => y.is_current)?.name}` : 'Operational Hub'}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/settings">
            <Button variant="outline" className="rounded-lg font-medium h-10 px-4 border-gray-200 text-sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </Link>
          <Button
            variant="outline"
            className="bg-white hover:bg-gray-50 border-gray-200 rounded-lg font-medium h-10 px-4 text-sm text-gray-700 shadow-sm"
            onClick={() => toast.info('We are working on it!')}
          >
            <CreditCard className="w-4 h-4 mr-2 text-blue-600" />
            Setup Payment Gateway
          </Button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-none shadow-sm hover:shadow-md transition-all duration-200 bg-white rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center shadow-sm`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <Badge className={`rounded-md px-2 py-1 text-xs font-semibold ${stat.trend === 'up' ? 'bg-green-50 text-green-700 border-none' : 'bg-red-50 text-red-700 border-none'}`}>
                    {stat.trend === 'up' ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
                    {stat.change}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Academic Year Insights */}
        <Card className="lg:col-span-3 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-6 border-b border-gray-50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Academic Year Insights
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">Overview of sections, students, and fees.</p>
            </div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none font-medium"
            >
              {academicYears.map(year => (
                <option key={year.id} value={year.id}>
                  {year.name} {year.is_current ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent className="p-6">
            {!academicStats ? (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm animate-pulse">Loading insights...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100/50">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                      <Library className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700">Total Sections</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-900 mt-2">{academicStats.totalSections}</p>
                </div>

                <div className="bg-emerald-50/50 p-6 rounded-xl border border-emerald-100/50">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700">Fees Collected</p>
                  </div>
                  <p className="text-2xl font-bold text-emerald-900 mt-2">
                    ₹{academicStats.fees?.collected?.toLocaleString() || 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Out of ₹{academicStats.fees?.total?.toLocaleString() || 0} expected</p>
                </div>

                <div className="bg-orange-50/50 p-6 rounded-xl border border-orange-100/50">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Students by Section</p>
                  <div className="space-y-2 max-h-[100px] overflow-y-auto pr-2">
                    {academicStats.studentsBySection?.length > 0 ? academicStats.studentsBySection.map((s: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{s.section}</span>
                        <span className="font-semibold text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-100">{s.count}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-gray-400">No students mapped yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Power Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
          <CardHeader className="p-6 border-b border-gray-50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-gray-900">Academic Setup</CardTitle>
            <Layers className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {[
              { label: 'Classes & Sections', path: '/classes-sections' },
              { label: 'Subject Registry', path: '/subjects' },
              { label: 'Timetable Matrix', path: '/timetable' },
              { label: 'Examination Blocks', path: '/exams' }
            ].map((link, idx) => (
              <Link key={idx} to={link.path} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-300 transition-all">
                <span className="text-sm font-medium text-gray-700">{link.label}</span>
                <ArrowUp className="w-3 h-3 text-gray-400 rotate-45" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
          <CardHeader className="p-6 border-b border-gray-50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-gray-900">Finance & Fees</CardTitle>
            <CreditCard className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {[
              { label: 'Fee Structures', path: '/fees' },
              { label: 'Collections', path: '/fees' },
              { label: 'Payment Gateway', path: '/finance' },
              { label: 'Transaction Audit', path: '/fees' }
            ].map((link, idx) => (
              <Link key={idx} to={link.path} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-300 transition-all">
                <span className="text-sm font-medium text-gray-700">{link.label}</span>
                <ArrowUp className="w-3 h-3 text-gray-400 rotate-45" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
          <CardHeader className="p-6 border-b border-gray-50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-gray-900">User Management</CardTitle>
            <Users className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {[
              { label: 'Student Directory', path: '/students' },
              { label: 'Faculty Registry', path: '/teachers' },
              { label: 'Guardian Node Links', path: '/parents' },
              { label: 'RBAC Access Logs', path: '/fees' }
            ].map((link, idx) => (
              <Link key={idx} to={link.path} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-300 transition-all">
                <span className="text-sm font-medium text-gray-700">{link.label}</span>
                <ArrowUp className="w-3 h-3 text-gray-400 rotate-45" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Global Communication Hub */}
      {/* Global Communication Hub */}
      <Card className="border border-blue-200 shadow-sm bg-white text-gray-900 rounded-2xl overflow-hidden">
        <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Mass Communication Engine</h2>
            <p className="text-blue-600 font-medium text-sm mt-1">WhatsApp • Email • SMS Integrated</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <span className="text-sm font-medium text-gray-500">All Parents</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <span className="text-sm font-medium text-gray-500">Class Specific</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <span className="text-sm font-medium text-gray-500">Fee Defaulters</span>
              </div>
            </div>
          </div>
          <Link to="/communication">
            <Button className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl h-12 px-8 font-semibold shadow-sm">
              Broadcast Message
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
