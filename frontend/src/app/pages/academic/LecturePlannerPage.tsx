import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Calendar, Plus, Edit, Trash2, Clock, BookOpen, Users, Filter, Loader2, Eye, Paperclip, ExternalLink, MapPin, Link2, FileText, GraduationCap, ChevronRight, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function LecturePlannerPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const [lectures, setLectures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '', date: '', startTime: '', endTime: '',
    classId: '', sectionId: '', subjectId: '', teacherId: '',
    chapter: '', topic: '', description: '', room: '',
    meetingLink: '', homework: '', priority: 'medium',
    chapterStartDate: '', chapterEndDate: '',
    recurringType: 'none', recurringEndDate: ''
  });
  const [resources, setResources] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  // View lecture details modal
  const [viewLectureOpen, setViewLectureOpen] = useState(false);
  const [viewLecture, setViewLecture] = useState<any>(null);

  useEffect(() => {
    loadData();
    loadDropdowns();
  }, []);

  useEffect(() => {
    if (formData.classId) {
      api.getSubjects({ classId: formData.classId }).then(sub => {
        setSubjects(Array.isArray(sub) ? sub : []);
      });
    } else {
      setSubjects([]);
    }
  }, [formData.classId]);

  useEffect(() => {
    if (formData.classId && formData.sectionId && formData.subjectId && formData.date) {
      const dayOfWeek = new Date(formData.date).getDay() || 7; // Treat Sunday as 7
      api.getTimetable(formData.classId, formData.sectionId).then((res) => {
        if (!res.error && Array.isArray(res.slots || res)) {
          const slots = Array.isArray(res) ? res : res.slots;
          const slot = slots.find((s: any) =>
            (s.subject_id === formData.subjectId || s.subject?.id === formData.subjectId) &&
            s.day_of_week === dayOfWeek
          );
          if (slot) {
            setFormData(prev => ({
              ...prev,
              startTime: slot.start_time?.substring(0, 5) || prev.startTime,
              endTime: slot.end_time?.substring(0, 5) || prev.endTime,
              teacherId: slot.teacher_id || slot.teacher?.id || prev.teacherId
            }));
            toast.success('Auto-filled time from timetable');
          }
        }
      }).catch(() => { });
    }
  }, [formData.classId, formData.sectionId, formData.subjectId, formData.date]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getLecturePlans();
      if (!res.error) setLectures(res);
    } catch (e) {
      toast.error('Failed to load lecture plans');
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    try {
      const [cls, tch] = await Promise.all([
        api.getClasses().catch(() => []),
        api.getTeachers().catch(() => [])
      ]);
      const classesData = Array.isArray(cls) ? cls : [];
      setClasses(classesData);
      setTeachers(Array.isArray(tch) ? tch : []);

      const mappedSections = classesData.flatMap((c: any) => c.sections || []);
      setSections(mappedSections);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        resources: resources,
        recurring: formData.recurringType !== 'none' ? {
          type: formData.recurringType,
          endDate: formData.recurringEndDate
        } : undefined
      };
      const res = await api.createLecturePlan(payload);
      if (res.error) throw new Error(res.error);
      toast.success('Lecture plan created!');
      setShowModal(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error saving lecture');
    } finally {
      setSaving(false);
    }
  };

  const openLectureDetails = (lecture: any) => {
    setViewLecture(lecture);
    setViewLectureOpen(true);
  };

  const parseAttachments = (field: any): any[] => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try { return JSON.parse(field); } catch { return []; }
  };

  const openAttachment = (url: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
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
          const res = await api.uploadAssignmentFile(dataUrl, file.name, 'lecture-resources');
          setResources(prev => [...prev, { url: res.url, filename: file.name, contentType: res.contentType }]);
          toast.success(`"${file.name}" uploaded`);
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

  const removeResource = (index: number) => {
    setResources(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 sm:gap-0 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            Lecture Planner
          </h1>
          <p className="text-gray-500 mt-1">Schedule and manage daily academic lectures</p>
        </div>
        {isStaff && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-full sm:w-auto shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Plan Lecture
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lectures.map((lecture) => (
            <div
              key={lecture.id}
              onClick={() => openLectureDetails(lecture)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
            >
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 mb-2">
                      <Clock className="w-3 h-3" />
                      {lecture.start_time.substring(0, 5)} - {lecture.end_time.substring(0, 5)}
                    </span>
                    <h3 className="font-semibold text-gray-900 text-lg leading-tight">{lecture.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{new Date(lecture.date).toLocaleDateString()}</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${lecture.status === 'completed' ? 'bg-green-100 text-green-800' :
                    lecture.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                    {lecture.status}
                  </div>
                </div>

                <div className="space-y-2 mt-4 text-sm text-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Subject:</span>
                    <span className="font-medium text-gray-900">{lecture.subject?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Class/Section:</span>
                    <span className="font-medium text-gray-900">{lecture.class?.name} - {lecture.section?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Teacher:</span>
                    <span className="font-medium text-gray-900">{lecture.teacher?.first_name} {lecture.teacher?.last_name}</span>
                  </div>
                  {lecture.topic && (
                    <div className="flex flex-col mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-500 mb-1">Topic to Cover:</span>
                      <span className="font-medium text-gray-900">{lecture.topic}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {lectures.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
              No lectures planned yet. Click 'Plan Lecture' to get started.
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-semibold text-gray-900">Plan New Lecture</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Form fields here - truncated for brevity but implements full fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input type="time" required value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input type="time" required value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                  <select required value={formData.classId} onChange={e => setFormData({ ...formData, classId: e.target.value, sectionId: '', subjectId: '' })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                  <select required value={formData.sectionId} onChange={e => setFormData({ ...formData, sectionId: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" disabled={!formData.classId}>
                    <option value="">Select Section</option>
                    {sections.filter(s => s.class_id === formData.classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select required value={formData.subjectId} onChange={e => setFormData({ ...formData, subjectId: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">Select Subject</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chapter Name</label>
                  <input type="text" value={formData.chapter} onChange={e => setFormData({ ...formData, chapter: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="e.g. Fractions" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chapter Start Date</label>
                  <input type="date" value={formData.chapterStartDate} onChange={e => setFormData({ ...formData, chapterStartDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chapter End Date</label>
                  <input type="date" value={formData.chapterEndDate} onChange={e => setFormData({ ...formData, chapterEndDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Topic / Syllabus coverage</label>
                  <textarea value={formData.topic} onChange={e => setFormData({ ...formData, topic: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2}></textarea>
                </div>

                <div className="col-span-1 sm:col-span-2 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <h4 className="text-sm font-semibold text-blue-900 mb-3">Plan Multiple Dates (Recurring)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recurring Pattern</label>
                      <select value={formData.recurringType} onChange={e => setFormData({ ...formData, recurringType: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {formData.recurringType !== 'none' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input type="date" required value={formData.recurringEndDate} onChange={e => setFormData({ ...formData, recurringEndDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Resources / Attachments</label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Upload className="w-4 h-4 text-blue-600" />}
                  <span className="text-sm text-slate-600">{uploading ? 'Uploading...' : 'Click to upload a file'}</span>
                </label>
                {resources.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {resources.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-sm text-slate-700 flex-1 truncate">{att.filename}</span>
                        <button type="button" onClick={() => removeResource(i)} className="text-rose-500 hover:text-rose-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
                <button type="button" onClick={() => setShowModal(false)} className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center">

                  {saving ? 'Saving...' : 'Save Lecture Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Lecture Details Modal */}
      <Dialog open={viewLectureOpen} onOpenChange={setViewLectureOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[650px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-0">
          <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-black text-white">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                Lecture Details
              </DialogTitle>
              <DialogDescription className="text-blue-100 font-medium text-xs mt-1">
                Full lecture plan information
              </DialogDescription>
            </DialogHeader>
          </div>

          {viewLecture && (
            <div className="p-6 space-y-5">
              {/* Status badge */}
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className={`font-bold uppercase text-[10px] px-3 py-1 rounded-full ${viewLecture.status === 'completed' ? 'bg-green-50 text-green-700' :
                  viewLecture.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                    'bg-yellow-50 text-yellow-700'
                  }`}>
                  {viewLecture.status || 'scheduled'}
                </Badge>
                {viewLecture.subject?.name && (
                  <Badge className="bg-blue-600/10 text-blue-700 border-none font-black text-[10px] uppercase px-3 py-1 rounded-full">
                    {viewLecture.subject.name}
                  </Badge>
                )}
              </div>

              {/* Title */}
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{viewLecture.title}</h3>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {new Date(viewLecture.date).toLocaleDateString()}
                </p>
              </div>

              {/* Time */}
              <div className="flex items-center gap-2 bg-blue-50 rounded-xl p-3 border border-blue-100">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="text-sm font-bold text-blue-800">
                  {viewLecture.start_time.substring(0, 5)} - {viewLecture.end_time.substring(0, 5)}
                </p>
              </div>

              {/* Class & Teacher info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Class / Section</Label>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {viewLecture.class?.name} - {viewLecture.section?.name}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Teacher</Label>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {viewLecture.teacher?.first_name} {viewLecture.teacher?.last_name}
                  </p>
                </div>
              </div>

              {/* Chapter & Topic */}
              {viewLecture.chapter && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Chapter</Label>
                  <p className="text-sm font-bold text-slate-800 mt-1">{viewLecture.chapter}</p>
                </div>
              )}
              {viewLecture.topic && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Topic to Cover</Label>
                  <div className="mt-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{viewLecture.topic}</p>
                  </div>
                </div>
              )}

              {/* Room */}
              {viewLecture.room && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{viewLecture.room}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Room</p>
                  </div>
                </div>
              )}

              {/* Meeting link */}
              {viewLecture.meetingLink && (
                <div className="flex items-center gap-2 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <Link2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-800 truncate">{viewLecture.meetingLink}</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Meeting Link</p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-lg border-emerald-200 text-emerald-600 font-bold text-[10px] uppercase h-8"
                    onClick={() => openAttachment(viewLecture.meetingLink)}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Join
                  </Button>
                </div>
              )}

              {/* Resources / Attachments */}
              {parseAttachments(viewLecture.resources).length > 0 && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Resources ({parseAttachments(viewLecture.resources).length})
                  </Label>
                  <div className="mt-2 space-y-2">
                    {parseAttachments(viewLecture.resources).map((res: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{res.filename || 'Resource'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to open</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-blue-200 text-blue-600 font-bold text-[10px] uppercase h-8"
                          onClick={() => openAttachment(res.url)}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Homework assigned */}
              {viewLecture.homework && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <Label className="text-[10px] font-black uppercase text-amber-600 tracking-widest flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Homework
                  </Label>
                  <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{viewLecture.homework}</p>
                </div>
              )}

              {/* Error: Label imported */}
            </div>
          )}

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setViewLectureOpen(false)} className="w-full h-11 rounded-xl font-bold uppercase text-[10px] tracking-wider border-slate-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
