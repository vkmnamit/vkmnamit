import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Calendar, TrendingUp, DollarSign, Clock, Mail, UserCircle,
  Download, AlertTriangle, MessageCircle, FilePlus
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { openRazorpayCheckout } from '../../../lib/razorpay';
import { PaymentSuccessOverlay } from '../../components/payment/PaymentSuccessOverlay';
import { ContineoAcademicView } from '../../components/academic/ContineoAcademicView';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';

export function ParentDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const navigate = useNavigate();

  const [successData, setSuccessData] = useState<{
    isOpen: boolean; amount: number; receiptNumber: string;
    studentName?: string; admissionNumber?: string; classSection?: string; feeTitle?: string;
  }>({ isOpen: false, amount: 0, receiptNumber: '' });

  useEffect(() => {
    fetchStats();

    const handleRefresh = () => fetchStats();
    window.addEventListener('refreshFees', handleRefresh);
    return () => window.removeEventListener('refreshFees', handleRefresh);
  }, []);

  const fetchStats = async (retries = 1) => {
    setLoading(true);
    setError(null);
    try {
      const stats = await api.getParentDashboard();
      setData(stats);
      if (stats.children?.length > 0) {
        setSelectedChildId(stats.children[0].id);
      } else {
        // no linked children — keep selectedChildId null
        setSelectedChildId(null);
      }
    } catch (err: any) {
      console.error('Failed to load parent dashboard', err);
      if (retries > 0) {
        // automatic retry once after short delay
        setTimeout(() => fetchStats(retries - 1), 700);
      } else {
        const msg = err?.message || 'Failed to load dashboard data';
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePayFees = async (child: any) => {
    if (!child.pendingFees?.[0]) {
      toast.info('No pending fees for this child');
      return;
    }
    const fee = child.pendingFees[0];
    const pendingAmount = (Number(fee.amount || 0) + Number(fee.late_fee || 0) - Number(fee.discount_amount || 0)) - Number(fee.paid_amount || 0);

    if (pendingAmount <= 0) {
      toast.info('This fee is already fully paid');
      return;
    }
    toast.info('Online payment integration is currently underway and will be available in the future. Please contact the School Admin to complete this payment.');
    return;
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900">Failed to load dashboard</h3>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
          <div className="mt-4">
            <Button onClick={() => fetchStats()} className="bg-blue-600 text-white">Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  const selectedChild = data?.children?.find((c: any) => c.id === selectedChildId);

  return (
    <div className="space-y-0 max-w-full overflow-x-hidden pb-10 bg-white min-h-screen">
      <PaymentSuccessOverlay
        isOpen={successData.isOpen}
        onClose={() => setSuccessData(prev => ({ ...prev, isOpen: false }))}
        amount={successData.amount}
        receiptNumber={successData.receiptNumber}
        studentName={successData.studentName}
        admissionNumber={successData.admissionNumber}
        classSection={successData.classSection}
        feeTitle={successData.feeTitle}
        schoolName={user?.school || 'School Management System'}
        schoolAddress={user?.schoolAddress || 'School Address not set'}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome, {user?.name?.split(' ')[0] || 'Parent'}</h1>
          <p className="text-gray-500 font-medium">Monitoring academic performance of your children</p>
        </div>
          <Button className="bg-blue-600 hover:bg-blue-700 rounded-xl w-full sm:w-auto" onClick={() => navigate('/communication', { state: { studentId: selectedChildId } })}>
            <MessageCircle className="w-4 h-4 mr-2" /> Message Teacher
          </Button>
      </div>
      {/* Child Selector & Profile Header */}
      {selectedChild && (
        <div className="space-y-0">
          <div className="bg-[#2B52B0] py-8 px-4 sm:px-8 relative overflow-hidden">
            <div className="z-10 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-start gap-5 md:gap-8 w-full max-w-6xl mx-auto">
              <div className="relative shrink-0">
                <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-4 border-[#E11D48] shadow-2xl mx-auto">
                  <AvatarFallback className="bg-white text-blue-600 text-4xl font-bold">
                    {selectedChild.name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#E11D48] text-white text-[9px] font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                  CHILD PROFILE
                </div>
              </div>

              <div className="text-white flex-1 min-w-0 flex flex-col items-center md:items-start text-center md:text-left mt-3 md:mt-0">
                <h1 className="text-2xl sm:text-4xl font-normal tracking-tight break-words">{selectedChild.name}</h1>
                <div className="flex flex-wrap mt-3 gap-2 justify-center md:justify-start">
                  <Badge variant="outline" className="border-blue-300/50 text-blue-100 bg-blue-900/30 text-[10px] py-0.5">
                    ID: {selectedChild.id.split('-')[0].toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="border-blue-300/50 text-blue-100 bg-blue-900/30 text-[10px] py-0.5">
                    ROLL: {selectedChild.rollNo || 'N/A'}
                  </Badge>
                  <Badge variant="outline" className="border-blue-300/50 text-blue-100 bg-blue-900/30 text-[10px] py-0.5">
                    CLASS: {selectedChild.class}
                  </Badge>
                </div>
              </div>

              <div className="text-center md:text-right w-full md:w-auto mt-4 md:mt-0 bg-white/10 md:bg-transparent p-3 md:p-0 rounded-xl">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Current Fee Status</p>
                <p className="text-rose-300 text-sm md:text-lg font-bold mt-1">Pending: {selectedChild.fees}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-100 min-h-10 flex items-center px-4 sm:px-8 py-2 border-b border-gray-200 overflow-x-auto">
            {(data?.children?.length > 1) ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hidden sm:inline-block">Select Child:</span>
                <Select value={selectedChildId || ''} onValueChange={setSelectedChildId}>
                  <SelectTrigger className="h-8 text-xs font-bold w-[180px] sm:w-[220px] bg-white border-gray-200 shadow-sm focus:ring-blue-500">
                    <SelectValue placeholder="Select child" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.children || []).map((child: any) => (
                      <SelectItem key={child.id} value={child.id} className="text-xs font-medium cursor-pointer">
                        {child.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 border-b-2 border-blue-600 pb-1">
                  {selectedChild.name.split(' ')[0]}
                </span>
              </div>
            )}
            
            <div className="ml-auto flex items-center gap-2 shrink-0 pl-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Academic Overview</p>
            </div>
          </div>

          {/* Static Risk Analysis Protocol removed as per user request */}

          <div className="px-4 sm:px-8 py-8 max-w-7xl mx-auto space-y-6 w-full">
            <h3 className="text-lg font-bold text-gray-900">Academic Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-5 sm:p-6">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Overall Performance</p>
                  <p className="text-3xl font-black text-blue-600">{selectedChild.performance}</p>
                  <p className="text-[10px] text-gray-400 mt-2">Aggregate average across all assessments</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-5 sm:p-6">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Attendance</p>
                  <p className="text-3xl font-black text-emerald-600">{selectedChild.attendance}</p>
                  <p className="text-[10px] text-gray-400 mt-2">Current semester presence rate</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-5 sm:p-6">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Pending Fees</p>
                  <p className="text-3xl font-black text-rose-600">{selectedChild.fees}</p>
                  <p className="text-[10px] text-gray-400 mt-2">Action required if non-zero</p>
                </CardContent>
              </Card>
            </div>

            {selectedChild.pendingFees?.length > 0 && (
              <div className="bg-rose-50 p-4 sm:p-6 rounded-2xl border border-rose-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-rose-900">Outstanding Fee Payment</p>
                  <p className="text-xs text-rose-700 mt-1">Please clear pending dues to avoid late fees.</p>
                </div>
                <Button className="bg-rose-600 hover:bg-rose-700 text-white font-bold w-full sm:w-auto" onClick={() => handlePayFees(selectedChild)}>
                  Contact Admin to Pay
                </Button>
              </div>
            )}

            {/* Child Specific Academic & Schedule Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Today's Schedule */}
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-600" /> Today's Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {selectedChild.todaySchedule?.length > 0 ? selectedChild.todaySchedule.map((slot: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-indigo-50/50 transition-colors">
                        <div className="flex gap-4 items-center">
                          <div className="text-center w-14">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Period {slot.period_number}</p>
                            <p className="text-xs font-bold text-gray-900">{slot.start_time.substring(0, 5)}</p>
                          </div>
                          <div className="w-px h-10 bg-gray-200"></div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{slot.subject}</p>
                            <p className="text-[10px] text-gray-500 font-medium">{slot.teacher}</p>
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
                  <CardTitle className="text-lg font-bold flex items-center gap-2"><FilePlus className="w-5 h-5 text-emerald-600" /> Pending Assignments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {selectedChild.assignments?.length > 0 ? selectedChild.assignments.map((assignment: any, idx: number) => {
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
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-gray-400 uppercase tracking-widest flex items-center gap-1"><Calendar className="w-3 h-3" /> Due {new Date(assignment.due_date).toLocaleDateString()}</span>
                            <span className={`${isUrgent ? 'text-red-600' : 'text-emerald-600'}`}>{daysLeft > 0 ? `${daysLeft} days left` : 'Due today'}</span>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                        <FilePlus className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm font-bold">No pending assignments.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {(!data?.children || data.children.length === 0) && (
        <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300">
          <UserCircle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No children linked to your account yet.</p>
        </div>
      )}

      {/* Comparison Chart */}
      <Card className="mx-4 sm:mx-0">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-gray-900">Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.comparisonData || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" />
                {(data?.children || []).map((child: any, index: number) => (
                  <Bar key={child.name} dataKey={child.name.toLowerCase()} fill={index === 0 ? "#3b82f6" : "#10b981"} name={child.name.split(' ')[0]} radius={[4, 4, 0, 0]} barSize={20} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Communications + Meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 px-4 sm:px-0">
        <Card>
          <CardHeader><CardTitle className="text-lg font-bold text-gray-900">Upcoming Meetings</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(data?.meetings || []).map((meeting: any, index: number) => (
                <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 transition-all">
                  <p className="font-bold text-sm text-gray-900">{meeting.title}</p>
                  <div className="flex items-center gap-4 mt-2 text-[11px] font-semibold text-gray-500 uppercase">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-blue-500" /> {meeting.date}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" /> {meeting.time}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Faculty: {meeting.teacher}</p>
                </div>
              ))}
              {(!data?.meetings || data.meetings.length === 0) && (
                <div className="text-center text-gray-400 py-8 text-sm">No upcoming meetings</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg font-bold text-gray-900">Recent Messages</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(data?.communications || []).map((message: any, index: number) => (
                <div key={index} className="p-4 bg-blue-50/30 rounded-xl border border-blue-100/50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-gray-900">{message.from}</p>
                    <p className="text-[10px] font-bold text-blue-500 uppercase">{message.time}</p>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">{message.subject}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{message.message}</p>
                </div>
              ))}
              {(!data?.communications || data.communications.length === 0) && (
                <div className="text-center text-gray-400 py-8 text-sm">No recent messages</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
