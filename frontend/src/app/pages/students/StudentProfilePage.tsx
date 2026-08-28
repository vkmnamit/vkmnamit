import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin, Calendar, Award, User, ShieldCheck, Heart, Hash, AlertCircle, TrendingDown, TrendingUp, Zap, Download, Clock, BookOpen, FileText, Bell, Activity, CheckCircle2, XCircle, Check } from 'lucide-react';
import { useParams, useNavigate } from 'react-router';
import { api, clearApiCachePattern } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { openRazorpayCheckout } from '../../../lib/razorpay';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EmergencyAlertModal } from '../../components/modals/EmergencyAlertModal';
import { EditStudentModal } from '../../components/modals/EditStudentModal';
import { GenerateFeeModal } from '../../components/modals/GenerateFeeModal';
import { MarkPaidModal } from '../../components/modals/MarkPaidModal';
import { generateProfessionalReceipt } from '../../../lib/pdf';

export function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [fees, setFees] = useState<any[]>([]);
  const [feeLedgerSummary, setFeeLedgerSummary] = useState<any>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  // Modals
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGenerateFeeOpen, setIsGenerateFeeOpen] = useState(false);
  const [markPaidFee, setMarkPaidFee] = useState<any>(null);

  useEffect(() => {
    if (id) {
      fetchStudentData();
      fetchFeeData();
      fetchAnalytics();
      fetchAttendanceData();
      fetchInventoryData();
    }
  }, [id]);

  const fetchInventoryData = async () => {
    try {
      const data = await api.getStudentInventoryDistribution(id!);
      setInventory(data.distribution || []);
    } catch (err) {
      console.error('Failed to load inventory');
    }
  };

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      // Clear cache before fetching to ensure fresh data
      clearApiCachePattern(`/students/${id}`);
      clearApiCachePattern(`/students?`);
      const data = await api.getStudentById(id!);
      setStudent(data);
      if (data.section_id) {
        fetchTimetable(data.section_id);
        fetchAcademicData(data.section?.id, data.section?.class?.id);
      }
    } catch (err) {
      toast.error('Failed to load student profile');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAssignment = async (assignmentId: string, isCompleted: boolean) => {
    try {
      await api.toggleAssignmentStatus({ assignmentId, studentId: id!, isCompleted });
      const targetStatus = (currentUser?.role === 'admin' || currentUser?.role === 'teacher') ? 'completed' : 'pending';
      setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, isCompleted, status: isCompleted ? targetStatus : 'assigned' } : a));
      toast.success(isCompleted ? (targetStatus === 'completed' ? 'Assignment marked as complete!' : 'Assignment submitted for review (pending)!') : 'Assignment marked as incomplete.');
    } catch (err: any) {
      toast.error('Failed to update assignment status');
    }
  };

  const fetchFeeData = async () => {
    try {
      const [paymentsData, ledgerData] = await Promise.all([
        api.getPayments({ student_id: id }),
        api.getStudentLedger(id!)
      ]);
      setFees(paymentsData.payments || paymentsData || []);
      setFeeLedgerSummary(ledgerData.summary || null);
    } catch (err) {
      console.error('Failed to load fees');
    }
  };

  const handleDownloadReceipt = (fee: any) => {
    generateProfessionalReceipt({
      schoolName: (currentUser as any)?.school?.name || currentUser?.school || 'Kautix.in',
      schoolAddress: currentUser?.schoolAddress || '',
      schoolPhone: currentUser?.schoolPhone || '',
      schoolEmail: currentUser?.schoolEmail || '',
      receiptNumber: fee.receipt_number || `RCPT-${fee.id.substring(0, 8).toUpperCase()}`,
      date: new Date(fee.paid_date || fee.updated_at).toLocaleDateString('en-IN'),
      studentName: `${student?.user?.first_name} ${student?.user?.last_name || ''}`.trim(),
      admissionNumber: student?.admission_number || 'N/A',
      classSection: `${student?.section?.class?.name || ''} ${student?.section?.name || ''}`.trim(),
      feeTitle: fee.title || fee.fee_structure?.name || fee.remarks || 'Fee Payment',
      amount: Number(fee.paid_amount || fee.amount),
      paymentMethod: (fee.payment_method || 'Online').toUpperCase(),
      transactionId: fee.reference_number || fee.id.substring(0, 12).toUpperCase()
    });
  };

  const fetchTimetable = async (sectionId: string) => {
    try {
      const data = await api.getTimetable(undefined, sectionId);
      setTimetable(data.slots || []);
    } catch (err) {
      console.error('Failed to load timetable');
    }
  };

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const data = await api.getStudentAnalytics(id!);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchAttendanceData = async () => {
    try {
      const data = await api.getAttendance({ student_id: id });
      const records = data?.records || data || [];
      setAttendanceRecords(records);
    } catch (err) {
      console.error('Failed to load attendance history');
    }
  };

  const fetchAcademicData = async (sectionId: string, classId: string) => {
    try {
      const reportData = await api.getReportCard(id!).catch(err => {
        console.error('Failed to load report card:', err);
        return { results: [] };
      });

      const classExams = await api.getExams({ class_id: classId }).catch(() => []);
      const validExams = classExams.filter((e: any) => !e.section_id || e.section_id === sectionId);

      const mergedExams = validExams.map((exam: any) => {
        const result = reportData?.results?.find((r: any) => r.exam_id === exam.id);
        return {
          exam,
          result
        };
      });

      setExams(mergedExams);
    } catch (err) {
      console.error('Failed to load exams');
    }

    try {
      const assignmentsData = await api.getAssignments({ sectionId, studentId: id }).catch(err => {
        console.error('Failed to load assignments:', err);
        return [];
      });
      setAssignments(assignmentsData || []);
    } catch (err) {
      console.error('Failed to load assignments');
    }
  };

  if (loading) return <div className="p-6"><Skeleton className="h-[600px] w-full rounded-2xl" /></div>;
  if (!student) return <div className="p-20 text-center font-bold text-gray-500">Student not found</div>;

  const fullName = `${student.user?.first_name} ${student.user?.last_name || ''}`;
  const parent = student.parents?.[0]?.parent; // Get actual parent from junction array

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      <EmergencyAlertModal isOpen={isEmergencyModalOpen} onClose={() => setIsEmergencyModalOpen(false)} studentId={student.id} studentName={fullName} />
      <EditStudentModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} student={student} onSuccess={fetchStudentData} />
      {isGenerateFeeOpen && <GenerateFeeModal isOpen={true} onClose={() => setIsGenerateFeeOpen(false)} studentId={student.id} studentName={fullName} onSuccess={fetchFeeData} />}
      {markPaidFee && <MarkPaidModal isOpen={true} onClose={() => setMarkPaidFee(null)} fee={markPaidFee} studentName={fullName} onSuccess={fetchFeeData} />}

      {/* Profile Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-white shadow-lg">
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-2xl sm:text-3xl font-black">
                {student.user?.first_name?.charAt(0)}{student.user?.last_name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{fullName}</h1>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none px-3 font-bold rounded-full">Active</Badge>
              </div>
              <p className="text-sm font-medium text-gray-500 flex items-center gap-4">
                <span className="flex items-center gap-1.5"><Hash className="w-4 h-4" /> {student.admission_number}</span>
                <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> Class {student.section?.class?.name}-{student.section?.name}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            {currentUser?.role === 'admin' && (
              <Button onClick={() => setIsEditModalOpen(true)} variant="outline" className="h-12 rounded-xl font-bold bg-white w-full md:w-auto">
                Edit Profile
              </Button>
            )}
            <Button onClick={() => setIsEmergencyModalOpen(true)} className="h-12 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-bold border-none w-full md:w-auto shadow-none">
              <AlertCircle className="w-4 h-4 mr-2" /> Emergency Alert
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto pb-2 scrollbar-hide">
          <TabsList className="bg-white p-1 rounded-2xl border border-gray-100 h-14 w-full justify-start min-w-max inline-flex">
            <TabsTrigger value="overview" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Overview</TabsTrigger>
            <TabsTrigger value="academic" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Academic</TabsTrigger>
            <TabsTrigger value="attendance" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Attendance</TabsTrigger>
            <TabsTrigger value="timetable" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Timetable</TabsTrigger>
            <TabsTrigger value="fees" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Fee History</TabsTrigger>
            <TabsTrigger value="inventory" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Inventory</TabsTrigger>
            <TabsTrigger value="communication" className="rounded-xl h-10 px-6 font-bold text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">Communication</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <User className="w-4 h-4" /> Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date of Birth</p><p className="font-semibold text-gray-900">{student.date_of_birth || 'N/A'}</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Gender</p><p className="font-semibold text-gray-900 capitalize">{student.gender || 'N/A'}</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Blood Group</p><p className="font-semibold text-gray-900">{student.blood_group || 'N/A'}</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Roll Number</p><p className="font-semibold text-gray-900">{student.roll_number || 'N/A'}</p></div>
                  <div className="col-span-2"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Address</p><p className="font-semibold text-gray-900">{student.address || 'N/A'}</p></div>

                  {student.user?.username && currentUser?.role === 'admin' && (
                    <div className="col-span-2 pt-4 mt-2 border-t border-gray-100">
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Portal Login Credentials</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Login ID (Username)</p>
                          <p className="font-mono text-sm font-semibold bg-blue-50/50 text-blue-900 px-3 py-1.5 rounded-lg w-fit border border-blue-100">{student.user.username}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Initial Password</p>
                          <p className="font-mono text-sm font-semibold bg-blue-50/50 text-blue-900 px-3 py-1.5 rounded-lg w-fit border border-blue-100">{student.user.temp_password || '******** (Custom or Changed)'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" /> Parent / Guardian Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {parent ? (
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div className="col-span-2"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Primary Guardian</p><p className="font-semibold text-gray-900 text-lg">{parent.user?.first_name} {parent.user?.last_name}</p></div>
                    <div className="col-span-2"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Email Address</p><p className="font-semibold text-gray-900 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> {parent.user?.email || 'N/A'}</p></div>
                    <div className="col-span-2"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone Number</p><p className="font-semibold text-gray-900 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {parent.user?.phone || 'N/A'}</p></div>
                  </div>
                ) : (
                  <p className="text-gray-500 font-medium text-sm">No parent information linked.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Academic Tab ── */}
        <TabsContent value="academic" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {analyticsLoading ? (
            <div className="space-y-4">
              <div className="h-48 bg-gray-100 animate-pulse rounded-3xl" />
              <div className="h-48 bg-gray-100 animate-pulse rounded-3xl" />
            </div>
          ) : analytics?.empty ? (
            <Card className="rounded-3xl border-gray-100 shadow-sm bg-white">
              <CardContent className="p-10 text-center">
                <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold text-sm">No exam results recorded yet.</p>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Performance data will appear after exams are graded.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Overall Badge */}
              {analytics?.overall && (
                <div className="grid grid-cols-3 gap-4">
                  <Card className="border-none shadow-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                    <CardContent className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Overall Score</p>
                      <p className="text-3xl font-black">{analytics.overall.percentage}%</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Grade</p>
                      <p className="text-3xl font-black text-gray-900">{analytics.overall.grade}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Class</p>
                      <p className="text-2xl font-black text-gray-900">{analytics.className}-{analytics.sectionName}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Subject Performance */}
              <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
                <CardHeader className="bg-blue-50/40 border-b border-blue-100/40 pb-4">
                  <CardTitle className="text-sm font-black uppercase text-blue-600 tracking-widest flex items-center gap-2">
                    <Award className="w-4 h-4" /> Subject Performance vs Class Average
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {(analytics?.subjects || []).map((s: any, i: number) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-black text-sm text-gray-900">{s.subject}</span>
                          <span className={`ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${s.grade === 'A+' ? 'bg-emerald-100 text-emerald-700' :
                            s.grade === 'A' ? 'bg-green-100 text-green-700' :
                              s.grade === 'B+' || s.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                                s.grade === 'C' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>{s.grade}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-blue-600">{s.myPercentage}%</span>
                          <span className="text-xs text-gray-400 font-medium ml-1">you</span>
                        </div>
                      </div>
                      {/* My score bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 font-bold w-20 uppercase">You</span>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full transition-all duration-700" style={{ width: `${s.myPercentage}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-gray-700 w-8 text-right">{s.myPercentage}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 font-bold w-20 uppercase">Avg</span>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gray-400 rounded-full transition-all duration-700" style={{ width: `${s.classAverage}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-gray-500 w-8 text-right">{s.classAverage}%</span>
                        </div>
                        {s.topperPercentage > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-bold w-20 uppercase">Topper</span>
                            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${s.topperPercentage}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-amber-600 w-8 text-right">{s.topperPercentage}%</span>
                          </div>
                        )}
                      </div>
                      {s.topperName && s.topperName !== fullName && (
                        <p className="text-[10px] text-gray-400 font-medium">Section topper: <span className="font-black text-amber-600">{s.topperName}</span></p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Section Toppers Leaderboard */}
              {analytics?.toppers?.length > 0 && (
                <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
                  <CardHeader className="bg-amber-50/40 border-b border-amber-100/40 pb-4">
                    <CardTitle className="text-sm font-black uppercase text-amber-600 tracking-widest flex items-center gap-2">
                      <Award className="w-4 h-4" /> Section Leaderboard
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    {analytics.toppers.map((t: any, i: number) => (
                      <div key={i} className={`flex items-center gap-4 p-3 rounded-2xl transition-all ${t.isCurrentStudent ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50'
                        }`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${i === 0 ? 'bg-amber-400 text-white' :
                          i === 1 ? 'bg-gray-300 text-gray-700' :
                            i === 2 ? 'bg-orange-300 text-white' :
                              'bg-gray-100 text-gray-500'
                          }`}>#{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm truncate ${t.isCurrentStudent ? 'text-blue-700' : 'text-gray-900'}`}>
                            {t.name} {t.isCurrentStudent && <span className="text-[10px] font-black uppercase bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full ml-1">You</span>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-base text-gray-900">{t.percentage}%</p>
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 ml-auto overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${t.percentage}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Additional Academic Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card className="rounded-3xl border-gray-100 shadow-sm bg-white">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Recent Exams
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {exams.length > 0 ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableBody>
                        {exams.slice(0, 10).map((item: any, idx: number) => {
                          const examObj = item.exam;
                          const resultObj = item.result;
                          const subjectName = examObj?.subject?.name || 'Subject';
                          const examName = examObj?.name || 'Exam';
                          const totalMarks = examObj?.total_marks || '-';
                          const hasMarks = resultObj && resultObj.marks_obtained >= 0;
                          const status = examObj?.status || 'pending';

                          return (
                            <TableRow key={idx}>
                              <TableCell>
                                <p className="font-bold text-sm">{examName}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase">{subjectName} • {new Date(examObj.date).toLocaleDateString()}</p>
                              </TableCell>
                              <TableCell className="text-right">
                                {hasMarks ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <p className="font-black text-gray-900">{resultObj.marks_obtained} / {totalMarks}</p>
                                    <Badge className="bg-emerald-50 text-emerald-600 border-none px-2 py-0.5 text-[10px] uppercase font-bold">Completed</Badge>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-end gap-1">
                                    <p className="font-bold text-gray-400">TBA / {totalMarks}</p>
                                    <Badge className="bg-amber-50 text-amber-600 border-none px-2 py-0.5 text-[10px] uppercase font-bold">{status}</Badge>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <FileText className="w-8 h-8 text-gray-200 mb-3" />
                    <p className="text-gray-500 font-medium text-sm">No recent exams.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-gray-100 shadow-sm bg-white overflow-hidden">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Assignments
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {assignments.length > 0 ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableBody>
                        {assignments.map((assig: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <p className="font-bold text-sm text-gray-900">{assig.title}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase">Due: {new Date(assig.dueDate).toLocaleDateString()}</p>
                            </TableCell>
                            <TableCell className="text-right">
                              {currentUser?.role === 'admin' || currentUser?.role === 'teacher' ? (
                                assig.isCompleted ? (
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" onClick={() => handleToggleAssignment(assig.id, false)}>
                                    <Check className="w-3 h-3 mr-1" /> Completed
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleToggleAssignment(assig.id, true)}>
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete
                                  </Button>
                                )
                              ) : (
                                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-none font-bold">
                                  {assig.status === 'pending' || assig.status === 'submitted' ? 'Pending Review' : 'Pending'}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <BookOpen className="w-8 h-8 text-gray-200 mb-3" />
                    <p className="text-gray-500 font-medium text-sm">No assignments found.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Attendance Tab ── */}
        <TabsContent value="attendance" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total School Days</p>
                <p className="text-2xl font-black text-gray-900">{attendanceRecords.filter((r: any) => r.status !== 'holiday').length}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Days Present</p>
                <p className="text-2xl font-black text-emerald-700">{attendanceRecords.filter((r: any) => r.status === 'present').length}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Days Absent</p>
                <p className="text-2xl font-black text-red-700">{attendanceRecords.filter((r: any) => r.status === 'absent').length}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Holidays</p>
                <p className="text-2xl font-black text-gray-600">{attendanceRecords.filter((r: any) => r.status === 'holiday').length}</p>
              </CardContent>
            </Card>
          </div>
          <Card className="rounded-3xl border-gray-100 shadow-sm bg-white overflow-hidden">
            <CardContent className="p-0">
              {attendanceRecords.length > 0 ? (
                <div className="overflow-x-auto w-full min-w-0">
                  <Table>
                    <TableHeader className="bg-gray-50/50">
                      <TableRow>
                        <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Date</TableHead>
                        <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Status</TableHead>
                        <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Marked By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceRecords.map((record) => (
                        <TableRow key={record.id} className="hover:bg-gray-50/50 transition-colors">
                          <TableCell className="py-4 px-8 font-bold text-gray-900 text-sm">
                            {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          </TableCell>
                          <TableCell className="py-4 px-6">
                            <Badge className={`px-3 py-1 text-[10px] font-black uppercase border-none rounded-full ${record.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                              record.status === 'absent' ? 'bg-red-100 text-red-700' :
                              record.status === 'holiday' ? 'bg-gray-100 text-gray-600' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                              {record.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 px-6 text-sm text-gray-500 font-medium">
                            {record.marked_by_user?.first_name} {record.marked_by_user?.last_name}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Calendar className="w-12 h-12 text-gray-200 mb-4" />
                  <p className="text-gray-500 font-medium">No attendance records found.</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Daily attendance data will appear here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Timetable Tab ── */}
        <TabsContent value="timetable" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="border-b border-gray-100 pb-4">
              <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                <Clock className="w-4 h-4" /> Class Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {timetable.length > 0 ? (
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-bold">Day</TableHead>
                      <TableHead className="font-bold">Subject</TableHead>
                      <TableHead className="font-bold">Teacher</TableHead>
                      <TableHead className="font-bold">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timetable.map((slot) => {
                      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                      return (
                        <TableRow key={slot.id}>
                          <TableCell className="font-bold">{days[slot.day_of_week]}</TableCell>
                          <TableCell className="font-semibold text-gray-900">{slot.subjects?.name}</TableCell>
                          <TableCell className="text-gray-500">{slot.users?.first_name} {slot.users?.last_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-gray-50">{slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-10 text-center">
                  <p className="text-gray-500 font-medium">No schedule mapped for this section.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fee History Tab ── */}
        <TabsContent value="fees" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-200 gap-4">
            <div>
              <h3 className="text-sm font-black uppercase text-gray-900 tracking-widest">Financial Ledger</h3>
              <p className="text-xs text-gray-500 font-medium">Complete history of dues, payments, and receipts.</p>
            </div>
            {currentUser?.role === 'admin' && (
              <Button onClick={() => setIsGenerateFeeOpen(true)} className="bg-gray-900 text-white hover:bg-black font-bold rounded-xl h-10 px-6 w-full sm:w-auto shrink-0">
                + Generate Fee
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Expected</p>
                <p className="text-2xl font-black text-gray-900">₹{feeLedgerSummary ? (feeLedgerSummary.totalCharged + feeLedgerSummary.totalFines - feeLedgerSummary.totalDiscounts).toLocaleString() : fees.reduce((sum, f) => sum + Math.max(0, Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)), 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Total Paid</p>
                <p className="text-2xl font-black text-green-700">₹{feeLedgerSummary ? feeLedgerSummary.totalPaid.toLocaleString() : fees.reduce((sum, f) => sum + Number(f.paid_amount || 0), 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Total Pending</p>
                <p className="text-2xl font-black text-red-700">₹{feeLedgerSummary ? feeLedgerSummary.closingBalance.toLocaleString() : fees.reduce((sum, f) => sum + Math.max(0, Math.max(0, Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)) - Number(f.paid_amount || 0)), 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">Date/Due</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-gray-400">Description</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-gray-400 text-right">Amount (₹)</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-gray-400 text-center">Status</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-gray-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-gray-400 font-medium">No fee records found.</TableCell>
                    </TableRow>
                  ) : (
                    fees.map((f: any) => (
                      <TableRow key={f.id} className="group hover:bg-gray-50/50">
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-900">{new Date(f.due_date || f.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          {f.paid_date && <div className="text-[10px] text-green-600 font-bold uppercase mt-1">Paid {new Date(f.paid_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-gray-900 text-sm">{f.fee_structure?.name || f.title || f.remarks || 'Fee Payment'}</div>
                          {f.receipt_number && <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">RCPT: {f.receipt_number}</div>}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="font-black text-gray-900 text-base">₹{Math.max(0, Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)).toLocaleString()}</div>

                          {(Number(f.late_fee || 0) > 0 || Number(f.discount_amount || 0) > 0) && (
                            <div className="text-[9px] text-gray-500 font-bold uppercase mt-1 tracking-wider">
                              Base: ₹{Number(f.amount || 0).toLocaleString()}
                              {Number(f.late_fee || 0) > 0 && <span className="text-red-500 ml-1">+₹{Number(f.late_fee).toLocaleString()} Fine</span>}
                              {Number(f.discount_amount || 0) > 0 && <span className="text-emerald-500 ml-1">-₹{Number(f.discount_amount).toLocaleString()} Off</span>}
                            </div>
                          )}

                          {f.paid_amount > 0 && f.paid_amount < Math.max(0, Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)) && (
                            <div className="text-[10px] text-amber-600 font-black uppercase mt-1">Bal: ₹{(Math.max(0, Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)) - f.paid_amount).toLocaleString()}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`px-3 py-1 text-[10px] font-black uppercase border-none rounded-full ${f.status === 'paid' ? 'bg-green-100 text-green-700' :
                            f.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                            {f.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {f.status !== 'paid' && currentUser?.role === 'admin' && (
                              <Button size="sm" onClick={() => setMarkPaidFee(f)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-lg h-8 px-4 text-xs whitespace-nowrap shadow-none">
                                Collect
                              </Button>
                            )}
                            {f.status === 'paid' && (
                              <Button size="sm" variant="outline" className="border-gray-200 text-gray-600 font-bold rounded-lg h-8 px-3 text-xs whitespace-nowrap" onClick={() => handleDownloadReceipt(f)}>
                                <Download className="w-3.5 h-3.5 mr-1" /> Receipt
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inventory Tab ── */}
        <TabsContent value="inventory" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
              <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-orange-500" /> Issued Inventory Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow className="hover:bg-transparent border-gray-100">
                    <TableHead className="font-bold text-gray-900 py-4 px-6 text-xs uppercase tracking-widest">Item</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 px-6 text-xs uppercase tracking-widest">Quantity</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 px-6 text-xs uppercase tracking-widest">Status</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 px-6 text-xs uppercase tracking-widest">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-gray-500 font-medium">
                        No inventory issued yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventory.map((item) => (
                      <TableRow key={item.id} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <TableCell className="py-4 px-6 font-bold text-gray-900">
                          {item.school_inventory?.name}
                        </TableCell>
                        <TableCell className="py-4 px-6 font-medium text-gray-600">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge className={`px-3 py-1 text-[10px] font-black uppercase border-none rounded-full ${item.status === 'issued' ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'returned' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6 text-sm text-gray-500 font-medium">
                          {item.issue_date ? new Date(item.issue_date).toLocaleDateString() : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Communication Tab ── */}
        <TabsContent value="communication" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="rounded-3xl border-gray-100 shadow-sm bg-white">
              <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-500" /> Primary Contact Info
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Student Contact</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {student.user?.phone || 'N/A'}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2 mt-1"><Mail className="w-4 h-4 text-gray-400" /> {student.user?.email || 'N/A'}</p>
                </div>
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Parent / Guardian Contact</p>
                  {parent ? (
                    <>
                      <p className="font-semibold text-gray-900 mb-1">{parent.user?.first_name} {parent.user?.last_name}</p>
                      <p className="font-semibold text-gray-900 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {parent.user?.phone || 'N/A'}</p>
                      <p className="font-semibold text-gray-900 flex items-center gap-2 mt-1"><Mail className="w-4 h-4 text-gray-400" /> {parent.user?.email || 'N/A'}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 font-medium">No parent linked.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-gray-100 shadow-sm bg-white">
              <CardHeader className="bg-rose-50/50 border-b border-rose-100/50 pb-4">
                <CardTitle className="text-sm font-black uppercase text-rose-500 tracking-widest flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Primary Emergency Number</p>
                <p className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-rose-500" /> {parent?.user?.phone || student.user?.phone || 'Not Available'}
                </p>
                <Button variant="outline" className="mt-6 w-full h-10 rounded-xl font-bold border-gray-200 text-gray-700" onClick={() => setIsEmergencyModalOpen(true)}>Trigger Emergency Alert</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {student && (
        <>
          <GenerateFeeModal
            isOpen={isGenerateFeeOpen}
            onClose={() => setIsGenerateFeeOpen(false)}
            studentId={id!}
            studentName={`${student.user?.first_name} ${student.user?.last_name}`}
            onSuccess={fetchFeeData}
          />
          <MarkPaidModal
            isOpen={!!markPaidFee}
            onClose={() => setMarkPaidFee(null)}
            fee={markPaidFee}
            studentName={`${student.user?.first_name} ${student.user?.last_name}`}
            onSuccess={fetchFeeData}
          />
          <EmergencyAlertModal
            isOpen={isEmergencyModalOpen}
            onClose={() => setIsEmergencyModalOpen(false)}
            studentId={id!}
            studentName={`${student.user?.first_name} ${student.user?.last_name}`}
          />
        </>
      )}
    </div>
  );
}
