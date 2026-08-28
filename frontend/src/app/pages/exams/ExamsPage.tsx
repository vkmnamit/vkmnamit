import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import {
  Plus, Calendar, FileText, Award, Download, Search, Clock,
  MapPin, Bell, BookOpen, CheckCircle2, Timer
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AddExamModal } from '../../components/modals/AddExamModal';
import { MarksEntryModal } from '../../components/modals/MarksEntryModal';
import { ViewRegistryModal } from '../../components/modals/ViewRegistryModal';
import { generateReportCardPDF, generateExamProtocolPDF } from '../../../lib/pdf';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { ClassSectionFilter } from '../../components/ClassSectionFilter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse date strings like "September 15, 2026" back to Date objects. */
function parseFormattedDate(dateStr: string): Date {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

interface ExamGroup {
  name: string;
  exams: any[];
  minDate: Date;
  maxDate: Date;
  class: string;
  section?: string | null;
  academicYear?: string | null;
  invigilator?: string | null;
  studentsCount?: number | null;
  /** Per-exam instructions; deduped at render time. Empty → default instructions shown. */
  instructions: string[];
}

/** Group individual subject-level exams by their exam name (e.g. "Half Yearly"). */
function groupExamsByName(exams: any[]): ExamGroup[] {
  const groups: Record<string, ExamGroup> = {};
  for (const exam of exams) {
    const key = exam.name || exam.subject;
    const d = parseFormattedDate(exam.date);
    if (!groups[key]) {
      groups[key] = {
        name: key,
        exams: [],
        minDate: d,
        maxDate: d,
        class: exam.class,
        section: exam.section ?? null,
        academicYear: exam.academicYear ?? null,
        invigilator: exam.invigilator ?? null,
        studentsCount: exam.studentsCount ?? null,
        instructions: [],
      };
    }
    groups[key].exams.push(exam);
    if (exam.section && !groups[key].section) groups[key].section = exam.section;
    if (exam.academicYear && !groups[key].academicYear) groups[key].academicYear = exam.academicYear;
    if (exam.invigilator && !groups[key].invigilator) groups[key].invigilator = exam.invigilator;
    if (exam.instructions) groups[key].instructions.push(exam.instructions);
    if (d < groups[key].minDate) groups[key].minDate = d;
    if (d > groups[key].maxDate) groups[key].maxDate = d;
  }
  // Sort each group's exams by date ascending
  for (const g of Object.values(groups)) {
    g.exams.sort((a, b) => parseFormattedDate(a.date).getTime() - parseFormattedDate(b.date).getTime());
  }
  return Object.values(groups).sort((a, b) => a.minDate.getTime() - b.minDate.getTime());
}

/** Shared instructions shown when an exam has none of its own. */
const DEFAULT_EXAM_INSTRUCTIONS = [
  'Report 30 minutes before the exam',
  'Carry required stationery',
  'Follow examination rules',
];

/** Format a Date as "15 Sep 2026". */
function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Exam Details dialog (shared by Upcoming / Current / Past cards) ─────────

function ExamDetailsDialog({ group, onClose }: { group: ExamGroup | null; onClose: () => void }) {
  const instructions = group?.instructions.length ? group.instructions : DEFAULT_EXAM_INSTRUCTIONS;
  const rooms = Array.from(new Set((group?.exams || []).map((e: any) => e.room).filter(Boolean)));
  return (
    <Dialog open={!!group} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[640px] max-h-[90vh] overflow-y-auto bg-white rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">
            {group?.name || 'Exam'}
          </DialogTitle>
          <DialogDescription className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {group?.academicYear || 'Academic Year'} · Class {group?.class || '—'}{group?.section ? ` • Section ${group.section}` : ''}
          </DialogDescription>
        </DialogHeader>

        {group && (
          <div className="space-y-6 py-2">
            {/* Date range */}
            <p className="text-sm font-bold text-blue-600">
              {fmtShort(group.minDate)} – {fmtShort(group.maxDate)}
            </p>

            {/* Examination schedule */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Examination Schedule</p>
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <th className="text-left px-4 py-2.5">Subject</th>
                      <th className="text-left px-4 py-2.5">Date</th>
                      <th className="text-left px-4 py-2.5">Time</th>
                      <th className="text-left px-4 py-2.5">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.exams.map((exam: any, i: number) => (
                      <tr key={i} className="text-gray-700">
                        <td className="px-4 py-3 font-bold text-gray-900">{exam.subject}</td>
                        <td className="px-4 py-3 font-medium">{exam.date}</td>
                        <td className="px-4 py-3 font-medium">{exam.time && exam.time !== 'TBA' ? exam.time : 'TBA'}</td>
                        <td className="px-4 py-3 font-medium">{exam.room || 'TBA'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Exam centre */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Exam Centre</p>
              <div className="flex flex-wrap items-center gap-2">
                {rooms.length > 0 ? (
                  rooms.map((room, i) => (
                    <Badge key={i} className="bg-gray-100 text-gray-700 border-none font-bold text-[11px] px-3 py-1">
                      Room {room}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 font-medium">Rooms to be announced</span>
                )}
              </div>
              {group.invigilator && (
                <p className="text-xs text-gray-500 font-medium mt-2">
                  Invigilator: <span className="font-bold text-gray-700">{group.invigilator}</span>
                </p>
              )}
            </div>

            {/* Instructions */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Instructions</p>
              <ol className="space-y-1.5">
                {instructions.map((inst, i) => (
                  <li key={i} className="text-sm text-gray-600 font-medium flex gap-2">
                    <span className="font-black text-gray-400">{i + 1}.</span> {inst}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full h-11 rounded-xl font-bold uppercase text-[10px] tracking-wider border-gray-200">
            Back to Exams
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExamsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const isStaff = isAdmin || isTeacher;

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Staff-only modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const [isRegistryModalOpen, setIsRegistryModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any>(null);

  // Staff-only filters
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [selectedSectionId, setSelectedSectionId] = useState('all');
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [examTypes, setExamTypes] = useState<any[]>([]);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState('all');

  // "View Full Details" dialog (student/parent)
  const [detailsGroup, setDetailsGroup] = useState<ExamGroup | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStaff) return;
    const isFirst = !data;
    fetchExams(!isFirst);
    if (isFirst) fetchClasses();
  }, [selectedClassId, selectedSectionId, selectedExamTypeId, isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    api.getExamTypes().then(types => {
      setExamTypes(Array.isArray(types) ? types : []);
    }).catch(() => {});
  }, [isStaff]);

  useEffect(() => {
    if (isStaff) return;
    fetchExams();
  }, [user]);

  const fetchClasses = async () => {
    try {
      const classData = await api.getClasses();
      setClasses(classData);
    } catch {
      console.error('Failed to load classes');
    }
  };

  const fetchExams = async (isFilter = false) => {
    try {
      isFilter ? setIsRefreshing(true) : setLoading(true);
      const params: any = { dashboard: true };
      if (isStaff) {
        if (selectedClassId !== 'all') params.classId = selectedClassId;
        if (selectedSectionId !== 'all') params.sectionId = selectedSectionId;
        if (selectedExamTypeId !== 'all') params.examTypeId = selectedExamTypeId;
      }
      const examsData = await api.getExams(params);
      setData(examsData);
    } catch {
      console.error('Failed to load exams');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // ── Action handlers ────────────────────────────────────────────────────────

  /**
   * Download a full report card (all subjects) for a completed exam group.
   */
  const handleDownloadGroupReport = async (group: ExamGroup) => {
    const toastId = toast.loading('Generating report card...');
    try {
      const dash = await api.getStudentDashboard();
      const profile = dash?.student || dash?.profile || dash;
      const studentName = `${profile?.user?.first_name || profile?.first_name || ''} ${profile?.user?.last_name || profile?.last_name || ''}`.trim() || 'Student';
      const admissionNumber = profile?.admission_number || profile?.admissionNumber || '';
      const classSection = `${profile?.section?.class?.name || ''}-${profile?.section?.name || ''}`.replace(/^-|-$/g, '') || group.class;

      const resultsData = await api.getStudentResults();
      const matching = (resultsData?.examResults || []).filter((r: any) => r.title === group.name);
      if (matching.length === 0) {
        toast.error('No graded results found for this exam yet.', { id: toastId });
        return;
      }

      const subjects = matching.map((r: any) => ({
        subject: r.subject || 'Subject',
        marks: r.marksObtained ?? 0,
        total: r.maxMarks || 100,
        grade: r.grade || 'B',
      }));
      const totalMarks = subjects.reduce((s, x) => s + x.total, 0) || 1;
      const obtained = subjects.reduce((s, x) => s + x.marks, 0);
      const overallScore = Math.round((obtained / totalMarks) * 10000) / 100;

      generateReportCardPDF({
        schoolName: user?.school_name || 'Kautix International School',
        studentName,
        admissionNumber,
        classSection,
        examName: group.name || 'Examination',
        academicSession: group.academicYear || '2026-27',
        subjects,
        overall: { percentage: overallScore, grade: subjects[0]?.grade || 'B' },
      });
      toast.success('Report Card generated successfully', { id: toastId });
    } catch {
      toast.error('Failed to generate report card', { id: toastId });
    }
  };

  const handleDownloadProtocol = () => {
    let filterLabel = 'All Classes';
    if (selectedClassId !== 'all') {
      const cls = classes.find(c => c.id === selectedClassId);
      filterLabel = cls ? cls.name : 'Class';
      if (selectedSectionId !== 'all') {
        const sec = availableSections.find(s => s.id === selectedSectionId);
        if (sec) filterLabel += ` - ${sec.name}`;
      }
    }
    generateExamProtocolPDF({
      schoolName: user?.school_name || 'Kautix International School',
      filterLabel,
      upcoming: data?.upcoming || [],
      results: data?.results || [],
    });
  };

  const handleNotifyPending = async () => {
    const toastId = toast.loading('Sending reminders to teachers & admins...');
    try {
      const res = await api.notifyPendingMarks();
      if (res.count === 0) {
        toast.success('No pending exams found! All marks are up to date.', { id: toastId });
      } else {
        toast.success(`Sent reminders for ${res.count} pending exam(s)`, { id: toastId });
      }
    } catch {
      toast.error('Failed to send reminders', { id: toastId });
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const upcomingExams: any[] = data?.upcoming || [];
  const recentResults: any[] = data?.results || [];

  // Today at midnight for date comparisons
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const allGroups = useMemo(() => groupExamsByName(upcomingExams), [upcomingExams]);

  const upcomingGroups = useMemo(() =>
    allGroups.filter(g => {
      const min = new Date(g.minDate); min.setHours(0, 0, 0, 0);
      return min > today;
    }),
    [allGroups, today]
  );

  const currentGroups = useMemo(() =>
    allGroups.filter(g => {
      const min = new Date(g.minDate); min.setHours(0, 0, 0, 0);
      const max = new Date(g.maxDate); max.setHours(23, 59, 59, 999);
      return min <= today && max >= today;
    }),
    [allGroups, today]
  );

  const daysUntilNext = upcomingGroups.length > 0
    ? Math.ceil((upcomingGroups[0].minDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STUDENT / PARENT VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (!isStaff) {
    const q = searchTerm.toLowerCase();
    const filteredUpcoming = upcomingGroups.filter(g =>
      !q || g.name.toLowerCase().includes(q) || g.exams.some((e: any) => e.subject.toLowerCase().includes(q))
    );
    const filteredCurrent = currentGroups.filter(g =>
      !q || g.name.toLowerCase().includes(q) || g.exams.some((e: any) => e.subject.toLowerCase().includes(q))
    );
    const filteredPast = recentResults.filter((r: any) =>
      !q || (r.name || '').toLowerCase().includes(q) || (r.subject || '').toLowerCase().includes(q)
    );

    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">My Exams</h1>
            <p className="text-sm text-gray-500 font-medium mt-1">Your upcoming and past examinations</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search exams..."
              className="pl-10 h-10 rounded-xl border-gray-100 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            { label: 'Upcoming', value: upcomingGroups.length, color: 'bg-blue-50', text: 'text-blue-600', icon: Calendar },
            { label: 'Ongoing Now', value: currentGroups.length, color: 'bg-amber-50', text: 'text-amber-600', icon: Timer },
            { label: 'Past Results', value: recentResults.length, color: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2 },
          ] as const).map((stat, i) => (
            <Card key={i} className="border-none shadow-sm bg-white">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 ${stat.color} rounded-xl flex items-center justify-center shrink-0`}>
                    <stat.icon className={`w-5 h-5 ${stat.text}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Next exam alert banner ── */}
        {daysUntilNext !== null && daysUntilNext <= 7 && (
          <div className="bg-blue-600 text-white rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">
                {daysUntilNext === 0
                  ? `Exam starts today — ${upcomingGroups[0]?.name}`
                  : `${upcomingGroups[0]?.name} starts in ${daysUntilNext} day${daysUntilNext !== 1 ? 's' : ''}`}
              </p>
              <p className="text-blue-200 text-xs font-medium mt-0.5">
                {upcomingGroups[0]?.exams.length} subject{upcomingGroups[0]?.exams.length !== 1 ? 's' : ''} scheduled
              </p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs defaultValue={currentGroups.length > 0 ? 'current' : upcomingGroups.length > 0 ? 'upcoming' : 'past'} className="w-full">
          <TabsList className="bg-transparent h-auto p-0 gap-6 rounded-none border-b border-gray-100 w-full justify-start mb-2">
            <TabsTrigger
              value="upcoming"
              className="px-0 py-4 rounded-none border-none border-b-2 border-transparent shadow-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-blue-600 focus-visible:ring-0 focus-visible:ring-offset-0 font-bold text-xs text-gray-500 transition-all"
            >
              Upcoming
              {upcomingGroups.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {upcomingGroups.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="current"
              className="px-0 py-4 rounded-none border-none border-b-2 border-transparent shadow-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-amber-600 focus-visible:ring-0 focus-visible:ring-offset-0 font-bold text-xs text-gray-500 transition-all"
            >
              Current
              {currentGroups.length > 0 && (
                <span className="ml-2 bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {currentGroups.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="px-0 py-4 rounded-none border-none border-b-2 border-transparent shadow-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-blue-600 focus-visible:ring-0 focus-visible:ring-offset-0 font-bold text-xs text-gray-500 transition-all"
            >
              Past Results
              {recentResults.length > 0 && (
                <span className="ml-2 bg-gray-100 text-gray-600 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {recentResults.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>


          {/* ── Upcoming tab ── */}
          <TabsContent value="upcoming" className="mt-4 outline-none">
            {filteredUpcoming.length === 0 ? (
              <div className="py-20 text-center">
                <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold text-sm">No upcoming exams</p>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredUpcoming.map((group, idx) => {
                  const daysLeft = Math.ceil((group.minDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const instructions = group.instructions.length ? group.instructions : DEFAULT_EXAM_INSTRUCTIONS;
                  return (
                    <Card key={idx} className="border-none shadow-sm bg-white overflow-hidden">
                      <CardContent className="p-0">
                        {/* Group header */}
                        <div className="p-5 border-b border-gray-50">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-bold text-base text-gray-900 uppercase tracking-tight">{group.name}</h3>
                              <p className="text-xs text-gray-400 font-medium mt-0.5">
                                {fmtShort(group.minDate)} – {fmtShort(group.maxDate)}
                              </p>
                            </div>
                            <Badge className={`shrink-0 font-bold text-[10px] px-2 py-0.5 border-none ${
                              daysLeft <= 3 ? 'bg-red-50 text-red-600' :
                              daysLeft <= 7 ? 'bg-amber-50 text-amber-600' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {daysLeft === 0 ? 'Starts today' : `In ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                            </Badge>
                          </div>
                          {/* Academic info grid */}
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Academic Year</p>
                              <p className="text-xs font-bold text-gray-800 mt-0.5">{group.academicYear || '—'}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Class</p>
                              <p className="text-xs font-bold text-gray-800 mt-0.5">{group.class}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Section</p>
                              <p className="text-xs font-bold text-gray-800 mt-0.5">{group.section || '—'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Exam schedule */}
                        <div className="px-5 pt-4 pb-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Exam Schedule</p>
                        </div>
                        <div className="divide-y divide-gray-50 border-b border-gray-50">
                          {group.exams.map((exam: any, i: number) => (
                            <div key={i} className="flex items-center px-5 py-3 gap-4">
                              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                                <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-gray-900">{exam.subject}</p>
                                <div className="flex items-center gap-3 mt-0.5 text-[10px] font-medium text-gray-400 flex-wrap">
                                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{exam.date}</span>
                                  {exam.time && exam.time !== 'TBA' && (
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time}</span>
                                  )}
                                  {exam.room && (
                                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{exam.room}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Instructions */}
                        <div className="px-5 py-4 border-b border-gray-50">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Instructions</p>
                          <ul className="space-y-1">
                            {instructions.map((inst, i) => (
                              <li key={i} className="text-xs text-gray-500 font-medium flex gap-2">
                                <span className="text-blue-500 font-black">•</span> {inst}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Actions */}
                        <div className="p-4 bg-gray-50/50 flex justify-end gap-2">
                          <Button
                            className="h-9 px-4 rounded-xl font-bold text-[11px] bg-gray-900 hover:bg-gray-800 text-white transition-all"
                            onClick={() => setDetailsGroup(group)}
                          >
                            View Full Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Current tab ── */}
          <TabsContent value="current" className="mt-4 outline-none">
            {filteredCurrent.length === 0 ? (
              <div className="py-20 text-center">
                <Clock className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold text-sm">No exams happening right now</p>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
                  Check Upcoming for scheduled exams
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCurrent.map((group, idx) => (
                  <Card key={idx} className="border-2 border-red-200 shadow-sm bg-white overflow-hidden">
                    {/* Live indicator */}
                    <div className="bg-red-500 px-5 py-2.5 flex items-center gap-2.5">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="font-bold text-white text-xs uppercase tracking-widest">🔴 Current Exam</span>
                      <span className="ml-auto font-bold text-white/80 text-[10px] uppercase tracking-widest">Exam is in progress</span>
                    </div>
                    <CardContent className="p-0">
                      <div className="p-5 border-b border-gray-50">
                        <h3 className="font-bold text-base text-gray-900">{group.name}</h3>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                          {group.class} · {group.exams.length} subjects
                        </p>
                      </div>

                      <div className="divide-y divide-gray-50">
                        {group.exams.map((exam: any, i: number) => {
                          const examDate = parseFormattedDate(exam.date);
                          examDate.setHours(0, 0, 0, 0);
                          const isToday = examDate.getTime() === today.getTime();
                          const isPast = examDate < today;
                          return (
                            <div
                              key={i}
                              className={`flex items-center px-5 py-3 gap-4 transition-colors ${isToday ? 'bg-amber-50' : ''}`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isToday ? 'bg-amber-500' : isPast ? 'bg-emerald-50' : 'bg-gray-50'
                              }`}>
                                {isPast
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  : isToday
                                  ? <Clock className="w-3.5 h-3.5 text-white" />
                                  : <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`font-bold text-sm ${isToday ? 'text-amber-700' : 'text-gray-900'}`}>
                                    {exam.subject}
                                  </p>
                                  {isToday && (
                                    <Badge className="bg-amber-100 text-amber-700 border-none font-black text-[9px] px-1.5 py-0.5">TODAY</Badge>
                                  )}
                                  {isPast && (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-none font-black text-[9px] px-1.5 py-0.5">DONE</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-[10px] font-medium text-gray-400 flex-wrap">
                                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{exam.date}</span>
                                  {exam.time && exam.time !== 'TBA' && (
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time}</span>
                                  )}
                                  {exam.room && (
                                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{exam.room}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-4 bg-gray-50/50 flex justify-end gap-2">
                        <Button
                          className="h-9 px-4 rounded-xl font-bold text-[11px] bg-gray-900 hover:bg-gray-800 text-white transition-all"
                          onClick={() => setDetailsGroup(group)}
                        >
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Past Results tab ── */}
          <TabsContent value="past" className="mt-4 outline-none">
            {filteredPast.length === 0 ? (
              <div className="py-20 text-center">
                <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold text-sm">No past results yet</p>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
                  Results appear here once published by the school
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupExamsByName(filteredPast).map((group) => {
                  const instructions = group.instructions.length ? group.instructions : DEFAULT_EXAM_INSTRUCTIONS;
                  const rooms = Array.from(new Set(group.exams.map((e: any) => e.room).filter(Boolean)));
                  return (
                  <Card key={group.name + group.minDate.toISOString()} className="border-none shadow-sm hover:shadow-md transition-all bg-white group overflow-hidden">
                    <CardContent className="p-0">
                      {/* Group header */}
                      <div className="p-5 border-b border-gray-50">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Completed</span>
                            </div>
                            <h3 className="font-bold text-base text-gray-900 uppercase tracking-tight">{group.name}</h3>
                            <p className="text-xs text-gray-400 font-medium mt-0.5">
                              {fmtShort(group.minDate)} – {fmtShort(group.maxDate)}
                            </p>
                          </div>
                          <Badge className="shrink-0 font-bold text-[10px] px-2 py-0.5 border-none bg-emerald-50 text-emerald-600">
                            {group.exams.length} Subject{group.exams.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        {/* Academic info grid */}
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Academic Year</p>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">{group.academicYear || '—'}</p>
                          </div>
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Class</p>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">{group.class}</p>
                          </div>
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Section</p>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">{group.section || '—'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Exam schedule */}
                      <div className="px-5 pt-4 pb-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Exam Schedule</p>
                      </div>
                      <div className="divide-y divide-gray-50 border-b border-gray-50">
                        {group.exams.map((exam: any, i: number) => (
                          <div key={i} className="flex items-center px-5 py-3 gap-4">
                            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-gray-900">{exam.subject}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-[10px] font-medium text-gray-400 flex-wrap">
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{exam.date}</span>
                                {exam.time && exam.time !== 'TBA' && (
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time}</span>
                                )}
                                {exam.room && (
                                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{exam.room}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                        {/* Exam centre */}
                      {rooms.length > 0 && (
                        <div className="px-5 py-4 border-b border-gray-50">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Exam Centre</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {rooms.map((room, i) => (
                              <Badge key={i} className="bg-gray-100 text-gray-700 border-none font-bold text-[11px] px-3 py-1">
                                Room {room}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Instructions */}
                      <div className="px-5 py-4 border-b border-gray-50">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Instructions</p>
                        <ul className="space-y-1">
                          {instructions.map((inst, i) => (
                            <li key={i} className="text-xs text-gray-500 font-medium flex gap-2">
                              <span className="text-blue-500 font-black">•</span> {inst}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Actions */}
                      <div className="p-4 bg-gray-50/50 flex justify-end gap-2">
                        <Button
                          variant="outline"
                          className="h-9 px-4 rounded-xl font-bold text-[11px] border-gray-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100 transition-all"
                          onClick={() => setDetailsGroup(group)}
                        >
                          View Details
                        </Button>
                        <Button
                          className="h-9 px-4 rounded-xl font-bold text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white transition-all"
                          onClick={() => handleDownloadGroupReport(group)}
                        >
                          <Download className="w-3.5 h-3.5 mr-2" /> Download Report
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Full exam details dialog */}
        <ExamDetailsDialog group={detailsGroup} onClose={() => setDetailsGroup(null)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STAFF VIEW  (ADMIN / TEACHER)
  // ══════════════════════════════════════════════════════════════════════════

  const q2 = searchTerm.toLowerCase();
  const filteredStaffUpcoming = upcomingExams.filter((e: any) =>
    !q2 || e.subject?.toLowerCase().includes(q2) || e.class?.toLowerCase().includes(q2) || (e.name || '').toLowerCase().includes(q2)
  );
  const filteredStaffResults = recentResults.filter((r: any) =>
    !q2 || (r.name || '').toLowerCase().includes(q2) || (r.subject || '').toLowerCase().includes(q2)
  );

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">
      {/* Modals */}
      <AddExamModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setSelectedExam(null); }}
        exam={selectedExam}
        onSuccess={fetchExams}
      />
      <ViewRegistryModal
        isOpen={isRegistryModalOpen}
        onClose={() => { setIsRegistryModalOpen(false); setSelectedExam(null); }}
        exam={selectedExam}
        schoolName={user?.school_name || 'Kautix International School'}
      />
      <MarksEntryModal
        isOpen={isMarksModalOpen}
        onClose={() => { setIsMarksModalOpen(false); setSelectedExam(null); }}
        exam={selectedExam}
        onSuccess={fetchExams}
      />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Examinations</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Manage academic assessments and performance tracking</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <ClassSectionFilter
            showLabels={false}
            onFilterChange={({ classId, sectionId }) => {
              setSelectedClassId(classId);
              setSelectedSectionId(sectionId);
            }}
          />
          <Select value={selectedExamTypeId} onValueChange={setSelectedExamTypeId}>
            <SelectTrigger className="h-11 w-[160px] rounded-xl bg-white border-gray-200 text-xs font-bold text-gray-700">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {examTypes.map((et: any) => (
                <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-11 px-5 rounded-xl font-bold text-xs border-gray-200 hidden sm:flex"
            onClick={handleDownloadProtocol}
          >
            <Download className="w-4 h-4 mr-2" /> Export Protocol
          </Button>
          {/* Notify Pending & Initialize Exam — admin only */}
          {isAdmin && (
            <>
              <Button
                variant="outline"
                className="h-11 px-4 rounded-xl font-bold text-xs border-amber-200 text-amber-600 hover:bg-amber-50 hidden sm:flex"
                onClick={handleNotifyPending}
              >
                <Bell className="w-4 h-4 mr-2" /> Notify Pending
              </Button>
              <Button
                className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 font-bold text-xs transition-all"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" /> Initialize Exam
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
        {([
          { label: 'Upcoming', value: upcomingExams.length, color: 'bg-blue-50', text: 'text-blue-600', icon: Calendar },
          { label: 'Evaluated', value: data?.stats?.completed || 0, color: 'bg-emerald-50', text: 'text-emerald-600', icon: FileText },
          { label: 'Avg Index', value: `${data?.stats?.avgPerformance || 0}%`, color: 'bg-purple-50', text: 'text-purple-600', icon: Award },
          { label: 'Pending', value: data?.stats?.pendingGrading || 0, color: 'bg-amber-50', text: 'text-amber-600', icon: Clock },
        ] as const).map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all group bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center border border-white group-hover:scale-110 transition-transform`}>
                  <stat.icon className={`w-6 h-6 ${stat.text}`} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="upcoming" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 border-b border-gray-100 pb-2">
          <TabsList className="bg-transparent h-auto p-0 gap-8 rounded-none">
            <TabsTrigger
              value="upcoming"
              className="px-0 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 font-bold text-xs text-gray-500 capitalize transition-all"
            >
              Upcoming Tests
            </TabsTrigger>
            <TabsTrigger
              value="results"
              className="px-0 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 font-bold text-xs text-gray-500 capitalize transition-all"
            >
              Past Results
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Filter exams..."
              className="pl-12 h-10 rounded-xl border-gray-100 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Upcoming Tests */}
        <TabsContent value="upcoming" className="mt-0 outline-none">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full">
            {filteredStaffUpcoming.map((exam: any, index: number) => (
              <Card key={index} className="overflow-hidden border-none shadow-sm hover:shadow-lg transition-all group bg-white">
                <CardHeader className="bg-gray-50/20 border-b border-gray-50 py-5 px-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge className="bg-blue-50 text-blue-700 border-none font-bold text-[9px] mb-2 px-2 py-0.5 uppercase tracking-wider">
                        {exam.class}{exam.section ? `-${exam.section}` : ''}
                      </Badge>
                      <CardTitle className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {exam.subject}
                      </CardTitle>
                      {exam.name && (
                        <p className="text-xs text-gray-400 mt-0.5 font-medium">{exam.name}</p>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm shrink-0">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-gray-400 flex items-center gap-2 uppercase tracking-tight">
                        <Calendar className="w-3.5 h-3.5" /> Date
                      </span>
                      <span className="text-gray-900 font-bold">{exam.date}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-gray-400 flex items-center gap-2 uppercase tracking-tight">
                        <Clock className="w-3.5 h-3.5" /> Time
                      </span>
                      <span className="text-gray-900 font-bold">{exam.time}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-gray-400 flex items-center gap-2 uppercase tracking-tight">
                        <MapPin className="w-3.5 h-3.5" /> Room
                      </span>
                      <span className="text-gray-900 font-bold">{exam.room || 'Main Hall'}</span>
                    </div>
                    {exam.studentsCount != null && (
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-gray-400 flex items-center gap-2 uppercase tracking-tight">
                          <BookOpen className="w-3.5 h-3.5" /> Students
                        </span>
                        <span className="text-gray-900 font-bold">{exam.studentsCount}</span>
                      </div>
                    )}
                    {exam.invigilator && (
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-gray-400 flex items-center gap-2 uppercase tracking-tight">
                          <Award className="w-3.5 h-3.5" /> Invigilator
                        </span>
                        <span className={`font-bold ${exam.isInvigilator ? 'text-amber-600' : 'text-gray-900'}`}>
                          {exam.invigilator}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-6 pt-6 border-t border-gray-50 flex gap-2">
                    <Button
                      className="flex-1 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-[11px] text-white"
                      onClick={() => { setSelectedExam(exam); setIsMarksModalOpen(true); }}
                    >
                      Enter Marks
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-9 rounded-xl font-bold text-[11px] border-gray-100 hover:bg-blue-50 hover:text-blue-600"
                      onClick={() => { setSelectedExam(exam); setIsRegistryModalOpen(true); }}
                    >
                      View Results
                    </Button>
                    {isAdmin && (
                      <Button
                        className="flex-1 h-9 rounded-xl bg-gray-900 hover:bg-gray-800 font-bold text-[11px] text-white"
                        onClick={() => { setSelectedExam(exam); setIsAddModalOpen(true); }}
                      >
                        Update
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredStaffUpcoming.length === 0 && (
              <div className="col-span-full py-20 text-center">
                <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold text-sm">No upcoming exams</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Past Results */}
        <TabsContent value="results" className="mt-0 outline-none">
          <div className="space-y-4">
            {filteredStaffResults.map((result: any, index: number) => (
              <Card key={index} className="border-none shadow-sm hover:shadow-md transition-all bg-white group overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row sm:items-center">
                    <div className="p-6 flex-1 flex items-center gap-6 sm:border-r border-gray-50">
                      <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center text-white font-bold text-lg group-hover:scale-110 transition-transform shrink-0">
                        {result.subject[0]}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-gray-900">{result.name || result.subject}</h3>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">
                          {result.subject} • {result.class}
                        </p>
                        <p className="text-[10px] font-medium text-gray-400 mt-0.5">{result.date}</p>
                      </div>
                    </div>
                    <div className="p-6 flex items-center gap-10 bg-gray-50/20 sm:bg-white sm:min-w-[380px] justify-between sm:justify-end">
                      <div className="text-left sm:text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Avg Score</p>
                        <p className="text-xl font-bold text-gray-900">{result.avgScore}%</p>
                      </div>
                      <div className="text-left sm:text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Students</p>
                        <p className="text-xl font-bold text-gray-900">{result.totalStudents}</p>
                      </div>
                      <Button
                        variant="outline"
                        className="h-9 px-5 rounded-xl font-bold text-xs border-gray-100 hover:bg-gray-50 hidden md:flex"
                        onClick={() => { setSelectedExam(result); setIsRegistryModalOpen(true); }}
                      >
                        View Registry
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredStaffResults.length === 0 && (
              <div className="py-20 text-center">
                <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold text-sm">No results yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
