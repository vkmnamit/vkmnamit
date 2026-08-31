import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { FileText, Plus, Clock, Users, Loader2, Eye, Paperclip, ExternalLink, Calendar, BookOpen, Award, MessageSquare, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function AssessmentPlannerPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '', type: 'assignment', date: '', dueDate: '',
    classId: '', subjectId: '', totalMarks: 100, passingMarks: 33,
    description: '', instructions: '', status: 'draft'
  });
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  // View assessment details modal
  const [viewAssessmentOpen, setViewAssessmentOpen] = useState(false);
  const [viewAssessment, setViewAssessment] = useState<any>(null);

  useEffect(() => {
    loadData();
    loadDropdowns();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getAssessments();
      if (!res.error) setAssessments(res);
    } catch (e) {
      toast.error('Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    try {
      const [cls, sub] = await Promise.all([
        api.getClasses().catch(() => []),
        api.getSubjects().catch(() => [])
      ]);
      setClasses(Array.isArray(cls) ? cls : []);
      setSubjects(Array.isArray(sub) ? sub : []);
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
        assignedDate: formData.date || new Date().toISOString().split('T')[0],
        attachments: attachments,
      };
      const res = await api.createAssessment(payload);
      if (res.error) throw new Error(res.error);
      toast.success('Assessment created!');
      setShowModal(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error saving assessment');
    } finally {
      setSaving(false);
    }
  };

  const openAssessmentDetails = (assessment: any) => {
    setViewAssessment(assessment);
    setViewAssessmentOpen(true);
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
          const res = await api.uploadAssignmentFile(dataUrl, file.name, 'assessment-attachments');
          setAttachments(prev => [...prev, { url: res.url, filename: file.name, contentType: res.contentType }]);
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

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 sm:gap-0 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-600" />
            Assessment Planner
          </h1>
          <p className="text-gray-500 mt-1">Schedule assignments, tests, and final exams</p>
        </div>
        {isStaff && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 w-full sm:w-auto shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Create Assessment
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assessments.map((assessment) => (
            <div
              key={assessment.id}
              onClick={() => openAssessmentDetails(assessment)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group"
            >
              <div className="p-5 border-b border-gray-50 flex justify-between items-start">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 mb-2 inline-block capitalize">
                    {assessment.type.replace('_', ' ')}
                  </span>
                  <h3 className="font-semibold text-gray-900 text-lg leading-tight">{assessment.title}</h3>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium capitalize ${assessment.status === 'published' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                  }`}>
                  {assessment.status}
                </div>
              </div>
              <div className="p-5 bg-gray-50/50 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Due</span>
                  <span className="font-medium text-gray-900">{assessment.due_date ? new Date(assessment.due_date).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5"><Users className="w-4 h-4" /> Class</span>
                  <span className="font-medium text-gray-900">{assessment.class?.name || 'All'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Marks</span>
                  <span className="font-medium text-gray-900">{assessment.total_marks} (Pass: {assessment.passing_marks})</span>
                </div>
              </div>
            </div>
          ))}
          {assessments.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
              No assessments planned. Click 'Create Assessment' to schedule one.
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-semibold text-gray-900">Create Assessment</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" placeholder="e.g. Mid-Term Physics Exam" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select required value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none">
                    <option value="assignment">Assignment</option>
                    <option value="homework">Homework</option>
                    <option value="class_test">Class Test</option>
                    <option value="unit_test">Unit Test</option>
                    <option value="exam">Exam</option>
                    <option value="project">Project</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input type="date" required value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                  <select required value={formData.classId} onChange={e => setFormData({ ...formData, classId: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select required value={formData.subjectId} onChange={e => setFormData({ ...formData, subjectId: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">Select Subject</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Marks</label>
                  <input type="number" required value={formData.totalMarks} onChange={e => setFormData({ ...formData, totalMarks: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select required value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="draft">Save as Draft</option>
                    <option value="published">Publish Now (Notifies users)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachments (PDF, Docs, Images)</label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors">
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : <Upload className="w-4 h-4 text-purple-600" />}
                  <span className="text-sm text-slate-600">{uploading ? 'Uploading...' : 'Click to upload a file'}</span>
                </label>
                {attachments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                        <span className="text-sm text-slate-700 flex-1 truncate">{att.filename}</span>
                        <button type="button" onClick={() => removeAttachment(i)} className="text-rose-500 hover:text-rose-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center">

                  {saving ? 'Saving...' : 'Save Assessment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Assessment Details Modal */}
      <Dialog open={viewAssessmentOpen} onOpenChange={setViewAssessmentOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[600px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-0">
          <div className="p-6 bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-black text-white">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                Assessment Details
              </DialogTitle>
              <DialogDescription className="text-purple-100 font-medium text-xs mt-1">
                Full assessment information
              </DialogDescription>
            </DialogHeader>
          </div>

          {viewAssessment && (
            <div className="p-6 space-y-5">
              {/* Type & Status badges */}
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className="bg-purple-600/10 text-purple-700 border-none font-black text-[10px] uppercase px-3 py-1 rounded-full">
                  {viewAssessment.type?.replace('_', ' ')}
                </Badge>
                <Badge className={`font-bold uppercase text-[10px] px-3 py-1 rounded-full ${viewAssessment.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                  {viewAssessment.status || 'draft'}
                </Badge>
              </div>

              {/* Title */}
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{viewAssessment.title}</h3>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  Due: {viewAssessment.due_date ? new Date(viewAssessment.due_date).toLocaleDateString() : 'N/A'}
                </p>
              </div>

              {/* Marks */}
              <div className="flex items-center gap-2 bg-purple-50 rounded-xl p-3 border border-purple-100">
                <Award className="w-4 h-4 text-purple-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-purple-800">
                    {viewAssessment.total_marks} marks (Pass: {viewAssessment.passing_marks})
                  </p>
                  <p className="text-[10px] font-bold text-purple-500 uppercase tracking-widest">Grading details</p>
                </div>
              </div>

              {/* Class & Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Class</Label>
                  <p className="text-sm font-bold text-slate-800 mt-1">{viewAssessment.class?.name || 'All'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Subject</Label>
                  <p className="text-sm font-bold text-slate-800 mt-1">{viewAssessment.subject?.name || 'All'}</p>
                </div>
              </div>

              {/* Description */}
              {viewAssessment.description && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Description</Label>
                  <div className="mt-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{viewAssessment.description}</p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              {viewAssessment.instructions && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Instructions</Label>
                  <div className="mt-2 bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <p className="text-sm text-purple-900 leading-relaxed whitespace-pre-wrap">{viewAssessment.instructions}</p>
                  </div>
                </div>
              )}

              {/* Attachments */}
              {parseAttachments(viewAssessment.attachments).length > 0 && (
                <div>
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Attachments ({parseAttachments(viewAssessment.attachments).length})
                  </Label>
                  <div className="mt-2 space-y-2">
                    {parseAttachments(viewAssessment.attachments).map((att: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{att.filename || 'Attachment'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to open</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-purple-200 text-purple-600 font-bold text-[10px] uppercase h-8"
                          onClick={() => openAttachment(att.url)}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setViewAssessmentOpen(false)} className="w-full h-11 rounded-xl font-bold uppercase text-[10px] tracking-wider border-slate-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
