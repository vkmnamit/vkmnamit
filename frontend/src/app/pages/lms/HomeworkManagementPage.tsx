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
import { isPastDue, StudentSubmitForm, fileToDataUrl } from './AssignmentManagementPage';

export function HomeworkManagementPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [homework, setHomework] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  // Filter states
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Student submission state (file + in-flight flag)
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Grade modal state
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [gradeTarget, setGradeTarget] = useState<any>(null);
  const [gradeMarks, setGradeMarks] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [gradeLoading, setGradeLoading] = useState(false);

  // View homework details modal
  const [viewHomeworkOpen, setViewHomeworkOpen] = useState(false);
  const [viewHomework, setViewHomework] = useState<any>(null);

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

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [homeworkData, classesData] = await Promise.all([
        api.getHomework(),
        isStaff ? api.getClasses() : Promise.resolve([])
      ]);
      setHomework(homeworkData || []);
      setClasses(classesData || []);
    } catch (err: any) {
      console.error('Failed to load initial data:', err.message);
      toast.error('Could not load homework history.');
    } finally {
      setLoading(false);
    }
  };

  const loadHomework = async (secId?: string, subId?: string) => {
    try {
      const params: any = {};
      if (secId) params.sectionId = secId;
      if (subId) params.subjectId = subId;
      const data = await api.getHomework(params);
      setHomework(data || []);
    } catch (err: any) {
      toast.error('Failed to reload homework list');
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
          const res = await api.uploadAssignmentFile(dataUrl, file.name, 'homework-attachments');
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

  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.sectionId || !formData.subjectId) {
      toast.error('Please specify title, section and subject.');
      return;
    }

    setModalLoading(true);
    try {
      await api.createHomework({
        title: formData.title,
        description: formData.description,
        dueDate: formData.dueDate,
        sectionId: formData.sectionId,
        subjectId: formData.subjectId,
        attachments: attachments
      });
      toast.success('Homework created and alerts broadcasted to students & parents!');
      setIsModalOpen(false);
      setFormData({ title: '', description: '', dueDate: '', classId: '', sectionId: '', subjectId: '' });
      setAttachments([]);
      loadHomework(selectedSectionFilter, selectedSubjectFilter);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create homework.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteHomework = async (id: string) => {
    if (!confirm('Are you sure you want to delete this homework?')) return;
    try {
      await api.deleteHomework(id);
      setHomework(prev => prev.filter(a => a.id !== id));
      toast.success('Homework deleted successfully');
    } catch (err) {
      toast.error('Failed to delete homework');
    }
  };

  const handleViewStatus = async (homework: any) => {
    setSelectedHomework(homework);
    setStatusModalOpen(true);
    setSubmissionsLoading(true);
    try {
      const data = await api.getHomeworkSubmissions(homework.id);
      setSubmissions(data || []);
    } catch (err) {
      toast.error('Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleApproveSubmission = async (studentId: string) => {
    try {
      await api.toggleHomeworkStatus({ homeworkId: selectedHomework.id, studentId, isCompleted: true });
      toast.success('Homework approved!');
      setSubmissions(prev => prev.map(s => s.studentId === studentId ? { ...s, status: 'completed' } : s));
    } catch (err) {
      toast.error('Failed to approve homework');
    }
  };

  const handleDenySubmission = async (studentId: string) => {
    try {
      await api.toggleHomeworkStatus({ homeworkId: selectedHomework.id, studentId, isCompleted: false });
      toast.success('Homework marked as pending/denied!');
      setSubmissions(prev => prev.map(s => s.studentId === studentId ? { ...s, status: 'assigned', marksObtained: null, feedback: null } : s));
    } catch (err) {
      toast.error('Failed to update homework');
    }
  };

  const handleMarkAsDone = async (homeworkId: string) => {
    const target = homework.find(h => h.id === homeworkId);
    if (isPastDue(target?.dueDate)) {
      toast.error('The deadline has passed. Submissions are closed.');
      return;
    }
    try {
      if (!user?.id) return;
      await api.toggleHomeworkStatus({ homeworkId, studentId: (user as any).student_id || user.id, isCompleted: true });
      toast.success('Homework marked as done!');
      // Update local status so UI immediately reflects pending review
      setHomework(prev => prev.map(h => h.id === homeworkId ? { ...h, status: 'submitted' } : h));
    } catch (err: any) {
      toast.error(err.message || 'Failed to update homework status');
    }
  };

  // Students submit homework — optionally attaching a file. Backend blocks after the due date.
  const handleSubmitWork = async () => {
    if (!viewHomework) return;
    setSubmitLoading(true);
    try {
      let contentUrl: string | null = null;
      if (submitFile) {
        const dataUrl = await fileToDataUrl(submitFile);
        const res = await api.uploadSubmissionFile(dataUrl, submitFile.name);
        contentUrl = res.url;
      }
      await api.submitAssignment({ assignmentId: viewHomework.id, contentUrl });
      toast.success(submitFile ? 'Homework submitted successfully!' : 'Homework marked as done!');
      setHomework(prev => prev.map(h => h.id === viewHomework.id ? { ...h, status: 'submitted', contentUrl } : h));
      setSubmitFile(null);
      setViewHomeworkOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit homework');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openHomeworkDetails = (hw: any) => {
    setViewHomework(hw);
    setViewHomeworkOpen(true);
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
    const marks = null;

    setGradeLoading(true);
    try {
      // If no submission exists yet, create one first via toggle
      if (!gradeTarget.submissionId) {
        await api.toggleHomeworkStatus({ homeworkId: selectedHomework.id, studentId: gradeTarget.studentId, isCompleted: true });
        // Refetch to get the submissionId
        const freshSubs = await api.getHomeworkSubmissions(selectedHomework.id);
        const freshSub = freshSubs.find((s: any) => s.studentId === gradeTarget.studentId);
        if (freshSub?.submissionId) {
          await api.gradeAssignment({ submissionId: freshSub.submissionId, marks, feedback: gradeFeedback });
        }
      } else {
        await api.gradeAssignment({ submissionId: gradeTarget.submissionId, marks, feedback: gradeFeedback });
      }
      toast.success(`Feedback saved for ${gradeTarget.firstName}!`);
      setSubmissions(prev => prev.map(s => s.studentId === gradeTarget.studentId ? { ...s, status: 'completed', marksObtained: marks, feedback: gradeFeedback } : s));
      setGradeModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to grade submission');
    } finally {
      setGradeLoading(false);
    }
  };

  const filteredHomework = homework.filter(a => {
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
              {isStaff ? 'Academic Homework' : 'My Homework'}
            </h1>
          </div>
          <p className="text-slate-500 font-medium text-sm ml-15">
            {isStaff
              ? 'Create, manage and distribute homework. Updates are automatically sent via Email & WhatsApp to parent/student contacts.'
              : 'Homework for your class and section only.'}
          </p>
        </div>
        {isStaff && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 px-6 font-bold text-sm shadow-xl shadow-blue-600/10 transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Homework
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
              <h3 className="text-2xl font-black text-slate-900 mt-1">{homework.length}</h3>
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
                {homework.reduce((sum, a) => sum + (a.submissions || 0), 0)}
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
                {new Set(homework.map(a => a.subjectName)).size}
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
              placeholder="Search homework by subject, class, title..."
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
      ) : filteredHomework.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/60 text-center px-4">
          <ClipboardList className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No Homework Found</h3>
          <p className="text-slate-500 max-w-md mt-1 text-sm">
            There are no active learning tasks scheduled matching the current filters. Click "Create Homework" to dispatch a new one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHomework.map((homework) => (
            <Card
              key={homework.id}
              onClick={() => openHomeworkDetails(homework)}
              className="border-slate-200/60 shadow-sm hover:shadow-md hover:border-blue-200 transition-all rounded-[28px] overflow-hidden group bg-white flex flex-col justify-between cursor-pointer"
            >
              <div>
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-blue-600/10 text-blue-700 border-none font-black text-[9px] uppercase px-2 py-0.5 rounded-full">
                      {homework.subjectName}
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700 border-none font-bold text-[9px] uppercase px-2 py-0.5 rounded-full">
                      {homework.className}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-black text-slate-800 uppercase tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                    {homework.title}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 mt-2 text-slate-400">
                    <User className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">By {homework.teacherName}</span>
                  </div>
                </CardHeader>

                <CardContent className="p-5 flex-1">
                  <p className="text-slate-600 text-sm leading-relaxed line-clamp-3">
                    {homework.description || 'No description provided.'}
                  </p>

                  {/* Show Feedback if graded */}
                  {!isStaff && homework.feedback && (
                    <div className="mt-4 bg-blue-50/50 rounded-xl p-3 border border-blue-100/50">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1 flex items-center"><MessageSquare className="w-3 h-3 mr-1.5" /> Teacher Feedback</p>
                      <p className="text-sm text-slate-700">{homework.feedback}</p>
                    </div>
                  )}
                </CardContent>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Calendar className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Due: {homework.dueDate ? new Date(homework.dueDate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {(user?.role === 'admin' || (user?.role === 'teacher' && homework.teacherId === user?.id)) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleDeleteHomework(homework.id); }}
                      className="h-9 w-9 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-slate-200 font-bold uppercase text-[10px] h-9"
                    onClick={(e) => { e.stopPropagation(); openHomeworkDetails(homework); }}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" /> Open
                  </Button>
                  {isStaff ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-slate-200 font-bold uppercase text-[10px] h-9"
                      onClick={(e) => { e.stopPropagation(); handleViewStatus(homework); }}
                    >
                      View Status
                    </Button>
                  ) : isPastDue(homework.dueDate) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="rounded-xl border-rose-200 bg-rose-50 font-bold uppercase text-[10px] h-9 text-rose-600"
                    >
                      Closed
                    </Button>
                  ) : homework.status === 'assigned' || !homework.status ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold uppercase text-[10px] h-9 text-white"
                      onClick={(e) => { e.stopPropagation(); handleMarkAsDone(homework.id); }}
                    >
                      Mark as Done
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      {homework.status === 'graded' && homework.marksObtained != null && (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-[10px] px-2 py-1">
                          {homework.marksObtained} marks
                        </Badge>
                      )}
                      <Badge className={`font-bold uppercase text-[9px] px-3 py-1.5 h-9 flex items-center ${homework.status === 'pending' || homework.status === 'submitted' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                        {homework.status === 'pending' || homework.status === 'submitted' ? (
                          'Pending Review'
                        ) : (
                          <><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> {homework.status === 'graded' ? 'Graded' : 'Completed'}</>
                        )}
                      </Badge>
                    </div>
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
              Create New Homework
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium text-xs">
              Fill in curriculum details. Creating this homework will immediately trigger WhatsApp & Email alerts to enrolled parent and student nodes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateHomework} className="space-y-5 py-4">

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Homework Title *</Label>
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
                Once deployed, students will see this under their portal dashboard. Automatic WhatsApp messages will detail the homework title and due date.
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
                {selectedHomework?.title} ({selectedHomework?.className})
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200">
                          {sub.firstName?.[0] || 'S'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{sub.firstName} {sub.lastName}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sub.admissionNumber || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {sub.status === 'pending' || sub.status === 'submitted' ? (
                          <>
                            <Badge className="bg-amber-100 text-amber-700 border-none font-bold uppercase text-[9px] px-2 py-0.5">Pending Review</Badge>
                            {isStaff && (
                              <>
                                <Button size="sm" className="h-8 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApproveSubmission(sub.studentId)}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 rounded-lg font-bold text-xs border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => handleDenySubmission(sub.studentId)}>
                                  Deny
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 rounded-lg font-bold text-xs border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => openGradeModal(sub)}>
                                  <Award className="w-3 h-3 mr-1" /> Grade
                                </Button>
                              </>
                            )}
                          </>
                        ) : sub.status === 'completed' || sub.status === 'graded' ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            {sub.marksObtained != null && (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-[10px] px-2 py-0.5">
                                <Star className="w-3 h-3 mr-1 inline" /> {sub.marksObtained} marks
                              </Badge>
                            )}
                            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 font-bold uppercase text-[9px] px-2 py-0.5">
                              <CheckCircle className="w-3 h-3 mr-1 inline" /> Completed
                            </Badge>
                            {isStaff && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 rounded-lg font-bold text-[10px] border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => handleDenySubmission(sub.studentId)}>
                                  Deny
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-lg font-bold text-[10px] border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => openGradeModal(sub)}>
                                  <Award className="w-3 h-3 mr-1" /> Add Feedback
                                </Button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-slate-400 border-slate-200 font-bold uppercase text-[9px] px-2 py-0.5">
                              Not Started
                            </Badge>
                            {isStaff && (
                              <>
                                <Button size="sm" className="h-7 rounded-lg font-bold text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApproveSubmission(sub.studentId)}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-lg font-bold text-[10px] border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => openGradeModal(sub)}>
                                  <Award className="w-3 h-3 mr-1" /> Grade
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {sub.feedback && (
                      <div className="mt-2 ml-0 sm:ml-[52px] bg-slate-50 rounded-lg p-2 border border-slate-100">
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
                Grade Homework
              </DialogTitle>
              <DialogDescription className="text-blue-100 font-medium text-xs mt-1">
                {gradeTarget?.firstName} {gradeTarget?.lastName} — {selectedHomework?.title}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-5">

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
              <><Star className="w-4 h-4 mr-2" /> Save Feedback</>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Homework Details Modal */}
      <Dialog open={viewHomeworkOpen} onOpenChange={setViewHomeworkOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[600px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-0">
          <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-black text-white">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                Homework Details
              </DialogTitle>
              <DialogDescription className="text-blue-100 font-medium text-xs mt-1">
                View full homework information and attachments
              </DialogDescription>
            </DialogHeader>
          </div>

          {viewHomework && (
            <div className="p-6 space-y-5">
              {/* Subject & Class badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-600/10 text-blue-700 border-none font-black text-[10px] uppercase px-3 py-1 rounded-full">
                  {viewHomework.subjectName}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 border-none font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                  {viewHomework.className}
                </Badge>
              </div>

              {/* Title */}
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Title</Label>
                <h3 className="text-2xl font-black text-slate-900 mt-1 uppercase tracking-tight">{viewHomework.title}</h3>
              </div>

              {/* Teacher */}
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                  {viewHomework.teacherName?.[0] || 'T'}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">By {viewHomework.teacherName || 'Teacher'}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned by</p>
                </div>
              </div>

              {/* Due date */}
              <div className="flex items-center gap-2 bg-amber-50 rounded-xl p-3 border border-amber-100">
                <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    Due: {viewHomework.dueDate ? new Date(viewHomework.dueDate).toLocaleDateString() : 'No due date'}
                  </p>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Submission deadline</p>
                </div>
              </div>

              {/* Full description */}
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Instructions</Label>
                <div className="mt-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {viewHomework.description || 'No detailed instructions provided for this homework.'}
                  </p>
                </div>
              </div>

              {/* Attachments */}
              {viewHomework.attachments && viewHomework.attachments.length > 0 && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Attachments ({viewHomework.attachments.length})
                  </Label>
                  <div className="mt-2 space-y-2">
                    {viewHomework.attachments.map((att: any, idx: number) => (
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

              {/* Teacher Feedback */}
              {viewHomework.feedback && (
                <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50">
                  <Label className="text-[10px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Teacher Feedback
                  </Label>
                  <p className="text-sm text-slate-700 mt-1">{viewHomework.feedback}</p>
                </div>
              )}

              {/* ── Student submission panel ── */}
              {!isStaff && viewHomework && (() => {
                const graded = viewHomework.status === 'graded' || viewHomework.marksObtained != null;
                const submitted = viewHomework.isCompleted || viewHomework.status === 'submitted';
                const overdue = isPastDue(viewHomework.dueDate);
                if (overdue && !graded && !submitted) {
                  return (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3">
                      <X className="w-5 h-5 text-rose-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-rose-700">Deadline passed — submissions closed</p>
                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-0.5">
                          Due: {viewHomework.dueDate ? new Date(viewHomework.dueDate).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (graded || submitted) {
                  return (
                    <div className={`rounded-xl border p-4 ${graded ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${graded ? 'text-emerald-700' : 'text-blue-700'}`}>
                          {graded ? 'Graded' : 'Submitted ✓'}
                        </span>
                        {graded && viewHomework.marksObtained != null && (
                          <span className="text-lg font-black text-emerald-800">{viewHomework.marksObtained}</span>
                        )}
                      </div>
                      {viewHomework.contentUrl && (
                        <Button variant="outline" size="sm" className="mt-3 rounded-lg border-slate-200 text-blue-600 font-bold text-[10px] uppercase h-8"
                          onClick={() => openAttachment(viewHomework.contentUrl)}>
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> View My File
                        </Button>
                      )}
                    </div>
                  );
                }
                return (
                  <StudentSubmitForm
                    submitFile={submitFile}
                    setSubmitFile={setSubmitFile}
                    submitLoading={submitLoading}
                    onSubmit={handleSubmitWork}
                    onMarkDone={() => { handleMarkAsDone(viewHomework.id); setViewHomeworkOpen(false); }}
                  />
                );
              })()}
            </div>
          )}

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setViewHomeworkOpen(false)} className="w-full h-11 rounded-xl font-bold uppercase text-[10px] tracking-wider border-slate-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
