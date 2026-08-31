import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

interface EditTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: any;
  onSuccess: () => void;
}

export function EditTeacherModal({ isOpen, onClose, teacher, onSuccess }: EditTeacherModalProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    designation: '',
    salary: '',
    specialization: '',
    employee_id: '',
    qualification: '',
    experienceYears: '',
    dateOfJoining: '',
    isClassTeacher: false,
    sectionId: ''
  });
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (teacher && isOpen) {
      setFormData({
        firstName: teacher.user?.first_name || teacher.profile?.first_name || '',
        lastName: teacher.user?.last_name || teacher.profile?.last_name || '',
        email: teacher.user?.email || teacher.profile?.email || '',
        phone: teacher.user?.phone || teacher.profile?.phone || '',
        department: teacher.department || teacher.professional?.department || '',
        designation: teacher.designation || teacher.professional?.designation || '',
        salary: teacher.salary || teacher.compensation?.base_salary || '',
        specialization: teacher.specialization || teacher.professional?.specialization || '',
        employee_id: teacher.employee_id || teacher.professional?.employee_id || '',
        qualification: teacher.qualification || teacher.professional?.qualification || '',
        experienceYears: teacher.experience_years || teacher.professional?.experience_years || '',
        dateOfJoining: teacher.date_of_joining || teacher.professional?.date_of_joining || '',
        isClassTeacher: teacher.is_class_teacher || teacher.role?.is_class_teacher || false,
        sectionId: teacher.section_id || ''
      });
      fetchClasses();
    }
  }, [teacher, isOpen]);

  const fetchClasses = async () => {
    try {
      const data = await api.getClasses();
      const allSections = data.flatMap((c: any) => c.sections || []);
      setSections(allSections);
    } catch (err) {
      console.error('Failed to fetch classes');
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await api.updateTeacher(teacher.id, formData);
      toast.success('Teacher profile updated successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900 tracking-tight">Modify Teacher Profile</DialogTitle>
          <p className="text-sm text-gray-500 font-medium mt-1">Update all faculty data and assignments.</p>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">First Name</Label>
                <Input value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Last Name</Label>
                <Input value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Email</Label>
                <Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
            </div>
          </div>

          {/* Employment Details */}
          <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-4">
            <h3 className="text-[10px] font-black uppercase text-amber-700 tracking-widest">Employment Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Employee ID</Label>
                <Input value={formData.employee_id} onChange={(e) => setFormData({...formData, employee_id: e.target.value})} className="rounded-xl bg-white border-amber-200 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Designation</Label>
                <Input value={formData.designation} onChange={(e) => setFormData({...formData, designation: e.target.value})} placeholder="e.g. Senior HOD" className="rounded-xl bg-white border-amber-200 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Department</Label>
                <Select value={formData.department} onValueChange={(v) => setFormData({...formData, department: v})}>
                  <SelectTrigger className="rounded-xl bg-white border-amber-200 h-11"><SelectValue placeholder="Select Dept" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science', 'Physical Education', 'Arts', 'Commerce'].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Date of Joining</Label>
                <Input type="date" value={formData.dateOfJoining} onChange={(e) => setFormData({...formData, dateOfJoining: e.target.value})} className="rounded-xl bg-white border-amber-200 h-11" />
              </div>
            </div>
          </div>

          {/* Qualifications */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Qualifications & Experience</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Qualification</Label>
                <Input value={formData.qualification} onChange={(e) => setFormData({...formData, qualification: e.target.value})} placeholder="e.g. M.Sc, B.Ed" className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Experience (Years)</Label>
                <Input type="number" value={formData.experienceYears} onChange={(e) => setFormData({...formData, experienceYears: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Specialization</Label>
                <Input value={formData.specialization} onChange={(e) => setFormData({...formData, specialization: e.target.value})} placeholder="e.g. Quantum Physics" className="rounded-xl bg-gray-50 border-gray-100 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Monthly Salary (₹)</Label>
                <Input type="number" value={formData.salary} onChange={(e) => setFormData({...formData, salary: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11 font-bold" />
              </div>
            </div>
          </div>

          {/* Class Teacher Assignment */}
          <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-700 tracking-widest">Class Teacher Assignment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Assigned Section</Label>
                <Select value={formData.sectionId} onValueChange={(val) => setFormData({...formData, sectionId: val})}>
                  <SelectTrigger className="rounded-xl bg-white border-blue-200 h-11"><SelectValue placeholder="Select Section" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.class?.name} - {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-3 pt-8">
                <Checkbox 
                  id="classTeacher" 
                  checked={formData.isClassTeacher} 
                  onCheckedChange={(val) => setFormData({...formData, isClassTeacher: !!val})}
                  className="w-5 h-5 rounded-lg border-blue-300 data-[state=checked]:bg-blue-600"
                />
                <Label htmlFor="classTeacher" className="text-sm font-bold text-gray-700 cursor-pointer">Set as Class Teacher</Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-gray-50">
          <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold text-gray-500">Discard</Button>
          <Button onClick={handleUpdate} loading={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold px-8 shadow-xl shadow-blue-600/20">
            'Update Teacher'
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
