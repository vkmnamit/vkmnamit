import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { 
  Users, Calendar, BookOpen, CheckCircle, Clock, Plus, Upload, Banknote,
  FileText, BarChart3, MessageSquare, Layout, Award, Zap
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { MarksEntryModal } from '../../components/modals/MarksEntryModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export function TeacherDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [stats, payroll] = await Promise.all([api.getTeacherDashboard(), api.getPayrollHistory()]);
      setData(stats);
      setPayrollHistory(Array.isArray(payroll) ? payroll : []);
    } catch (err) {
      console.error('Failed to load teacher dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadHomework = () => {
    toast.success('Homework upload module activated');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const latestPayroll = payrollHistory[0];
  const teacherStats = [
    { title: 'Total Students', value: data?.stats?.totalStudentsReached ?? 0, icon: Users, color: 'bg-blue-600' },
    { title: 'Classes Today', value: data?.stats?.classesToday ?? 0, icon: BookOpen, color: 'bg-emerald-600' },
    { title: 'Pending Tasks', value: data?.stats?.pendingTasks ?? 0, icon: Clock, color: 'bg-amber-600' },
    { title: 'Latest Salary', value: latestPayroll ? `₹${Number(latestPayroll.amount || 0).toLocaleString()}` : 'No record', icon: Banknote, color: 'bg-indigo-600' },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Teacher Console</h1>
          <p className="text-gray-500 font-medium">Synchronized academic management for {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl font-bold border-gray-200" onClick={() => navigate('/assignments')}>
            <Layout className="w-4 h-4 mr-2" />
            LMS Panel
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-xl shadow-blue-600/20" onClick={() => navigate('/communication')}>
            <Plus className="w-4 h-4 mr-2" />
            New Announcement
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {teacherStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-none shadow-sm hover:shadow-md transition-all group bg-white">
              <CardContent className="p-7">
                <div className={`w-12 h-12 ${stat.color} rounded-2xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Today's Schedule */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-8 border-b border-gray-50 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold">Today's Schedule</CardTitle>
            <Badge className="bg-blue-50 text-blue-700 border-none font-bold">Live</Badge>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-4">
              {(data?.timetable || []).slice(0, 5).map((slot: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-5 bg-gray-50/50 rounded-2xl border border-gray-100 group hover:border-blue-200 hover:bg-white hover:shadow-lg transition-all">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 flex flex-col items-center justify-center shadow-sm">
                      <span className="text-[10px] font-black text-blue-600 uppercase">P{index + 1}</span>
                    </div>
                    <div>
                      <p className="font-bold text-base text-gray-900 group-hover:text-blue-600 transition-colors">
                        {slot.subject?.name || 'Subject'}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <span>{slot.section?.class?.name} – {slot.section?.name}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" /> {slot.start_time}</span>
                        <span className="flex items-center gap-1"><Layout className="w-3 h-3 text-emerald-500" /> {slot.room || 'Room'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[10px] h-9 px-4 shadow-sm" onClick={() => navigate('/students')}>Students</Button>
                  </div>
                </div>
              ))}
              {(data?.timetable || []).length === 0 && (
                <div className="text-center py-10">
                  <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-bold">No classes scheduled for today</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-2 border-b border-gray-50">
              <CardTitle className="text-sm font-bold text-gray-900 uppercase">Class Performance</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.performanceData || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="class" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} />
                    <Bar dataKey="avg" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={25} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Exams & Grading Protocol */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="py-5 px-8 border-b border-gray-50 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold">Exams & Grading Protocol</CardTitle>
          <Button variant="ghost" className="text-blue-600 font-bold text-xs" onClick={() => navigate('/exams')}>View All Protocols</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 lg:grid-cols-3 divide-x divide-gray-50">
            {(data?.exams || []).slice(0, 3).map((exam: any, idx: number) => (
              <div key={idx} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <Badge className={`${exam.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'} border-none font-black text-[9px] uppercase tracking-widest`}>
                    {exam.status}
                  </Badge>
                  <p className="text-[10px] font-bold text-gray-400">{exam.date}</p>
                </div>
                <h4 className="font-bold text-gray-900 mb-1">{exam.subject}</h4>
                <p className="text-xs text-gray-500 font-medium mb-4">{exam.name} • {exam.class}</p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    className="flex-1 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-[10px] h-9"
                    onClick={() => {
                      setSelectedExam(exam);
                      setIsMarksModalOpen(true);
                    }}
                  >
                    Enter Marks
                  </Button>
                </div>
              </div>
            ))}
            {(data?.exams || []).length === 0 && (
              <div className="col-span-full py-12 text-center">
                <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">No Active Assessment Protocols</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <MarksEntryModal 
        isOpen={isMarksModalOpen}
        onClose={() => {
          setIsMarksModalOpen(false);
          setSelectedExam(null);
        }}
        exam={selectedExam}
        onSuccess={fetchStats}
      />

      {/* Pending Tasks */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="py-5 px-8 border-b border-gray-50">
          <CardTitle className="text-lg font-bold">Pending Tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-50">
            {(data?.tasks || []).map((task: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${task.priority === 'high' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900">{task.task}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Due: {task.dueDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="rounded-full px-3 py-0.5 text-[10px] font-black uppercase">
                    {task.priority}
                  </Badge>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl px-5 font-bold h-9" onClick={() => toast.success(`Task "${task.task}" completed`)}>Done</Button>
                </div>
              </div>
            ))}
            {(data?.tasks || []).length === 0 && (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-emerald-100 mx-auto mb-3" />
                <p className="text-sm text-gray-400 font-bold">All tasks are up to date</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
