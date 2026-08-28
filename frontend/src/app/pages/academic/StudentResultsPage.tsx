import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Award, TrendingUp, AlertCircle, GraduationCap, User, FileDown,
  Trophy, Sparkles, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';
import {
  generateExamReportCardPdf,
  generateAnnualReportPdf,
} from '../../../lib/reportCard';

function gradeColor(pct: number | null) {
  if (pct === null) return 'bg-slate-100 text-slate-500';
  if (pct >= 90) return 'bg-emerald-100 text-emerald-700';
  if (pct >= 75) return 'bg-blue-100 text-blue-700';
  if (pct >= 50) return 'bg-yellow-100 text-yellow-700';
  return 'bg-rose-100 text-rose-700';
}

function barColor(pct: number) {
  if (pct >= 75) return 'from-green-500 to-emerald-400';
  if (pct >= 50) return 'from-amber-500 to-amber-400';
  return 'from-rose-500 to-rose-400';
}

function ScoreRing({ pct }: { pct: number | null }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fill = pct !== null ? (pct / 100) * circ : 0;
  const color = pct === null ? '#cbd5e1' : pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center w-16 h-16 shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ - fill}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-black text-slate-700">
        {pct !== null ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

interface ExamReport {
  examId: string;
  examName: string;
  date?: string | null;
  subjects: {
    subject: string;
    marksObtained: number | null;
    maxMarks: number;
    percentage: number | null;
    grade: string | null;
    isAbsent?: boolean;
  }[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  classPosition?: number | null;
  classSize?: number | null;
  remarks?: string | null;
}

export function StudentResultsPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  // 'reports' = exam-wise report cards (new backend). 'legacy' = classic results feed
  // (used when the /exam-reports endpoint is unavailable or has no graded exams yet).
  const [mode, setMode] = useState<'reports' | 'legacy'>('reports');
  const [legacy, setLegacy] = useState<any>(null);
  const [legacyTab, setLegacyTab] = useState<'assignments' | 'exams'>('exams');

  // Parent child selector
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(false);

  const loadLegacy = async (studentId?: string) => {
    if (isParent && studentId) {
      // Parent endpoint returns raw exam_results rows — adapt to the page shape
      const res = await api.getChildResults(studentId);
      const examResults = (res || []).map((r: any) => ({
        id: r.id,
        type: 'exam',
        title: r.exam?.name || 'Exam',
        subject: r.exam?.subject?.name || 'General',
        teacher: '',
        date: r.created_at,
        maxMarks: Number(r.exam?.total_marks || 0),
        marksObtained: r.marks_obtained !== null ? Number(r.marks_obtained) : null,
        percentage: r.marks_obtained !== null && Number(r.exam?.total_marks) > 0
          ? Math.round((Number(r.marks_obtained) / Number(r.exam?.total_marks)) * 100)
          : null,
        feedback: r.remarks || '',
        isAbsent: r.is_absent || false,
        status: 'graded',
        grade: r.grade,
      }));
      const summary = examResults.length > 0 ? {
        avgPercentage: Math.round(examResults.filter((e: any) => e.percentage !== null).reduce((s: number, e: any) => s + e.percentage, 0) / (examResults.filter((e: any) => e.percentage !== null).length || 1)),
        totalLMS: 0,
        totalExams: examResults.length,
      } : null;
      setLegacy({ lmsResults: [], examResults, summary });
    } else {
      const res = await api.getStudentResults();
      setLegacy(res);
    }
    setMode('legacy');
    setLoading(false);
  };

const loadData = async (studentId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getStudentExamReports(studentId);
      const exams: ExamReport[] = res?.exams || [];
      if (exams.length > 0) {
        setData(res);
        setMode('reports');
        setSelectedExamId(exams[0]?.examId || null);
        setLoading(false);
        return;
      }
      // Endpoint works but nothing graded yet — try the classic feed so
      // graded assignments / ungrouped exams still show up.
      await loadLegacy(studentId);
    } catch (err: any) {
      console.error('exam-reports unavailable, falling back to classic results', err);
      try {
        await loadLegacy(studentId);
      } catch (err2: any) {
        setError(err2?.message || err?.message || 'Failed to load results');
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isParent) {
      loadChildren();
    } else {
      loadData(user?.student_id || user?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isParent && selectedChildId) {
      loadData(selectedChildId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  const loadChildren = async () => {
    setChildrenLoading(true);
    try {
      const children = await api.getParentChildren();
      const kids = (children || []).map((link: any) => ({
        id: link.student?.id,
        name: `${link.student?.user?.first_name || ''} ${link.student?.user?.last_name || ''}`.trim(),
        class: `${link.student?.section?.class?.name || ''} ${link.student?.section?.name || ''}`.trim(),
        relationship: link.relationship,
      })).filter((k: any) => k.id);
      setChildren(kids);
      if (kids.length > 0) {
        setSelectedChildId(kids[0].id);
      } else {
        setLoading(false);
      }
    } catch {
      toast.error('Failed to load children');
      setLoading(false);
    } finally {
      setChildrenLoading(false);
    }
  };

  const refresh = () => {
    if (isParent) loadData(selectedChildId || undefined);
    else loadData(user?.student_id || user?.id);
  };

  const exams: ExamReport[] = data?.exams || [];
  const overall = data?.overall;
  const attendance = data?.attendance;
  const studentInfo = data?.student;
  const selectedExam = exams.find(e => e.examId === selectedExamId) || exams[0];

  const schoolName = user?.school || user?.school_name || 'Kautix School';
  const studentName = studentInfo?.name || user?.name || 'Student';
  const className = [studentInfo?.class, studentInfo?.section].filter(Boolean).join('-');

  const handleDownloadPdf = async (exam: ExamReport) => {
    try {
      setPdfBusy(exam.examId);
      await import('../../../lib/reportCard');
      generateExamReportCardPdf({
        schoolName,
        examName: exam.examName,
        examDate: exam.date,
        studentName,
        className,
        rollNumber: studentInfo?.rollNumber,
        admissionNumber: studentInfo?.admissionNumber,
        subjects: exam.subjects,
        totalObtained: exam.totalObtained,
        totalMax: exam.totalMax,
        percentage: exam.percentage,
        grade: exam.grade,
        classPosition: exam.classPosition,
        classSize: exam.classSize,
        attendanceRate: attendance?.rate ?? null,
        remarks: exam.remarks,
      });
      toast.success('Report card downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setPdfBusy(null);
    }
  };

  const handleDownloadAnnual = async () => {
    if (!exams.length) return;
    try {
      setPdfBusy('annual');
      await import('../../../lib/reportCard');
      generateAnnualReportPdf({
        schoolName,
        studentName,
        className,
        rollNumber: studentInfo?.rollNumber,
        admissionNumber: studentInfo?.admissionNumber,
        attendanceRate: attendance?.rate ?? null,
        exams: exams.map(e => ({
          examName: e.examName,
          date: e.date,
          subjects: e.subjects,
          totalObtained: e.totalObtained,
          totalMax: e.totalMax,
          percentage: e.percentage,
          grade: e.grade,
          classPosition: e.classPosition,
          classSize: e.classSize,
          remarks: e.remarks,
        })),
        overall: {
          totalObtained: overall?.totalObtained ?? 0,
          totalMax: overall?.totalMax ?? 0,
          avgPercentage: overall?.avgPercentage ?? 0,
          grade: overall?.grade || '—',
          bestExam: overall?.bestExam || null,
        },
      });
      toast.success('Annual report downloaded');
    } catch {
      toast.error('Failed to generate annual report');
    } finally {
      setPdfBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-64 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (error && !data) {
    const isProfileMissing = error.toLowerCase().includes('student not found') || error.toLowerCase().includes('student profile not found');
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-10 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Couldn't load results</h2>
              <p className="text-sm text-slate-500 mt-2 max-w-md font-medium">
                {isProfileMissing
                  ? 'Your login account is not linked to a student profile yet. Please ask your School Admin to register you as a student (with class & section), and your report cards will appear here.'
                  : error}
              </p>
            </div>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 px-6" onClick={refresh}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

// ── LEGACY VIEW: classic results feed (fallback when exam-reports is
  // unavailable on the current backend or nothing is graded yet) ──
  if (mode === 'legacy') {
    const lmsResults: any[] = legacy?.lmsResults || [];
    const examResults: any[] = legacy?.examResults || [];
    const summary = legacy?.summary;
    const displayList = legacyTab === 'assignments' ? lmsResults : examResults;

    return (
      <div className="dashboard-page space-y-6 min-h-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              My Results
            </h1>
            <p className="text-slate-500 font-medium mt-1 ml-14">All graded work, exams, and teacher feedback in one place.</p>
          </div>
          <Button variant="outline" className="flex items-center gap-2 rounded-xl" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Child selector — parents only */}
        {isParent && (
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-4">
            <p className="text-xs font-black uppercase text-violet-400 tracking-widest mb-3 flex items-center gap-2">
              <User className="w-3 h-3" /> Select Child
            </p>
            {childrenLoading ? (
              <div className="flex gap-3">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-40 rounded-xl" />)}</div>
            ) : children.length === 0 ? (
              <p className="text-sm text-slate-400">No children linked to your account.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${selectedChildId === child.id
                      ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/25'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:text-violet-700'}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${selectedChildId === child.id ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'}`}>
                      {child.name?.[0] || '?'}
                    </div>
                    <div className="text-left">
                      <p className="leading-tight">{child.name}</p>
                      <p className={`text-[10px] font-medium leading-tight ${selectedChildId === child.id ? 'text-violet-200' : 'text-slate-400'}`}>{child.class}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-gradient-to-br from-violet-50 to-white">
              <CardContent className="p-5">
                <p className="text-xs font-black uppercase text-violet-400 tracking-widest">Avg Score</p>
                <p className="text-3xl font-black text-violet-700 mt-1">{summary.avgPercentage !== null && summary.avgPercentage !== undefined ? `${summary.avgPercentage}%` : '—'}</p>
                <p className="text-xs text-slate-400 font-medium mt-1">Across all results</p>
              </CardContent>
            </Card>
            {!isParent && (
              <Card className="rounded-2xl border-slate-100 shadow-sm bg-gradient-to-br from-blue-50 to-white">
                <CardContent className="p-5">
                  <p className="text-xs font-black uppercase text-blue-400 tracking-widest">Assignments</p>
                  <p className="text-3xl font-black text-blue-700 mt-1">{summary.totalLMS ?? 0}</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">Homework & tasks</p>
                </CardContent>
              </Card>
            )}
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="p-5">
                <p className="text-xs font-black uppercase text-emerald-400 tracking-widest">Exams</p>
                <p className="text-3xl font-black text-emerald-700 mt-1">{summary.totalExams ?? 0}</p>
                <p className="text-xs text-slate-400 font-medium mt-1">Graded exams</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs — parents only get exam results from their endpoint */}
        {!isParent && (
          <div className="flex gap-2 bg-slate-100 rounded-2xl p-1 w-fit">
            <button
              onClick={() => setLegacyTab('assignments')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${legacyTab === 'assignments' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Assignments & Homework
            </button>
            <button
              onClick={() => setLegacyTab('exams')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${legacyTab === 'exams' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Exams
            </button>
          </div>
        )}

        {/* Results List */}
        <Card className="rounded-3xl border-slate-100 shadow-sm bg-white">
          <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
            <CardTitle className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <Award className="w-4 h-4" />
              {isParent ? 'Exam Results' : legacyTab === 'assignments' ? 'Assignment & Homework Results' : 'Exam Results'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(isParent ? examResults : displayList).length === 0 ? (
              <div className="p-12 flex flex-col items-center gap-3 text-slate-400">
                <Award className="w-12 h-12 opacity-20" />
                <p className="font-bold">No {isParent || legacyTab === 'exams' ? 'exam results' : 'graded assignments'} found yet.</p>
                <p className="text-sm">Results will appear here once the teacher grades the work.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(isParent ? examResults : displayList).map((item: any) => (
                  <div key={item.id} className="p-5 sm:p-6 hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <ScoreRing pct={item.isAbsent ? null : item.percentage} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-black text-slate-900 text-base">{item.title}</h3>
                          {item.isAbsent && (
                            <span className="text-[10px] font-black uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Absent</span>
                          )}
                          {!item.isAbsent && item.percentage !== null && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${gradeColor(item.percentage)}`}>
                              {item.grade || '—'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium mb-3">
                          {item.subject && <span>{item.subject}</span>}
                          {item.teacher && <span>By {item.teacher}</span>}
                          <span>
                            {new Date(item.date || item.dueDate || item.submissionDate || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {!item.isAbsent && item.marksObtained !== null && item.marksObtained !== undefined && (
                            <span className="font-bold text-slate-700">{item.marksObtained} / {item.maxMarks} marks</span>
                          )}
                        </div>
                        {item.feedback ? (
                          <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-100 rounded-2xl p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mb-0.5">Teacher's Review</p>
                            <p className="text-sm text-slate-700 font-medium leading-relaxed">{item.feedback}</p>
                          </div>
                        ) : (
                          <p className="text-xs italic text-slate-400">No review added yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="dashboard-page space-y-6 min-h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            My Results
          </h1>
          <p className="text-slate-500 font-medium mt-1 ml-14">Exam-wise report cards, grades, and teacher feedback.</p>
        </div>
        <Button
          variant="outline"
          className="flex items-center gap-2 rounded-xl"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Child selector — parents only */}
      {isParent && (
        <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-4">
          <p className="text-xs font-black uppercase text-violet-400 tracking-widest mb-3 flex items-center gap-2">
            <User className="w-3 h-3" /> Select Child
          </p>
          {childrenLoading ? (
            <div className="flex gap-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 w-40 rounded-xl" />)}
            </div>
          ) : children.length === 0 ? (
            <p className="text-sm text-slate-400">No children linked to your account.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChildId(child.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${selectedChildId === child.id
                    ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/25'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:text-violet-700'
                    }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${selectedChildId === child.id ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'}`}>
                    {child.name?.[0] || '?'}
                  </div>
                  <div className="text-left">
                    <p className="leading-tight">{child.name}</p>
                    <p className={`text-[10px] font-medium leading-tight ${selectedChildId === child.id ? 'text-violet-200' : 'text-slate-400'}`}>{child.class}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
{/* Overall Performance + Exam tabs */}
      <Card className="border-none shadow-sm bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Overall Performance</p>
              <h2 className="text-2xl font-black mt-1">
                {overall?.avgPercentage != null ? `${overall.avgPercentage}%` : '—'}
                {overall?.grade && <span className="ml-3 text-sm font-black px-3 py-1 rounded-full bg-white/15 text-indigo-100 uppercase">{overall.grade}</span>}
              </h2>
            </div>
            {overall?.bestExam && (
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 flex items-center justify-end gap-1"><Trophy className="w-3 h-3" /> Best Exam</p>
                <p className="font-black text-lg mt-1">{overall.bestExam.name}</p>
                <p className="text-xs text-indigo-300">{overall.bestExam.percentage}%</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white/10 border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase text-indigo-300">Exams Taken</p>
              <p className="text-2xl font-black mt-1">{overall?.totalExams ?? 0}</p>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase text-indigo-300">Attendance</p>
              <p className="text-2xl font-black mt-1">{attendance?.rate != null ? `${attendance.rate}%` : '—'}</p>
              <p className="text-[11px] text-indigo-300 mt-0.5">{attendance?.present ?? 0}/{attendance?.total ?? 0} present</p>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase text-indigo-300">Class</p>
              <p className="text-xl font-black mt-1 truncate">{className || '—'}</p>
              <p className="text-[11px] text-indigo-300 mt-0.5">Roll {studentInfo?.rollNumber ?? '—'}</p>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase text-indigo-300">Student</p>
              <p className="text-xl font-black mt-1 truncate">{studentName}</p>
              <p className="text-[11px] text-indigo-300 mt-0.5">Adm {studentInfo?.admissionNumber || '—'}</p>
            </div>
          </div>

          {/* Exam tab pills */}
          <div className="flex flex-wrap gap-2 mt-5">
            {exams.map((exam) => (
              <button
                key={exam.examId}
                onClick={() => setSelectedExamId(exam.examId)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${selectedExamId === exam.examId
                  ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-white/5 border-white/15 text-indigo-200 hover:bg-white/10'}
                `}
              >
                {exam.examName}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
{/* Selected exam report */}
      {selectedExam ? (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Award className="w-5 h-5 text-violet-600" />
              {selectedExam.examName}
              {selectedExam.date && <span className="text-sm font-semibold text-slate-400 normal-case"> · {new Date(selectedExam.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button
                className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold h-10"
                onClick={() => handleDownloadPdf(selectedExam)}
                disabled={pdfBusy === selectedExam.examId}
              >
                <FileDown className="w-4 h-4" /> {pdfBusy === selectedExam.examId ? 'Generating…' : 'Download Report'}
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2 rounded-xl font-bold h-10"
                onClick={handleDownloadAnnual}
                disabled={pdfBusy === 'annual' || exams.length === 0}
              >
                <FileDown className="w-4 h-4" /> {pdfBusy === 'annual' ? 'Generating…' : 'Full Year Report'}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <SummaryCard label="Overall Score" value={`${selectedExam.totalObtained} / ${selectedExam.totalMax}`} />
              <SummaryCard label="Percentage" value={`${selectedExam.percentage}%`} valueClass="text-emerald-600" />
              <SummaryCard label="Grade" value={selectedExam.grade} valueClass="text-indigo-600" />
              <SummaryCard label="Class Position" value={selectedExam.classPosition ? `#${selectedExam.classPosition}${selectedExam.classSize ? ` / ${selectedExam.classSize}` : ''}` : '—'} />
            </div>
{/* Subject marks table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="text-left p-3 text-xs font-black uppercase tracking-wider">Subject</th>
                    <th className="p-3 text-xs font-black uppercase tracking-wider text-center">Max</th>
                    <th className="p-3 text-xs font-black uppercase tracking-wider text-center">Obtained</th>
                    <th className="p-3 text-xs font-black uppercase tracking-wider text-center">%</th>
                    <th className="p-3 text-xs font-black uppercase tracking-wider text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedExam.subjects.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="p-3 font-bold text-slate-800">{s.subject}</td>
                      <td className="p-3 text-center text-slate-500">{s.maxMarks}</td>
                      <td className="p-3 text-center font-bold text-slate-800">
                        {s.isAbsent ? <span className="text-xs font-bold uppercase text-rose-600">Absent</span> : (s.marksObtained ?? '—')}
                      </td>
                      <td className="p-3 text-center font-semibold text-slate-600">{s.percentage !== null ? `${s.percentage}%` : '—'}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-black px-2 py-1 rounded-full uppercase ${gradeColor(s.percentage)}`}>{s.grade || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td className="p-3 font-black text-slate-900">TOTAL</td>
                    <td className="p-3 text-center font-bold text-slate-700">{selectedExam.totalMax}</td>
                    <td className="p-3 text-center font-black text-slate-900">{selectedExam.totalObtained}</td>
                    <td className="p-3 text-center font-black text-emerald-600">{selectedExam.percentage}%</td>
                    <td className="p-3 text-center"><span className={`text-xs font-black px-2 py-1 rounded-full uppercase ${gradeColor(selectedExam.percentage)}`}>{selectedExam.grade}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
{/* Performance bars */}
            <div className="mt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Performance Analysis</h3>
              <div className="space-y-3">
                {selectedExam.subjects.map((s, i) => {
                  const pct = s.percentage ?? 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-32 text-sm font-bold text-slate-700 truncate">{s.subject}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barColor(pct)} rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                      <span className="w-16 text-right text-sm font-black text-slate-800">{s.percentage !== null ? `${s.percentage}%` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Teacher remarks */}
            <div className="mt-6">
              <h3 className="text-sm font-black tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Teacher's Remarks</h3>
              {selectedExam.remarks ? (
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-sm text-slate-700 font-medium italic leading-relaxed">"{selectedExam.remarks}"</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-400 text-sm italic">
                  No remarks recorded for this exam.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <Award className="w-14 h-14 text-slate-200" />
            <p className="text-lg font-black text-slate-600">No exam results published yet.</p>
            <p className="text-sm text-slate-400">Report cards will appear here once your teachers grade the exams.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, valueClass = 'text-slate-900' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-xl font-black mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}