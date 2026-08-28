import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { api } from '../../../lib/api';
import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Calendar, TrendingUp, DollarSign, BookOpen, Clock, Award, Bell, Download, AlertTriangle, User
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { openRazorpayCheckout } from '../../../lib/razorpay';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';

// Removed ContineoAcademicView import

export function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const stats = await api.getStudentDashboard();
      setData(stats);
    } catch (err: any) {
      console.error('Failed to fetch dashboard stats', err);
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleRefresh = () => fetchData();
    window.addEventListener('refreshFees', handleRefresh);
    return () => window.removeEventListener('refreshFees', handleRefresh);
  }, []);

  const handleMarkAssignmentDone = async (assignmentId: string) => {
    try {
      if (!user?.id) return;
      await api.toggleAssignmentStatus({ assignmentId, studentId: user.student_id || user.id, isCompleted: true });
      toast.success('Assignment submitted for review (pending)!');
      // Update local state to remove it from pending
      setData((prev: any) => ({
        ...prev,
        assignments: (prev?.assignments || []).filter((a: any) => a.id !== assignmentId)
      }));
    } catch (err) {
      toast.error('Failed to update assignment status');
    }
  };

  const handleFeePayment = () => {
    toast.info('Online payment integration is currently underway and will be available in the future. Please contact the School Admin to complete this payment.');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    const isProfileMissing = error.toLowerCase().includes('student profile not found') || error.toLowerCase().includes('student not found');
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-10 flex flex-col items-center text-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${isProfileMissing ? 'bg-amber-500 shadow-amber-500/20' : 'bg-rose-500 shadow-rose-500/20'}`}>
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                {isProfileMissing ? 'Student Profile Not Linked' : 'Dashboard failed to load'}
              </h2>
              <p className="text-sm text-slate-500 mt-2 max-w-md font-medium">
                {isProfileMissing
                  ? 'Your login account is not linked to a student profile yet. Please ask your School Admin to register you as a student (with class & section), and this dashboard will activate automatically.'
                  : error}
              </p>
            </div>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 px-6" onClick={fetchData}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const performanceData = data?.academic?.performanceData || [];
  const announcements = data?.announcements || [];
  const alerts = data?.alerts || [];
  const recentScores = data?.academic?.recentScores || [];
  const allNotifications = [...alerts, ...announcements].slice(0, 8);

  const studentStats = [
    { title: 'Attendance', value: data?.stats?.attendanceRate || 'N/A', icon: Calendar, color: 'bg-blue-600', sub: data?.stats?.attendanceCount || 'Last 30 days' },
    { title: 'Performance', value: data?.stats?.performance || '0%', icon: Award, color: 'bg-amber-600', sub: data?.stats?.performanceStatus || 'Current Standing' },
    { title: 'Due Amount', value: data?.stats?.feeBalance || '₹0', icon: DollarSign, color: 'bg-emerald-600', sub: `Due: ${data?.stats?.feeDueDate || 'N/A'}` },
    { title: 'Notifications', value: alerts.length + announcements.length, icon: Bell, color: 'bg-indigo-600', sub: 'Unread alerts' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome back, {user?.name?.split(' ')[0] || 'Student'}! 👋
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Here's an overview of your academic progress and schedule.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {studentStats.map((stat) => {
          const Icon = stat.icon;
          const isNotification = stat.title === 'Notifications';
          return (
            <Card 
              key={stat.title} 
              className={`border-none shadow-sm hover:shadow-md transition-all group bg-white ${isNotification ? 'cursor-pointer hover:ring-2 ring-indigo-500/20' : ''}`}
              onClick={() => {
                if (isNotification) {
                  window.dispatchEvent(new Event('openNotificationPanel'));
                }
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <p className="text-sm text-gray-500 font-medium">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Risk Analysis Protocol */}
      {data?.risk_analysis?.reasons?.length > 0 && (
        <Card className="border-none shadow-sm bg-rose-50 border-l-4 border-rose-500 overflow-hidden">
          <CardContent className="p-6 flex items-start gap-6">
            <div className="w-12 h-12 bg-rose-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-rose-900 uppercase tracking-tight">Institutional Risk Protocol Activated</h3>
              <p className="text-sm text-rose-700/80 mt-1 font-medium">The following anomalies have been detected in the student's academic/financial node:</p>
              <ul className="mt-3 space-y-2">
                {data.risk_analysis.reasons.map((reason: string, idx: number) => (
                  <li key={idx} className="text-xs font-bold text-rose-800 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                    {reason}
                  </li>
                ))}
              </ul>
              <div className="mt-4 p-3 bg-white/50 rounded-xl border border-rose-200/50">
                <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Recommended Action</p>
                <p className="text-sm font-bold text-rose-900">{data.risk_analysis.recommended_action}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Graph */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Academic Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData.length > 0 ? performanceData : [{ subject: 'No Data', score: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="subject" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f1f5f9'}} />
                <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Scores */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold">Recent Scores</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs font-bold text-blue-600 hover:bg-blue-50" onClick={() => navigate('/results')}>View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentScores.length > 0 ? recentScores.map((score: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{score.subject}</p>
                    <p className="text-[10px] text-gray-500">{score.test}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold">{score.score}/{score.maxScore}</p>
                      <p className="text-xs text-gray-500">{((score.score / score.maxScore) * 100).toFixed(0)}%</p>
                    </div>
                    <Badge className="bg-green-500 border-none">{score.grade}</Badge>
                  </div>
                </div>
              )) : <div className="text-center text-gray-500 py-8">No recent scores available</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-600" /> Today's Schedule</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs font-bold text-indigo-600 hover:bg-indigo-50" onClick={() => navigate('/timetable')}>View Full</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {data?.academic?.today_schedule?.length > 0 ? data.academic.today_schedule.map((slot: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-indigo-50/50 transition-colors">
                  <div className="flex gap-4 items-center">
                    <div className="text-center w-14">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Period {slot.period_number}</p>
                      <p className="text-xs font-bold text-gray-900">{slot.start_time.substring(0,5)}</p>
                    </div>
                    <div className="w-px h-10 bg-gray-200"></div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{slot.subject}</p>
                      <p className="text-[10px] text-gray-500 font-medium flex items-center gap-1 mt-0.5"><User className="w-3 h-3" /> {slot.teacher}</p>
                    </div>
                  </div>
                  <Badge className="bg-white border border-gray-200 text-gray-600 shadow-sm text-[10px] uppercase font-bold px-2 py-0.5">Room {slot.room || 'TBA'}</Badge>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                  <Calendar className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm font-bold">No classes scheduled for today.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pending Assignments */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-600" /> Pending Assignments</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs font-bold text-emerald-600 hover:bg-emerald-50" onClick={() => navigate('/assignments')}>View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {data?.assignments?.length > 0 ? data.assignments.map((assignment: any, idx: number) => {
                const daysLeft = Math.ceil((new Date(assignment.due_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                const isUrgent = daysLeft <= 2;
                return (
                  <div key={idx} className={`p-4 rounded-xl border transition-colors ${isUrgent ? 'bg-red-50/50 border-red-100 hover:bg-red-50' : 'bg-emerald-50/30 border-emerald-100/50 hover:bg-emerald-50'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-gray-900 line-clamp-1">{assignment.title}</h4>
                      <Badge className={`border-none px-2 py-0.5 font-bold text-[10px] uppercase ${isUrgent ? 'bg-red-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isUrgent ? 'Urgent' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{assignment.course || 'General Subject'}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center text-[10px] font-bold">
                        <span className="text-gray-400 uppercase tracking-widest flex items-center gap-1"><Calendar className="w-3 h-3" /> Due {new Date(assignment.due_date).toLocaleDateString()}</span>
                        <span className={`ml-3 ${isUrgent ? 'text-red-600' : 'text-emerald-600'}`}>{daysLeft > 0 ? `${daysLeft} days left` : 'Due today'}</span>
                      </div>
                      <Button size="sm" className="h-7 text-[10px] font-bold rounded-lg" onClick={() => handleMarkAssignmentDone(assignment.id)}>
                        Mark Done
                      </Button>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                  <Award className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm font-bold">You're all caught up! No pending assignments.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fee + Announcements Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white text-slate-900">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900">Fee Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <p className="text-3xl font-black text-slate-900">{data?.stats?.feeBalance || '₹0'}</p>
              <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-widest">Outstanding Balance</p>
            </div>
            <div className="flex gap-4">
              <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold h-11 shadow-lg shadow-rose-600/20" onClick={handleFeePayment}>Contact Admin to Pay</Button>
              <Button variant="outline" className="flex-1 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold h-11 shadow-sm" onClick={() => navigate('/fees/status')}>
                <Download className="w-4 h-4 mr-2" /> Receipt
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-blue-600" /> Alerts & Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[320px] overflow-y-auto">
              {allNotifications.length > 0 ? allNotifications.map((ann: any, index: number) => (
                <div key={index} className={`p-3 rounded-lg border ${ann.type === 'assignment' || ann.type === 'exam' || ann.type === 'timetable' ? 'bg-indigo-50 border-indigo-100' : 'bg-blue-50 border-blue-100'}`}>
                  <p className="font-bold text-sm text-gray-900">{ann.title || ann.subject}</p>
                  <p className="text-xs text-gray-700 mt-1">{ann.message}</p>
                  <p className="text-[10px] text-gray-400 mt-2 font-medium">{ann.time || ann.created_at ? new Date(ann.created_at || ann.time).toLocaleString() : ''}</p>
                </div>
              )) : <div className="text-center text-gray-500 py-4">No new alerts</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'My Results', icon: Award, color: 'bg-violet-500', action: () => navigate('/results') },
              { name: 'Apply Leave', icon: Calendar, color: 'bg-blue-500', action: () => toast.success('Leave application submitted') },
              { name: 'Fee Payment', icon: DollarSign, color: 'bg-green-500', action: handleFeePayment },
              { name: 'Admit Card', icon: Award, color: 'bg-purple-500', action: () => {
                if (data?.fees?.amountDue > 0) {
                  toast.error('Clear pending fee dues to download the admit card.');
                } else {
                  toast.info('Downloading admit card...');
                }
              } },
              { name: 'My Timetable', icon: Clock, color: 'bg-orange-500', action: () => navigate('/timetable') },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Button key={action.name} variant="outline" className="h-auto py-6 flex flex-col items-center gap-2" onClick={action.action}>
                  <div className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-sm">{action.name}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
