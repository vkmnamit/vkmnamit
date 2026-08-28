import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, CalendarClock, Trash2 } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';

interface AddTimetableSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  slot?: any;
  sectionId: string;
  classId: string;
}

export function AddTimetableSlotModal({ isOpen, onClose, onSuccess, slot, sectionId, classId }: AddTimetableSlotModalProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({
    sectionId: sectionId,
    subjectId: '',
    teacherId: '',
    daysOfWeek: ['1'],
    periodNumber: '1',
    startTime: '08:00',
    endTime: '09:00',
    room: ''
  });
  const [makeClassTeacher, setMakeClassTeacher] = useState(false);

  const isEdit = !!slot?.id;

  useEffect(() => {
    if (isOpen) {
      fetchMetadata();
      if (slot?.id) {
        setFormData({
          sectionId,
          daysOfWeek: [slot.day_of_week?.toString() || '1'],
          periodNumber: slot.period_number?.toString() || '1',
          subjectId: slot.subject_id || '',
          teacherId: slot.teacher_id || '',
          startTime: slot.start_time?.substring(0, 5) || '08:00',
          endTime: slot.end_time?.substring(0, 5) || '09:00',
          room: slot.room_number || slot.room || ''
        });
      } else {
        setFormData({
          sectionId,
          subjectId: '',
          teacherId: '',
          daysOfWeek: [slot?.day_of_week?.toString() || '1'],
          periodNumber: '1',
          startTime: '08:00',
          endTime: '09:00',
          room: ''
        });
        setMakeClassTeacher(false);
      }
    }
  }, [isOpen, slot, sectionId]);

  const fetchMetadata = async () => {
    try {
      const [teachersData, subjectsData] = await Promise.all([
        api.getTeachers(),
        classId ? api.getSubjects({ classId }) : Promise.resolve([])
      ]);
      const teacherList = teachersData?.data || teachersData?.teachers || (Array.isArray(teachersData) ? teachersData : []);
      setTeachers(teacherList);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (err) {
      toast.error('Failed to load teachers or subjects');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subjectId || !formData.teacherId || !formData.daysOfWeek.length) {
      toast.error('Please select subject, teacher, and at least one day');
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        const payload = {
          sectionId: formData.sectionId || sectionId,
          subjectId: formData.subjectId,
          teacherId: formData.teacherId,
          dayOfWeek: parseInt(formData.daysOfWeek[0]),
          periodNumber: parseInt(formData.periodNumber),
          startTime: formData.startTime,
          endTime: formData.endTime,
          room: formData.room,
          makeClassTeacher
        };
        await api.updateTimetableSlot(slot.id, payload);
        toast.success('Slot updated successfully');
      } else {
        const promises = formData.daysOfWeek.map((day: string) => {
          return api.createTimetableSlot({
            sectionId: formData.sectionId || sectionId,
            subjectId: formData.subjectId,
            teacherId: formData.teacherId,
            dayOfWeek: parseInt(day),
            periodNumber: parseInt(formData.periodNumber),
            startTime: formData.startTime,
            endTime: formData.endTime,
            room: formData.room,
            makeClassTeacher
          });
        });
        await Promise.all(promises);
        toast.success(promises.length > 1 ? `Added ${promises.length} slots successfully` : 'Timetable slot added');
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save slot');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!slot?.id) return;
    setDeleting(true);
    try {
      await api.deleteTimetableSlot(slot.id);
      toast.success('Slot removed');
      onSuccess?.();
      onClose();
    } catch {
      toast.error('Failed to delete slot');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[500px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl sm:rounded-3xl border-none shadow-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-black text-gray-900">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <CalendarClock className="w-5 h-5" />
            </div>
            {isEdit ? 'Modify Schedule Slot' : 'Allocate New Slot'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 font-medium">
            Assign subject, teacher, and room for this period.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Days of Week</Label>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, daysOfWeek: ['1', '2', '3', '4', '5', '6'] })}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                >
                  Select All Week
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {['1', '2', '3', '4', '5', '6'].map(d => {
                const isSelected = formData.daysOfWeek.includes(d);
                const dayMap: Record<string, string> = { '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat' };
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => {
                      if (isEdit) {
                        setFormData({ ...formData, daysOfWeek: [d] });
                      } else {
                        const newDays = isSelected
                          ? formData.daysOfWeek.filter((x: string) => x !== d)
                          : [...formData.daysOfWeek, d];
                        if (newDays.length > 0) setFormData({ ...formData, daysOfWeek: newDays });
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      isSelected ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {dayMap[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Period Number</Label>
            <Input type="number" min="1" max="10" value={formData.periodNumber} className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full sm:w-1/2" onChange={(e) => setFormData({ ...formData, periodNumber: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Teacher *</Label>
              <Select value={formData.teacherId} onValueChange={(v) => setFormData({ ...formData, teacherId: v })}>
                <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full"><SelectValue placeholder="Assign Teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t: any) => {
                    const userId = t.userId || t.user?.id;
                    const name = t.profile?.full_name || `${t.profile?.first_name || t.user?.first_name || ''} ${t.profile?.last_name || t.user?.last_name || ''}`.trim();
                    return (
                      <SelectItem key={userId} value={userId}>{name || 'Teacher'}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {formData.teacherId && (
                <div className="flex items-center space-x-2 mt-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                  <Checkbox 
                    id="makeClassTeacher" 
                    checked={makeClassTeacher} 
                    onCheckedChange={(checked) => setMakeClassTeacher(checked as boolean)}
                  />
                  <label htmlFor="makeClassTeacher" className="text-xs font-medium leading-none text-indigo-700 cursor-pointer">
                    Make Class Teacher (Grants Attendance Access)
                  </label>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Subject *</Label>
              <Select value={formData.subjectId} onValueChange={(v) => setFormData({ ...formData, subjectId: v })}>
                <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200 w-full"><SelectValue placeholder="Select Subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.length === 0 ? (
                    <SelectItem value="_none" disabled>No subjects mapped to this class</SelectItem>
                  ) : subjects.map((sub: any) => (
                    <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-gray-400">Start Time</Label>
                <Input type="time" value={formData.startTime} className="h-12 rounded-lg border-gray-200 w-full" onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-gray-400">End Time</Label>
                <Input type="time" value={formData.endTime} className="h-12 rounded-lg border-gray-200 w-full" onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-gray-400">Room</Label>
                <Input placeholder="e.g. Lab-2" value={formData.room} className="h-12 rounded-lg border-gray-200 w-full" onChange={(e) => setFormData({ ...formData, room: e.target.value })} />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 flex justify-between items-center sm:justify-between w-full">
            {isEdit ? (
              <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete} className="h-10 rounded-xl font-bold bg-red-50 text-red-600 hover:bg-red-100 border-none">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl font-bold">Cancel</Button>
              <Button type="submit" loading={loading} className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold">
                
                {isEdit ? 'Save Changes' : 'Add Slot'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
