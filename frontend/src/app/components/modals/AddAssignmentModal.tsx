import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AddAssignmentModalProps {

  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any; // For editing
}

export function AddAssignmentModal({ isOpen, onClose, onSuccess, initialData }: AddAssignmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    maxMarks: '',
    academicYearId: '',
    classId: '',
    sectionId: '',
    subjectId: ''
  });

  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          title: initialData.title || '',
          description: initialData.description || '',
          dueDate: initialData.dueDate || '',
          maxMarks: initialData.maxMarks || initialData.total || '',
          academicYearId: initialData.academicYearId || '',
          classId: initialData.classId || '',
          sectionId: initialData.sectionId || '',
          subjectId: initialData.subjectId || ''
        });
      } else {
        setFormData({
          title: '',
          description: '',
          dueDate: '',
          maxMarks: '',
          academicYearId: '',
          classId: '',
          sectionId: '',
          subjectId: ''
        });
      }

      // Load dropdown data
      api.getAcademicYears().then(setAcademicYears).catch(console.error);
      api.getClasses().then(setClasses).catch(console.error);
      api.getSubjects().then(setSubjects).catch(console.error);
    }
  }, [isOpen, initialData]);

  const handleClassChange = (classId: string) => {
    setFormData(prev => ({ ...prev, classId, sectionId: '' }));
    const cls = classes.find(c => c.id === classId);
    setSections(cls?.sections || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.sectionId || !formData.subjectId) {
      toast.error('Title, Section, and Subject are required');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        dueDate: formData.dueDate,
        maxMarks: Number(formData.maxMarks),
        academicYearId: formData.academicYearId,
        sectionId: formData.sectionId,
        subjectId: formData.subjectId,
        attachments: attachments,
      };

      if (initialData) {
        await api.updateAssignment(initialData.id, payload);
        toast.success('Assignment updated successfully');
      } else {
        await api.createAssignment(payload);
        toast.success('Assignment created successfully');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save assignment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-gray-900">{initialData ? 'Edit Assignment' : 'Create Assignment'}</DialogTitle>
          <DialogDescription className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            {initialData ? 'Update assignment details below' : 'Fill in the details to deploy a new assignment'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Title</Label>
            <Input
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Physics Chapter 4 Worksheet"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Academic Year</Label>
              <Select value={formData.academicYearId} onValueChange={v => setFormData({ ...formData, academicYearId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                <SelectContent>
                  {academicYears.map(yr => (
                    <SelectItem key={yr.id} value={yr.id}>{yr.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Subject</Label>
              <Select value={formData.subjectId} onValueChange={v => setFormData({ ...formData, subjectId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Class</Label>
              <Select value={formData.classId} onValueChange={handleClassChange}>
                <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Section</Label>
              <Select value={formData.sectionId} onValueChange={v => setFormData({ ...formData, sectionId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Section" /></SelectTrigger>
                <SelectContent>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Due Date</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Max Marks</Label>
              <Input
                type="number"
                value={formData.maxMarks}
                onChange={e => setFormData({ ...formData, maxMarks: e.target.value })}
                placeholder="e.g. 100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Description</Label>
            <Textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed instructions for the assignment..."
              className="resize-none"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Attachments (PDF, Docs, Images)</Label>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <input type="file" className="hidden" onChange={handleFileUpload} />
              {uploading ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Upload className="w-4 h-4 text-blue-600" />}
              <span className="text-sm text-gray-600">{uploading ? 'Uploading to S3...' : 'Click to upload a file'}</span>
            </label>
            {attachments.length > 0 && (
              <div className="space-y-2 mt-2">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-sm text-gray-700 flex-1 truncate">{att.filename}</span>
                    <button type="button" onClick={() => removeAttachment(i)} className="text-red-500 hover:text-red-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" loading={loading} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 flex items-center justify-center">

              {initialData ? 'Update Assignment' : 'Create Assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
