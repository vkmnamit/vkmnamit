import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { User, Mail, Phone, Calendar, Loader2 } from 'lucide-react';

interface EditStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  onSuccess: () => void;
}

export function EditStudentModal({ isOpen, onClose, student, onSuccess }: EditStudentModalProps) {
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (student) {
      setFormData({
        first_name: student.user?.first_name || '',
        last_name: student.user?.last_name || '',
        email: student.user?.email || '',
        phone: student.user?.phone || '',
        roll_number: student.roll_number || '',
        admission_number: student.admission_number || '',
        risk_level: student.risk_level || 'low',
        dateOfBirth: student.date_of_birth || '',
        gender: student.gender || '',
        bloodGroup: student.blood_group || '',
        fatherName: student.father_name || '',
        motherName: student.mother_name || '',
        guardianPhone: student.guardian_phone || '',
        guardianEmail: student.guardian_email || '',
        emergencyContact: student.emergency_contact || '',
        address: student.address || '',
        city: student.city || '',
        state: student.state || '',
        pincode: student.pincode || '',
        medicalConditions: student.medical_conditions || '',
        allergies: student.allergies || '',
        previousSchool: student.previous_school || '',
      });
    }
  }, [student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const tId = toast.loading('Synchronizing student data...');
      await api.updateStudent(student.id, {
        firstName: formData.first_name,
        lastName: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        rollNumber: formData.roll_number,
        admissionNumber: formData.admission_number,
        riskLevel: formData.risk_level,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        bloodGroup: formData.bloodGroup,
        fatherName: formData.fatherName,
        motherName: formData.motherName,
        guardianPhone: formData.guardianPhone,
        guardianEmail: formData.guardianEmail,
        emergencyContact: formData.emergencyContact,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        medicalConditions: formData.medicalConditions,
        allergies: formData.allergies,
        previousSchool: formData.previousSchool,
      });
      toast.success('Student profile updated across all nodes', { id: tId });
      // Refresh data first to ensure UI shows updated values, then close modal
      await onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update student profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900 tracking-tight">Modify Student Profile</DialogTitle>
          <p className="text-sm text-gray-500 font-medium mt-1">Update administrative and personal parameters for this student.</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8 py-4">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">First Name</Label>
                <Input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="rounded-xl bg-gray-50 border-gray-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Last Name</Label>
                <Input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="rounded-xl bg-gray-50 border-gray-100" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Date of Birth</Label>
                <Input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} className="rounded-xl bg-gray-50 border-gray-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Gender</Label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                  <SelectTrigger className="rounded-xl bg-gray-50 border-gray-100 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Blood Group</Label>
                <Select value={formData.bloodGroup || 'NA'} onValueChange={(v) => setFormData({ ...formData, bloodGroup: v })}>
                  <SelectTrigger className="rounded-xl bg-gray-50 border-gray-100 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="NA">NA (Not Available)</SelectItem>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Emergency Contact</Label>
                <Input value={formData.emergencyContact} onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="Emergency phone number" className="rounded-xl bg-gray-50 border-gray-100" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Academic & Institutional</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Admission No</Label>
                <Input value={formData.admission_number} onChange={(e) => setFormData({ ...formData, admission_number: e.target.value })} className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Roll No</Label>
                <Input value={formData.roll_number} onChange={(e) => setFormData({ ...formData, roll_number: e.target.value })} className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Risk Level</Label>
                <Select value={formData.risk_level} onValueChange={(val) => setFormData({ ...formData, risk_level: val })}>
                  <SelectTrigger className="rounded-xl border-gray-200 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="low">Low Risk</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Family Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Father's Name</Label>
                <Input value={formData.fatherName} onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })} className="rounded-xl border-gray-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Mother's Name</Label>
                <Input value={formData.motherName} onChange={(e) => setFormData({ ...formData, motherName: e.target.value })} className="rounded-xl border-gray-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Guardian Phone</Label>
                <Input value={formData.guardianPhone} onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })} className="rounded-xl border-gray-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Guardian Email</Label>
                <Input value={formData.guardianEmail} onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })} className="rounded-xl border-gray-100" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Residential Details</h3>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Full Address</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="rounded-xl border-gray-200" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">City</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">State</Label>
                <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Pincode</Label>
                <Input value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} className="rounded-xl border-gray-200" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-red-600 tracking-widest">Health & History</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Medical Conditions</Label>
                <Input value={formData.medicalConditions} onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })} placeholder="Any known conditions" className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Allergies</Label>
                <Input value={formData.allergies} onChange={(e) => setFormData({ ...formData, allergies: e.target.value })} placeholder="Any allergies" className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Previous School</Label>
                <Input value={formData.previousSchool} onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })} placeholder="Previous institution" className="rounded-xl border-gray-200" />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-gray-50">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl font-bold text-gray-500">Cancel</Button>
            <Button type="submit" loading={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold px-8 shadow-xl shadow-blue-600/20">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Update Student Profile'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
