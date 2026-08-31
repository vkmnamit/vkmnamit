import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, TrendingUp } from 'lucide-react';

interface PromoteStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  onSuccess?: () => void;
}

export function PromoteStudentModal({ isOpen, onClose, student, onSuccess }: PromoteStudentModalProps) {
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [availableSections, setAvailableSections] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      api.getClasses().then(data => {
        if (data && Array.isArray(data)) setClasses(data);
      });
    }
  }, [isOpen]);

  const handleClassChange = (val: string) => {
    setSelectedClass(val);
    setSelectedSection('');
    const cls = classes.find(c => c.id === val);
    setAvailableSections(cls?.sections || []);
  };

  const handlePromote = async () => {
    if (!selectedSection) {
      toast.error('Please select a section to promote to.');
      return;
    }
    setLoading(true);
    try {
      await api.updateStudent(student.id, { sectionId: selectedSection });
      toast.success(`${student?.user?.first_name || 'Student'} promoted successfully!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to promote student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Promote Student
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-gray-500">
            Promoting <strong>{student?.user?.first_name} {student?.user?.last_name}</strong>. Select the new class and section.
          </p>
          <div className="space-y-2">
            <Label>New Class</Label>
            <Select value={selectedClass} onValueChange={handleClassChange}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>New Section</Label>
            <Select value={selectedSection} onValueChange={setSelectedSection} disabled={!selectedClass}>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {availableSections.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} loading={loading}>Cancel</Button>
          <Button onClick={handlePromote} disabled={loading || !selectedSection} className="bg-green-600 hover:bg-green-700">
            
            Promote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
