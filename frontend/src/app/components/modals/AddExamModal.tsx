import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { ClassSectionSubjectPicker } from '../academic/ClassSectionSubjectPicker';
import { toast } from 'sonner';
import { Loader2, Calendar, MapPin, FileText, Plus } from 'lucide-react';

interface AddExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  exam?: any;
}

const defaultForm = {
  name: '',
  examTypeId: '',
  classId: '',
  sectionId: '',
  subjectId: '',
  date: '',
  startTime: '',
  endTime: '',
  totalMarks: '100',
  passingMarks: '33',
  room: '',
  status: 'scheduled',
  instructions: '',
};

export function AddExamModal({ isOpen, onClose, onSuccess, exam }: AddExamModalProps) {
  const [loading, setLoading] = useState(false);
  const [examTypes, setExamTypes] = useState<any[]>([]);
  const [examTypesLoading, setExamTypesLoading] = useState(false);
  const [formData, setFormData] = useState<any>({ ...defaultForm });

  const isEdit = !!exam;

  useEffect(() => {
    if (isOpen) {
      fetchExamTypes();
      if (exam) {
        setFormData({
          ...defaultForm,
          ...exam,
          examTypeId: exam.exam_type_id || exam.examTypeId || '',
          classId: exam.class_id || exam.classId || '',
          sectionId: exam.section_id || exam.sectionId || '',
          subjectId: exam.subject_id || exam.subjectId || '',
          startTime: exam.start_time || exam.startTime || '',
          endTime: exam.end_time || exam.endTime || '',
          totalMarks: exam.total_marks || exam.totalMarks || '100',
          passingMarks: exam.passing_marks || exam.passingMarks || '33',
        });
      } else {
        setFormData({ ...defaultForm });
      }
    }
  }, [isOpen, exam]);

  const fetchExamTypes = async () => {
    try {
      setExamTypesLoading(true);
      const types: any = await api.getExamTypes();
      const extracted = Array.isArray(types) ? types : (Array.isArray(types?.data) ? types.data : []);
      setExamTypes(extracted);
    } catch {
      setExamTypes([]);
      toast.error('Could not load exam types — please check your connection');
    } finally {
      setExamTypesLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.classId || !formData.subjectId) {
      toast.error('Please fill exam title, class, and subject');
      return;
    }
    if (!formData.examTypeId) {
      toast.error('Please select an exam type');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        examTypeId: formData.examTypeId,
        classId: formData.classId,
        sectionId: formData.sectionId || undefined,
        subjectId: formData.subjectId,
        date: formData.date || null,
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
        totalMarks: parseFloat(formData.totalMarks) || 100,
        passingMarks: parseFloat(formData.passingMarks) || 33,
        room: formData.room || null,
        instructions: formData.instructions || null,
        status: formData.status,
      };

      if (isEdit) {
        await api.updateExam(exam.id, payload);
        toast.success('Exam updated successfully');
      } else {
        await api.createExam(payload);
        toast.success('Exam scheduled and notifications sent');
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save exam');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[600px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg sm:text-xl font-black text-gray-900">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            {isEdit ? 'Update Exam' : 'Create New Assessment'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 font-medium text-sm">
            Select class and subject from your mapped curriculum. Notifications go to students and parents automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Exam Title *</Label>
              <Input
                required
                placeholder="e.g. First Term Exam"
                value={formData.name}
                className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full"
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Exam Type *</Label>
              <Select value={formData.examTypeId} onValueChange={(v) => setFormData({ ...formData, examTypeId: v })}>
                <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full">
                  <SelectValue placeholder={examTypesLoading ? 'Loading...' : examTypes.length ? 'Select Type' : 'No types found'} />
                </SelectTrigger>
                <SelectContent>
                  {examTypes.length === 0 && !examTypesLoading && (
                    <div className="p-3 text-center">
                      <p className="text-xs text-gray-500 font-medium mb-2">No exam types found.</p>
                      <button
                        type="button"
                        className="text-xs font-black text-blue-600 hover:underline"
                        onClick={fetchExamTypes}
                      >Try again</button>
                    </div>
                  )}
                  {examTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {examTypes.length === 0 && !examTypesLoading && (
                <p className="text-[10px] text-amber-600 font-bold">⚠ Run the exam_types_table.sql migration in Supabase, then refresh.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ClassSectionSubjectPicker
            value={{ classId: formData.classId, sectionId: formData.sectionId, subjectId: formData.subjectId }}
            onChange={(v) => setFormData({ ...formData, ...v })}
          />

          <div className="bg-gray-50/50 p-4 sm:p-6 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Schedule & Logistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-gray-400">Date</Label>
                <Input type="date" value={formData.date} className="h-12 rounded-xl w-full" onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-gray-400">Start Time</Label>
                <Input type="time" value={formData.startTime} className="h-12 rounded-xl w-full" onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-gray-400">End Time</Label>
                <Input type="time" value={formData.endTime} className="h-12 rounded-xl w-full" onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-400">Venue / Room</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="e.g. Block B-402" className="pl-10 h-12 rounded-xl w-full" value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-400">Instructions</Label>
              <Input placeholder="Exam instructions for students..." className="h-12 rounded-xl w-full" value={formData.instructions || ''} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Total Marks</Label>
              <Input type="number" value={formData.totalMarks} className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full" onChange={(e) => setFormData({ ...formData, totalMarks: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Passing Marks</Label>
              <Input type="number" value={formData.passingMarks} className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full" onChange={(e) => setFormData({ ...formData, passingMarks: e.target.value })} />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-3 flex-col sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl font-bold h-12 w-full sm:w-auto">Cancel</Button>
            <Button type="submit" loading={loading} className="h-12 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold w-full sm:w-auto">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : isEdit ? <FileText className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEdit ? 'Update Exam' : 'Deploy Assessment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
