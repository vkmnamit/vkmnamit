import { Mail, Phone, MapPin, Calendar, Award, User, ShieldCheck, Briefcase, GraduationCap } from 'lucide-react';
import { useParams } from 'react-router';
import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { EditTeacherModal } from '../../components/modals/EditTeacherModal';
import { useAuth } from '../../context/AuthContext';

export function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [payingPayrollId, setPayingPayrollId] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchTeacherData();
  }, [id]);

  const fetchTeacherData = async () => {
    try {
      const data = await api.getTeacherById(id!);
      setTeacher(data);
      await fetchPayroll(data.user_id || data.user?.id || id!);
    } catch (err) {
      console.error('Failed to fetch teacher data');
      toast.error('Failed to load teacher profile');
    } finally {
      setLoading(false);
    }
  };

  const getWorkloadStyle = (status: string) => {
    switch (status) {
      case 'overloaded': return 'bg-red-50 text-red-700 border-red-100';
      case 'underutilized': return 'bg-amber-50 text-amber-700 border-amber-100';
      default: return 'bg-blue-50 text-blue-700 border-blue-100';
    }
  };

  const fetchPayroll = async (teacherUserId = teacher?.user_id || teacher?.user?.id || id!) => {
    try {
      const data = await api.getPayrollHistory(teacherUserId);
      setPayrollHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch payroll');
    }
  };

  const handlePaySalary = async (payrollId: string) => {
    setPayingPayrollId(payrollId);
    const toastId = toast.loading('Processing salary payout...');
    try {
      await api.payTeacher(payrollId, {
        accountNumber: '1234567890',
        ifsc: 'HDFC0001234'
      });
      toast.success('Salary disbursed successfully via Razorpay Payouts', { id: toastId });
      await fetchPayroll();
    } catch (err: any) {
      toast.error(err.message || 'Payment failed', { id: toastId });
    } finally {
      setPayingPayrollId(null);
    }
  };

  if (loading) {
    return <div className="p-6"><Skeleton className="h-[600px] w-full rounded-xl" /></div>;
  }

  if (!teacher) {
    return <div className="text-center py-10 font-bold text-gray-500">Teacher profile not found in SaaS node.</div>;
  }

  // Map flat backend data to display-friendly structure
  const profile = {
    first_name: teacher.user?.first_name || teacher.profile?.first_name || '',
    last_name: teacher.user?.last_name || teacher.profile?.last_name || '',
    email: teacher.user?.email || teacher.profile?.email || '',
    phone: teacher.user?.phone || teacher.profile?.phone || '',
    avatar: teacher.user?.avatar_url || teacher.profile?.avatar || '',
    is_active: teacher.user?.is_active ?? teacher.profile?.is_active ?? true,
  };
  const professional = {
    employee_id: teacher.employee_id || teacher.professional?.employee_id || '',
    designation: teacher.designation || teacher.professional?.designation || 'Faculty',
    department: teacher.department || teacher.professional?.department || 'General',
    qualification: teacher.qualification || teacher.professional?.qualification || '',
    experience_years: teacher.experience_years || teacher.professional?.experience_years || 0,
    date_of_joining: teacher.date_of_joining || teacher.professional?.date_of_joining || '',
    specialization: teacher.specialization || teacher.professional?.specialization || '',
    schedule: teacher.schedule || teacher.professional?.schedule || [],
    tier: teacher.tier || teacher.professional?.tier || 1,
  };
  const performance = {
    rating: teacher.performance_rating || teacher.performance?.rating || 0,
    workload_percentage: teacher.workload_percentage || teacher.performance?.workload_percentage || 0,
    workload_status: teacher.workload_status || teacher.performance?.workload_status || 'optimal',
    weekly_hours: teacher.weekly_load || teacher.performance?.weekly_hours || 0,
    student_reach: teacher.student_count || teacher.performance?.student_reach || 0,
  };
  const compensation = {
    base_salary: teacher.salary || teacher.compensation?.base_salary || 0,
  };

  const handleContactWhatsApp = () => {
    if (profile.phone) {
      const cleanPhone = String(profile.phone).replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    } else {
      toast.error('No WhatsApp number synchronized for this node');
    }
  };

  const handleContactEmail = () => {
    if (profile.email) {
      window.location.href = `mailto:${profile.email}`;
    }
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24 px-0">
      <Card className="overflow-hidden border-none shadow-sm bg-white">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            <Avatar className="w-24 h-24 border-2 border-white shadow-md">
              <AvatarFallback className="bg-blue-600 text-white text-2xl font-bold">
                {(profile.first_name?.[0] || '') + (profile.last_name?.[0] || '')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
                  <p className="text-sm text-blue-600 font-semibold mt-0.5">{professional.designation || ''} • {professional.department || ''}</p>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-3">
                    {professional.specialization && <Badge className="bg-blue-50 text-blue-700 border-blue-100 px-2 py-0.5 text-[11px] font-bold">{professional.specialization}</Badge>}
                    <Badge variant="outline" className="border-gray-200 px-2 py-0.5 text-[11px] font-medium">ID: {professional.employee_id}</Badge>
                    <Badge className={`${getWorkloadStyle(performance.workload_status)} px-2 py-0.5 text-[11px] font-bold capitalize`}>
                      {performance.workload_status || 'Optimal'}
                    </Badge>
                    <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 px-2 py-0.5 text-[11px] font-bold">
                      {profile.is_active ? 'Active' : 'On Leave'}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    className="rounded-xl font-bold h-9 px-4 text-xs"
                    onClick={() => setIsEditModalOpen(true)}
                  >
                    Edit
                  </Button>
                  <div className="flex gap-1">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 rounded-xl font-bold h-9 px-4 text-xs shadow-lg shadow-blue-600/20"
                      onClick={handleContactEmail}
                    >
                      Email
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold h-9 px-4 text-xs shadow-lg shadow-emerald-600/20"
                      onClick={handleContactWhatsApp}
                    >
                      WhatsApp
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                <div className="flex items-center gap-2.5 text-xs text-gray-600">
                  <Mail className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{profile.email}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-600">
                  <Phone className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{profile.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-600">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{professional.experience_years ?? 0} Years Exp.</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-transparent border-b border-gray-100 w-full justify-start h-auto p-0 gap-6 rounded-none mb-6 overflow-x-auto flex-nowrap">
          {['overview', 'classes', 'payroll'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 capitalize font-bold text-xs text-gray-500 transition-all"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="border-none shadow-sm bg-blue-50">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Weekly Load</p>
                <p className="text-2xl font-bold text-blue-700">{performance.weekly_hours ?? 0} Hrs</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-orange-50">
              <CardContent className="p-4 text-center">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <User className="w-5 h-5 text-orange-600" />
                </div>
                <p className="text-2xl font-bold text-orange-700">{performance.student_reach ?? 0}+</p>
                <p className="text-[10px] text-orange-600/70 font-bold uppercase tracking-tight">Students Map</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-gray-50">
              <CardContent className="p-4 text-center">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-2">
                  <ShieldCheck className="w-5 h-5 text-gray-600" />
                </div>
                <p className="text-2xl font-bold text-gray-700">Tier {professional.tier || 1}</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Access Level</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-gray-100 shadow-sm">
            <CardHeader className="py-4 px-6 border-b border-gray-50">
              <CardTitle className="text-base font-bold text-gray-900">Education & Background</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100">
                  <GraduationCap className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{professional.qualification || 'N/A'}</p>
                  <p className="text-xs text-gray-500 font-medium">{professional.specialization ? `${professional.specialization} Specialist` : ''}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100">
                  <Award className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Professional Experience</p>
                  <p className="text-xs text-gray-500 font-medium">{professional.experience_years ?? 0} Years in Institutional Excellence</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="space-y-6 outline-none">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="py-5 px-8 border-b border-gray-50 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold text-gray-900">Current Teaching Schedule</CardTitle>
              <Button size="sm" variant="outline" className="rounded-xl font-bold text-[10px] uppercase">Print Timetable</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Class / Section</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Subject</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Time Slot</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-center">Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(professional.schedule || []).map((slot: any, idx: number) => (
                    <TableRow key={idx} className="hover:bg-gray-50/50 border-gray-50">
                      <TableCell className="font-bold text-sm text-gray-900">
                        {slot.section?.class?.name} - {slot.section?.name}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-blue-600">{slot.subject?.name}</TableCell>
                      <TableCell className="text-xs text-gray-500 capitalize">{slot.day_of_week} • {slot.start_time} - {slot.end_time}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-gray-100 text-gray-700 border-none px-2 py-0.5 rounded-lg font-black text-[10px]">{slot.room || 'TBD'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!professional.schedule || professional.schedule.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-gray-400 font-bold text-xs italic">
                        No active teaching schedule synchronized for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="py-5 px-8 border-b border-gray-50">
                <CardTitle className="text-base font-bold text-gray-900">School Payment History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase">Pay Period</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-center">Amount</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-center">Status</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-center">Paid On</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollHistory.map((slip) => (
                      <TableRow key={slip.id} className="hover:bg-gray-50/50 border-gray-50">
                        <TableCell className="text-xs font-bold text-gray-900">{slip.month} {slip.year}</TableCell>
                        <TableCell className="text-center text-xs font-medium">₹{Number(slip.amount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${slip.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                              slip.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-700'
                            } border-none px-2 py-0.5 rounded-lg font-black text-[10px]`}>
                            {slip.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs text-gray-500">
                          {slip.paid_at ? new Date(slip.paid_at).toLocaleDateString() : 'Not paid'}
                        </TableCell>
                        <TableCell className="text-right">
                          {slip.status === 'pending' && currentUser?.role === 'admin' && (
                            <Button
                              size="sm"
                              className="h-7 rounded-lg bg-blue-600 hover:bg-blue-700 text-[10px] font-bold"
                              onClick={() => handlePaySalary(slip.id)}
                              disabled={payingPayrollId === slip.id}
                            >
                              {payingPayrollId === slip.id ? 'Processing...' : 'Release Pay'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {payrollHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-gray-400 font-bold text-xs italic">
                          No school payment records found for this teacher.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-blue-600 text-white overflow-hidden">
              <CardHeader className="py-6 px-8 border-b border-white/5">
                <CardTitle className="text-base font-black uppercase tracking-tight">Salary Account</CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div>
                  <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">Monthly Gross</p>
                  <p className="text-3xl font-black">₹{compensation.base_salary?.toLocaleString() || '0'}</p>
                </div>
                <div className="pt-6 border-t border-white/10 space-y-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-blue-100 opacity-80">Designation</span>
                    <span className="font-bold">{professional.designation}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-blue-100 opacity-80">Department</span>
                    <span className="font-bold">{professional.department}</span>
                  </div>
                </div>
                <Button className="w-full bg-white text-blue-600 hover:bg-blue-50 rounded-xl font-black uppercase text-[10px] h-11 mt-4">Download Tax Summary</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <EditTeacherModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        teacher={teacher}
        onSuccess={fetchTeacherData}
      />
    </div>
  );
}
