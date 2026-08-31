import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import {
  ClipboardList, Plus, Search, BookOpen, Calendar, Trash2,
  User, CheckCircle, Info, Loader2, Star, MessageSquare, Award, Upload, X, FileText,
  Eye, Paperclip, ExternalLink
} from 'lucide-react';
import { ClassSectionSubjectPicker } from '../../components/academic/ClassSectionSubjectPicker';

// ─── Deadline helpers ─────────────────────────────────────────────────────────

/** True when the assignment deadline has passed (due date is inclusive — end of that day). */
export function isPastDue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return new Date() > due;
}

/** Read a File as a base64 data URL (for upload endpoints). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** File picker + submit / mark-as-done actions shown to students when work is still open. */
export function StudentSubmitForm({
  submitFile,
  setSubmitFile,
  submitLoading,
  onSubmit,
  onMarkDone,
}: {
  submitFile: File | null;
  setSubmitFile: (f: File | null) => void;
  submitLoading: boolean;
  onSubmit: () => void;
  onMarkDone: () => void;
}) {
  return (
    <>
      <div>
        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
          Attach your work (PDF, image, doc — max 10MB)
        </Label>
        <div className="mt-2">
          {submitFile ? (
            <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <p className="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">{submitFile.name}</p>
              <button
                type="button"
                onClick={() => setSubmitFile(null)}
                className="h-8 w-8 rounded-lg hover:bg-rose-50 text-rose-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition-all">
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-xs font-bold text-slate-500">Click to choose a file</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.zip,.txt"
                onChange={(e) => setSubmitFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
        </div>
      </div>

      <Button
        className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest"
        disabled={submitLoading}
        onClick={onSubmit}
      >
        {submitLoading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
        ) : (
          <><Upload className="w-4 h-4 mr-2" /> Submit Work{submitFile ? ' with file' : ''}</>
        )}
      </Button>

      <Button
        variant="outline"
        className="w-full h-11 rounded-xl border-slate-200 font-bold text-xs uppercase tracking-widest text-slate-600"
        disabled={submitLoading}
        onClick={onMarkDone}
      >
        <CheckCircle className="w-4 h-4 mr-2" /> Mark as Done (no file)
      </Button>
    </>
  );
}

export function AssignmentManagementPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  // Filter states
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Grade modal state
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [gradeTarget, setGradeTarget] = useState<any>(null);
  const [gradeMarks, setGradeMarks] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [gradeLoading, setGradeLoading] = useState(false);

  // View assignment details modal
  const [viewAssignmentOpen, setViewAssignmentOpen] = useState(false);
  const [viewAssignment, setViewAssignment] = useState<any>(null);
  const [viewAssignLoading, setViewAssignLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    classId: '',
    sectionId: '',
    subjectId: ''
  });
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const [filterSubjects, setFilterSubjects] = useState<any[]>([]);

  // Student submission state (file + in-flight flag)
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [assignmentsData, classesData] = await Promise.all([
        api.getAssignments(),
        isStaff ? api.getClasses() : Promise.resolve([])
      ]);
      setAssignments(assignmentsData || []);
      setClasses(classesData || []);
    } catch (err: any) {
      console.error('Failed to load initial data:', err.message);
      toast.error('Could not load assignments history.');
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (secId?: string, subId?: string) => {
    try {
      const params: any = {};
      if (secId) params.sectionId = secId;
      if (subId) params.subjectId = subId;
      const data = await api.getAssignments(params);
      setAssignments(data || []);
    } catch (err: any) {
      toast.error('Failed to reload assignments list');
    }
  };

  const handleFilterSectionChange = async (sectionId: string) => {
    setSelectedSectionFilter(sectionId);
    setSelectedSubjectFilter('');
    if (!sectionId) {
      setFilterSubjects([]);
      return;
    }
    const sec = classes.flatMap(c => (c.sections || []).map((s: any) => ({ ...s, classId: c.id }))).find((s: any) => s.id === sectionId);
    if (sec?.classId) {
      try {
        const data = await api.getSubjects(sec.classId);
        setFilterSubjects(Array.isArray(data) ? data : []);
      } catch {
        setFilterSubjects([]);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        try {
          const res = await api.uploadAssignmentFile(dataUrl, file.name, 'assignment-attachments');
          setAttachments(prev => [...prev, { url: res.url, filename: file.name, contentType: res.contentType }]);
          toast.success(`"${file.name}" uploaded to S3`);
        } catch (err: any) {
          toast.error(err.message || 'Failed to upload file');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error('Failed to read file');
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.sectionId || !formData.subjectId) {
      toast.error('Please specify title, section and subject.');
      return;
    }

    setModalLoading(true);
    try {
      await api.createAssignment({
        title: formData.title,
        description: formData.description,
        dueDate: formData.dueDate,
        sectionId: formData.sectionId,
        subjectId: formData.subjectId,
        attachments: attachments
      });
      toast.success('Assignment created and alerts broadcasted to students & parents!');
      setIsModalOpen(false);
      setFormData({ title: '', description: '', dueDate: '', classId: '', sectionId: '', subjectId: '' });
      setAttachments([]);
      loadAssignments(selectedSectionFilter, selectedSubjectFilter);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create assignment.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await api.deleteAssignment(id);
      setAssignments(prev => prev.filter(a => a.id !== id));
      toast.success('Assignment deleted successfully');
    } catch (err) {
      toast.error('Failed to delete assignment');
    }
  };

  const handleViewStatus = async (assignment: any) => {
    setSelectedAssignment(assignment);
    setStatusModalOpen(true);
    setSubmissionsLoading(true);
    try {
      const data = await api.getAssignmentSubmissions(assignment.id);
      setSubmissions(data || []);
    } catch (err) {
      toast.error('Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleApproveSubmission = async (studentId: string) => {
    try {
      await api.toggleAssignmentStatus({ assignmentId: selectedAssignment.id, studentId, isCompleted: true });
      toast.success('Assignment approved!');
      setSubmissions(prev => prev.map(s => s.studentId === studentId ? { ...s, status: 'completed' } : s));
    } catch (err) {
      toast.error('Failed to approve assignment');
    }
  };

  const handleMarkAsDone = async (assignmentId: string) => {
    const target = assignments.find(a => a.id === assignmentId);
    if (isPastDue(target?.dueDate)) {
      toast.error('The deadline has passed. Submissions are closed.');
      return;
    }
    try {
      if (!user?.id) return;
      await api.toggleAssignmentStatus({ assignmentId, studentId: (user as any).student_id || user.id, isCompleted: true });
      toast.success('Assignment marked as done!');
      loadAssignments(selectedSectionFilter, selectedSubjectFilter);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update assignment status');
    }
  };

  // Students submit their work — optionally attaching a file (PDF, doc, image…).
  // The backend blocks submissions after the due date.
  const handleSubmitWork = async () => {
    if (!viewAssignment) return;
    setSubmitLoading(true);
    try {
      let contentUrl: string | null = null;
      if (submitFile) {
        const dataUrl = await fileToDataUrl(submitFile);
        const res = await api.uploadSubmissionFile(dataUrl, submitFile.name);
        contentUrl = res.url;
      }
      await api.submitAssignment({ assignmentId: viewAssignment.id, contentUrl });
      toast.success(submitFile ? 'Work submitted successfully!' : 'Submitted — marked as done!');
      setSubmitFile(null);
      setViewAssignmentOpen(false);
      loadAssignments(selectedSectionFilter, selectedSubjectFilter);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit work');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openAssignmentDetails = (assignment: any) => {
    setViewAssignment(assignment);
    setViewAssignmentOpen(true);
  };

  const openAttachment = (url: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openGradeModal = (sub: any) => {
    setGradeTarget(sub);
    setGradeMarks(sub.marksObtained != null ? String(sub.marksObtained) : '');
    setGradeFeedback(sub.feedback || '');
    setGradeModalOpen(true);
  };

  const handleGradeSubmission = async () => {
    if (!gradeTarget) return;
    const marks = Number(gradeMarks);
    if (isNaN(marks) || marks < 0) {
      toast.error('Please enter valid marks (≥ 0)');
      return;
    }
    setGradeLoading(true);
    try {
      // If no submission exists yet, create one first via toggle
      if (!gradeTarget.submissionId) {
        await api.toggleAssignmentStatus({ assignmentId: selectedAssignment.id, studentId: gradeTarget.studentId, isCompleted: true });
        // Refetch to get the submissionId
        const freshSubs = await api.getAssignmentSubmissions(selectedAssignment.id);
        const freshSub = freshSubs.find((s: any) => s.studentId === gradeTarget.studentId);
        if (freshSub?.submissionId) {
          await api.gradeAssignment({ submissionId: freshSub.submissionId, marks, feedback: gradeFeedback });
        }
      } else {
        await api.gradeAssignment({ submissionId: gradeTarget.submissionId, marks, feedback: gradeFeedback });
      }
      toast.success(`Marks saved for ${gradeTarget.firstName}!`);
      setSubmissions(prev => prev.map(s => s.studentId === gradeTarget.studentId ? { ...s, status: 'completed', marksObtained: marks, feedback: gradeFeedback } : s));
      setGradeModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to grade submission');
    } finally {
      setGradeLoading(false);
    }
  };

  const filteredAssignments = assignments.filter(a => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = !query ||
      a.title?.toLowerCase().includes(query) ||
      a.description?.toLowerCase().includes(query) ||
      a.subjectName?.toLowerCase().includes(query) ||
      a.className?.toLowerCase().includes(query);
    const matchesSection = selectedSectionFilter ? a.sectionId === selectedSectionFilter : true;
    const matchesSubject = selectedSubjectFilter ? a.subjectId === selectedSubjectFilter : true;
    return matchesSearch && matchesSection && matchesSubject;
  });

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">

      {/* Header */}
      <div className="flex flex-col gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/60 shadow-sm w-full">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/10">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              {isStaff ? 'Academic Assignments' : 'My Assignments'}
            </h1>
          </div>
          <p className="text-slate-500 font-medium text-sm ml-15">
            {isStaff
              ? 'Create, manage and distribute assignments. Updates are automatically sent via Email & WhatsApp to parent/student contacts.'
              : 'Assignments for your class and section only.'}
          </p>
        </div>
        {isStaff && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 px-6 font-bold text-sm shadow-xl shadow-blue-600/10 transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Assignment
          </Button>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[28px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Tasks</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{assignments.length}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center text-green-600 shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Submissions</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {assignments.reduce((sum, a) => sum + (a.submissions || 0), 0)}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Associated Subjects</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {new Set(assignments.map(a => a.subjectName)).size}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      {isStaff && (
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm w-full">
          <div className="relative w-full md:max-w-md">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none z-10"
            />

            <input
              type="search"
              placeholder="Search assignments by subject, class, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <select
              value={selectedSectionFilter}
              onChange={(e) => handleFilterSectionChange(e.target.value)}
              className="h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 w-full sm:flex-1"
            >
              <option value="">All Sections</option>
              {classes.flatMap(c => (c.sections || []).map((sec: any) => (
                <option key={sec.id} value={sec.id}>{c.name} - Section {sec.name}</option>
              )))}
            </select>

            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              disabled={!selectedSectionFilter}
              className="h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 w-full sm:flex-1 disabled:opacity-50"
            >
              <option value="">All Subjects</option>
              {filterSubjects.map((sub: any) => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Grid List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/60">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-500 font-semibold text-sm">Synchronizing curriculum schedule...</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/60 text-center px-4">
          <ClipboardList className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No Assignments Found</h3>
          <p className="text-slate-500 max-w-md mt-1 text-sm">
            There are no active learning tasks scheduled matching the current filters. Click "Create Assignment" to dispatch a new one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssignments.map((assignment) => (
            <Card
              key={assignment.id}
              onClick={() => openAssignmentDetails(assignment)}
              className="border-slate-200/60 shadow-sm hover:shadow-md hover:border-blue-200 transition-all rounded-[28px] overflow-hidden group bg-white flex flex-col justify-between cursor-pointer"
            >
              <div>
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-blue-600/10 text-blue-700 border-none font-black text-[9px] uppercase px-2 py-0.5 rounded-full">
                      {assignment.subjectName}
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700 border-none font-bold text-[9px] uppercase px-2 py-0.5 rounded-full">
                      {assignment.className}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-black text-slate-800 uppercase tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                    {assignment.title}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 mt-2 text-slate-400">
                    <User className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">By {assignment.teacherName}</span>
                  </div>
                </CardHeader>

                <CardContent className="p-5">
                  <p className="text-slate-600 text-sm leading-relaxed line-clamp-3">
                    {assignment.description || 'No description provided.'}
                  </p>
                </CardContent>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Calendar className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {(user?.role === 'admin' || (user?.role === 'teacher' && assignment.teacherId === user?.id)) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(assignment.id); }}
                      className="h-9 w-9 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-slate-200 font-bold uppercase text-[10px] h-9"
                    onClick={(e) => { e.stopPropagation(); openAssignmentDetails(assignment); }}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" /> Open
                  </Button>
                  {isStaff ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-slate-200 font-bold uppercase text-[10px] h-9"
                      onClick={(e) => { e.stopPropagation(); handleViewStatus(assignment); }}
                    >
                      View Status
                    </Button>
                  ) : assignment.isCompleted ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="rounded-xl border-emerald-200 bg-emerald-50 font-bold uppercase text-[10px] h-9 text-emerald-700"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Done
                    </Button>
                  ) : isPastDue(assignment.dueDate) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="rounded-xl border-rose-200 bg-rose-50 font-bold uppercase text-[10px] h-9 text-rose-600"
                    >
                      Closed
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold uppercase text-[10px] h-9 text-white"
                      onClick={(e) => { e.stopPropagation(); handleMarkAsDone(assignment.id); }}
                    >
                      Mark as Done
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[550px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl font-black text-slate-900">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                <ClipboardList className="w-5 h-5" />
              </div>
              Create New Assignment
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium text-xs">
              Fill in curriculum details. Creating this assignment will immediately trigger WhatsApp & Email alerts to enrolled parent and student nodes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAssignment} className="space-y-5 py-4">

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Assignment Title *</Label>
              <Input
                placeholder="E.g. Trigonometry Exercise 4.1"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
                className="h-11 border-slate-200 rounded-xl"
              />
            </div>

            <ClassSectionSubjectPicker
              value={{ classId: formData.classId, sectionId: formData.sectionId, subjectId: formData.subjectId }}
              onChange={(v) => setFormData(prev => ({ ...prev, ...v }))}
            />

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Due Date</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                className="h-12 border-slate-200 rounded-xl text-sm w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Instructions & Details</Label>
              <Textarea
                placeholder="Specify the syllabus, instructions, references..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="min-h-[100px] border-slate-200 rounded-xl resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Attachments (PDF, Docs, Images)</Label>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <input type="file" className="hidden" onChange={handleFileUpload} />
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Upload className="w-4 h-4 text-blue-600" />}
                <span className="text-sm text-slate-600">{uploading ? 'Uploading to S3...' : 'Click to upload a file'}</span>
              </label>
              {attachments.length > 0 && (
                <div className="space-y-2 mt-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-sm text-slate-700 flex-1 truncate">{att.filename}</span>
                      <button type="button" onClick={() => removeAttachment(i)} className="text-rose-500 hover:text-rose-700">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-2.5">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                Once deployed, students will see this under their portal dashboard. Automatic WhatsApp messages will detail the assignment title and due date.
              </p>
            </div>

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="w-full sm:w-auto h-11 rounded-xl font-bold uppercase text-[10px] tracking-wider border-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={modalLoading}
                className="w-full sm:w-auto h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase text-[10px] tracking-wider px-6 flex items-center justify-center gap-1.5 shadow-lg shadow-slate-900/10"
              >

                Deploy Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Submissions Status Modal */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[650px] max-h-[90vh] flex flex-col bg-slate-50 rounded-2xl sm:rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="p-6 bg-white border-b border-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-black text-slate-900">
                <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                  <CheckCircle className="w-5 h-5" />
                </div>
                Review Submissions
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium text-xs">
                {selectedAssignment?.title} ({selectedAssignment?.className})
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {submissionsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="text-sm font-bold tracking-tight">Loading student statuses...</p>
              </div>
            ) : submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <BookOpen className="w-8 h-8 mb-4 opacity-20" />
                <p className="text-sm font-bold tracking-tight">No students enrolled in this section.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map((sub, idx) => (
                  <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200">
                          {sub.firstName?.[0] || 'S'}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{sub.firstName} {sub.lastName}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sub.admissionNumber || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {sub.status === 'pending' || sub.status === 'submitted' ? (
                          <>
                            <Badge className="bg-amber-100 text-amber-700 border-none font-bold uppercase text-[9px] px-2 py-0.5">Pending Review</Badge>
                            {isStaff && (
                              <>
                                <Button size="sm" className="h-8 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApproveSubmission(sub.studentId)}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 rounded-lg font-bold text-xs border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => openGradeModal(sub)}>
                                  <Award className="w-3 h-3 mr-1" /> Grade
                                </Button>
                              </>
                            )}
                          </>
                        ) : sub.status === 'completed' || sub.status === 'graded' ? (
                          <div className="flex items-center gap-2">
                            {sub.marksObtained != null && (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-[10px] px-2 py-0.5">
                                <Star className="w-3 h-3 mr-1 inline" /> {sub.marksObtained} marks
                              </Badge>
                            )}
                            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 font-bold uppercase text-[9px] px-2 py-0.5">
                              <CheckCircle className="w-3 h-3 mr-1 inline" /> Completed
                            </Badge>
                            {isStaff && (
                              <Button size="sm" variant="outline" className="h-7 rounded-lg font-bold text-[10px] border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => openGradeModal(sub)}>
                                <Award className="w-3 h-3 mr-1" /> {sub.marksObtained != null ? 'Edit' : 'Grade'}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-slate-400 border-slate-200 font-bold uppercase text-[9px] px-2 py-0.5">
                              Not Started
                            </Badge>
                            {isStaff && (
                              <Button size="sm" variant="outline" className="h-7 rounded-lg font-bold text-[10px] border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => openGradeModal(sub)}>
                                <Award className="w-3 h-3 mr-1" /> Grade
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {sub.feedback && (
                      <div className="mt-2 ml-[52px] bg-slate-50 rounded-lg p-2 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5"><MessageSquare className="w-3 h-3 inline mr-1" />Feedback</p>
                        <p className="text-xs text-slate-600">{sub.feedback}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Grade Submission Modal */}
      <Dialog open={gradeModalOpen} onOpenChange={setGradeModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[480px] bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-lg font-black text-white">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                Grade Assignment
              </DialogTitle>
              <DialogDescription className="text-blue-100 font-medium text-xs mt-1">
                {gradeTarget?.firstName} {gradeTarget?.lastName} — {selectedAssignment?.title}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Marks Obtained</Label>
              <Input
                type="number"
                min="0"
                placeholder="Enter marks (e.g. 85)"
                value={gradeMarks}
                onChange={(e) => setGradeMarks(e.target.value)}
                className="rounded-xl border-slate-200 text-lg font-bold h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Feedback (Optional)</Label>
              <Textarea
                placeholder="Write feedback for the student..."
                value={gradeFeedback}
                onChange={(e) => setGradeFeedback(e.target.value)}
                rows={3}
                className="rounded-xl border-slate-200 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="p-6 pt-0 flex flex-col-reverse sm:flex-row justify-end gap-3">
            <Button variant="outline" onClick={() => setGradeModalOpen(false)} disabled={gradeLoading} className="w-full sm:w-auto rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleGradeSubmission} loading={gradeLoading} className="w-full sm:w-auto rounded-xl bg-blue-600 hover:bg-blue-700 font-bold px-8 flex items-center justify-center">
              <><Star className="w-4 h-4 mr-2" /> Save Marks</>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Assignment Details Modal */}
      <Dialog open={viewAssignmentOpen} onOpenChange={setViewAssignmentOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[600px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-0">
          <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-black text-white">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                Assignment Details
              </DialogTitle>
              <DialogDescription className="text-blue-100 font-medium text-xs mt-1">
                View full assignment information and attachments
              </DialogDescription>
            </DialogHeader>
          </div>

          {viewAssignment && (
            <div className="p-6 space-y-5">
              {/* Subject & Class badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-600/10 text-blue-700 border-none font-black text-[10px] uppercase px-3 py-1 rounded-full">
                  {viewAssignment.subjectName}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 border-none font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                  {viewAssignment.className}
                </Badge>
                {viewAssignment.sectionName && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                    {viewAssignment.sectionName}
                  </Badge>
                )}
              </div>

              {/* Title */}
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Title</Label>
                <h3 className="text-2xl font-black text-slate-900 mt-1 uppercase tracking-tight">{viewAssignment.title}</h3>
              </div>

              {/* Teacher */}
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                  {viewAssignment.teacherName?.[0] || 'T'}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">By {viewAssignment.teacherName || 'Teacher'}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned by</p>
                </div>
              </div>

              {/* Due date */}
              <div className="flex items-center gap-2 bg-amber-50 rounded-xl p-3 border border-amber-100">
                <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    Due: {viewAssignment.dueDate ? new Date(viewAssignment.dueDate).toLocaleDateString() : 'No due date'}
                  </p>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Submission deadline</p>
                </div>
              </div>

              {/* Full description */}
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Instructions</Label>
                <div className="mt-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {viewAssignment.description || 'No detailed instructions provided for this assignment.'}
                  </p>
                </div>
              </div>

              {/* Attachments */}
              {viewAssignment.attachments && viewAssignment.attachments.length > 0 && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Attachments ({viewAssignment.attachments.length})
                  </Label>
                  <div className="mt-2 space-y-2">
                    {viewAssignment.attachments.map((att: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{att.filename || 'Attachment'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to open</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-blue-200 text-blue-600 font-bold text-[10px] uppercase h-8"
                          onClick={() => openAttachment(att.url)}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Student submission panel ── */}
              {!isStaff && viewAssignment && (() => {
                const graded = viewAssignment.status === 'graded' || viewAssignment.marksObtained != null;
                const submitted = viewAssignment.isCompleted || viewAssignment.status === 'submitted';
                const overdue = isPastDue(viewAssignment.dueDate);
                return (
                  <div className="space-y-3">
                    {graded ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Graded</span>
                          <span className="text-lg font-black text-emerald-800">
                            {viewAssignment.marksObtained ?? '—'}
                            {viewAssignment.maxMarks ? ` / ${viewAssignment.maxMarks}` : ''}
                          </span>
                        </div>
                        {viewAssignment.feedback && (
                          <div className="mt-3 pt-3 border-t border-emerald-200">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1">Teacher Feedback</p>
                            <p className="text-sm text-emerald-900 whitespace-pre-wrap">{viewAssignment.feedback}</p>
                          </div>
                        )}
                      </div>
                    ) : submitted ? (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-blue-800">Submitted ✓</p>
                          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Awaiting grading</p>
                        </div>
                        {viewAssignment.contentUrl && (
                          <Button variant="outline" size="sm" className="rounded-lg border-blue-200 text-blue-600 font-bold text-[10px] uppercase h-8"
                            onClick={() => openAttachment(viewAssignment.contentUrl)}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> View File
                          </Button>
                        )}
                      </div>
                    ) : overdue ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3">
                        <X className="w-5 h-5 text-rose-600 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-rose-700">Deadline passed — submissions closed</p>
                          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-0.5">
                            Due: {viewAssignment.dueDate ? new Date(viewAssignment.dueDate).toLocaleDateString() : '—'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <StudentSubmitForm
                        submitFile={submitFile}
                        setSubmitFile={setSubmitFile}
                        submitLoading={submitLoading}
                        onSubmit={handleSubmitWork}
                        onMarkDone={() => { handleMarkAsDone(viewAssignment.id); setViewAssignmentOpen(false); }}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setViewAssignmentOpen(false)} className="w-full h-11 rounded-xl font-bold uppercase text-[10px] tracking-wider border-slate-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
