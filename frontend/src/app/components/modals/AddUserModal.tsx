import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, UserPlus, Mail, Phone, BookOpen, Hash, Package } from 'lucide-react';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'student' | 'teacher' | 'parent' | 'admin';
  onSuccess?: () => void;
  initialData?: any; // Added for edit mode
}

export function AddUserModal({ isOpen, onClose, role, onSuccess, initialData }: AddUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [inventoryKits, setInventoryKits] = useState<any[]>([]);
  const [payrollStructures, setPayrollStructures] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>(initialData || {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    academicYearId: '',
    selectedKits: [],
    // Role specific
    sectionId: '',
    rollNumber: '',
    admissionNumber: '',
    gender: 'male',
    dateOfBirth: '',
    bloodGroup: 'NA',
    fatherName: '',
    motherName: '',
    guardianPhone: '',
    guardianEmail: '',
    emergencyContact: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    medicalConditions: '',
    allergies: '',
    previousSchool: '',

    // Teacher specific
    employeeId: '',
    designation: '',
    department: '',
    qualification: '',
    experienceYears: '',
    dateOfJoining: new Date().toISOString().split('T')[0],
    specialization: '',
    salary: '',
    isClassTeacher: false,
    teacherClassId: '',
    teacherSectionId: '',
    payroll_structure_id: '',

    // Import/Create options
    sendNotification: false,
    // Auto-generate fees when fee_start_month is the current month.
    // No manual checkbox needed — if start month = current month, fees are created.
    generateFeesConfirm: true,
    // Fee start month: defaults to current month (YYYY-MM). Admin can bump
    // it forward to skip the current month (e.g. "Don't charge August").
    feeStartMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  });

  const isEdit = !!initialData;

  // Build a list of upcoming months for the "Start charging from" selector.
  // Defaults to the current month; admin can pick a later month to skip
  // the current month's fee.
  const currentMonthValue = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonthSelected = formData.feeStartMonth === currentMonthValue;
  const feeStartMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    return { value, label, isCurrent: i === 0 };
  });



  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        setFormData({
          firstName: '', lastName: '', email: '', phone: '', academicYearId: '', selectedKits: [],
          sectionId: '', rollNumber: '', admissionNumber: '', gender: 'male',
          dateOfBirth: '', bloodGroup: 'NA', fatherName: '', motherName: '',
          guardianPhone: '', guardianEmail: '', emergencyContact: '', address: '',
          city: '', state: '', pincode: '', medicalConditions: '', allergies: '',
          previousSchool: '', employeeId: '', designation: '', department: '',
          qualification: '', experienceYears: '', dateOfJoining: new Date().toISOString().split('T')[0],
          specialization: '', salary: '',
          generateFeesConfirm: true,
          feeStartMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        });
      }
    }
    if (isOpen) {
      api.getAcademicYears().then(data => {
        if (data && Array.isArray(data)) {
          setAcademicYears(data);
          if (!isEdit && data.length > 0) {
            const currentYear = data.find(y => y.is_current || y.isCurrent) || data[0];
            setFormData((prev: any) => ({ ...prev, academicYearId: currentYear.id }));
          }
        }
      }).catch(err => console.error("Failed to fetch academic years:", err));
    }
    if (isOpen && (role === 'student' || role === 'teacher')) {
      api.getClasses().then(data => {
        if (data && Array.isArray(data)) {
          setClasses(data);
        }
      }).catch(err => console.error("Failed to fetch classes:", err));

      api.getFeeStructures().then(data => {
        if (data && Array.isArray(data)) {
          setFeeStructures(data);
          // ALWAYS auto-select all fee structures for new students so fees
          // are generated automatically at admission. The admin can uncheck
          // any they don't want. After the 5th, the "Generate initial fee
          // dues" confirmation checkbox still needs to be checked.
          if (!isEdit && role === 'student') {
            setFormData((prev: any) => ({
              ...prev,
              generateFees: data.map((s: any) => s.id)
            }));
          }
        }
      }).catch(err => console.error("Failed to fetch fee structures:", err));

      api.getInventoryKits().then(data => {
        if (data && Array.isArray(data)) {
          setInventoryKits(data);
        }
      }).catch(err => console.error("Failed to fetch inventory kits:", err));
    }
    if (isOpen && role === 'teacher') {
      api.getSubjects().then(data => {
        if (data && Array.isArray(data)) {
          setSubjects(data);
        }
      }).catch(err => console.error("Failed to fetch subjects:", err));

      api.getPayrollStructures().then(data => {
        if (data && Array.isArray(data)) {
          setPayrollStructures(data);
        }
      }).catch(err => console.error("Failed to fetch payroll structures:", err));
    }
  }, [isOpen, role, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!isEdit && role === 'student' && academicYears.length === 0) {
      toast.error('Please create an Academic Year first before registering students!');
      setLoading(false);
      return;
    }

    let finalFormData = { ...formData };

    // If enrolling after the 5th of the month, show warning if fees selected but not confirmed
    if (!isEdit && role === 'student') {
      const today = new Date().getDate();
      const isAfterFifth = today > 5;

      if (isAfterFifth && formData.generateFees && formData.generateFees.length > 0 && !formData.generateFeesConfirm) {
        toast.warning('Fees selected but not confirmed. Check "Generate initial fee dues" to create fee records.', {
          duration: 5000
        });
      }
    }

    try {
      if (isEdit) {
        if (role === 'student') await api.updateStudent(initialData.id, finalFormData);
        else if (role === 'teacher') await api.updateTeacher(initialData.id, finalFormData);
        toast.success(`${role.charAt(0).toUpperCase() + role.slice(1)} updated successfully!`);
      } else {
        let result: any = null;
        if (role === 'student') result = await api.createStudent(finalFormData);
        else if (role === 'teacher') await api.createTeacher(finalFormData);
        else if (role === 'admin') await api.createAdmin(finalFormData);
        toast.success(`${role.charAt(0).toUpperCase() + role.slice(1)} added successfully!`);
        // Show fee generation result
        if (role === 'student' && result) {
          if (result.fees_generated > 0) {
            toast.success(`✅ ${result.fees_generated} fee record(s) generated automatically.`, { duration: 6000 });
          } else if (finalFormData.generateFees?.length > 0) {
            toast.warning(`⚠️ Student added but no fees were generated. Details: ${result.fee_details?.join(', ') || 'Unknown reason'}`, { duration: 8000 });
          }
        }
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || `Failed to add ${role}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            {isEdit ? 'Edit' : 'Add New'} {role.charAt(0).toUpperCase() + role.slice(1)}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update profile information.' : 'Fill in the details below. Credentials will be auto-generated.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                required
                placeholder="Enter first name"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                required
                placeholder="Enter last name"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              required={role !== 'student'}
              placeholder={role === 'student' ? "Optional for students" : "Enter email address"}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              Phone Number
            </Label>
            <Input
              id="phone"
              placeholder="Enter phone number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          {role === 'student' && (
            <div className="space-y-6">
              {/* Academic Year — student only */}
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={formData.academicYearId} onValueChange={(v) => setFormData({ ...formData, academicYearId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Academic Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year: any) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name} {year.is_current || year.isCurrent ? '(Current)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-3">Institutional Identity</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rollNumber">Roll Number</Label>
                    <Input
                      id="rollNumber"
                      placeholder="Enter roll number"
                      value={formData.rollNumber}
                      onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section">Class Section</Label>
                    <Select value={formData.sectionId} onValueChange={(v) => setFormData({ ...formData, sectionId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select Section" /></SelectTrigger>
                      <SelectContent>
                        {classes.map(cls =>
                          (cls.sections || []).map((sec: any) => (
                            <SelectItem key={sec.id} value={sec.id}>
                              {cls.name} - {sec.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {!isEdit && (
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50 space-y-3">
                  <h3 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-2">Admission Wizard: Generate Initial Fees</h3>

                  {/* Start Charging From */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-emerald-800">Start Charging From</Label>
                      <Select value={formData.feeStartMonth || feeStartMonths[0].value} onValueChange={(v) => setFormData({ ...formData, feeStartMonth: v })}>
                        <SelectTrigger className="h-10 rounded-xl bg-white border-emerald-200">
                          <SelectValue placeholder="Select start month" />
                        </SelectTrigger>
                        <SelectContent>
                          {feeStartMonths.map(m => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label} {m.isCurrent ? '(Current)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end pb-2">
                      <p className="text-xs text-emerald-700/80 font-medium">
                        {formData.feeStartMonth && formData.feeStartMonth !== feeStartMonths[0].value
                          ? `⏭ Skipping fees for ${new Date(Date.now()).toLocaleString('default', { month: 'long', year: 'numeric' })} — first bill will be for ${new Date(new Date(formData.feeStartMonth + '-01')).toLocaleString('default', { month: 'long', year: 'numeric' })}.`
                          : `First fee bill will be for ${new Date(new Date((formData.feeStartMonth || feeStartMonths[0].value) + '-01')).toLocaleString('default', { month: 'long', year: 'numeric' })}.`}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {feeStructures.map((struct) => (
                      <label key={struct.id} className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
                          checked={formData.generateFees?.includes(struct.id) || false}
                          onChange={(e) => {
                            const current = formData.generateFees || [];
                            setFormData({
                              ...formData,
                              generateFees: e.target.checked
                                ? [...current, struct.id]
                                : current.filter((id: string) => id !== struct.id)
                            });
                          }}
                        />
                        {struct.name} <span className="text-gray-400 text-xs">(₹{struct.amount})</span>
                      </label>
                    ))}
                    {inventoryKits.map((kit) => {
                      const kitPrice = kit.inventory_kit_items?.reduce((sum: number, i: any) => sum + ((i.school_inventory?.selling_price || i.school_inventory?.unit_price || 0) * i.quantity), 0) || 0;
                      return (
                        <label key={kit.id} className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
                            checked={formData.selectedKits?.includes(kit.id) || false}
                            onChange={(e) => {
                              const current = formData.selectedKits || [];
                              setFormData({
                                ...formData,
                                selectedKits: e.target.checked
                                  ? [...current, kit.id]
                                  : current.filter((id: string) => id !== kit.id)
                              });
                            }}
                          />
                          <Package className="w-4 h-4 text-emerald-600/70" />
                          {kit.name} <span className="text-gray-400 text-xs">(Kit{kitPrice > 0 ? ` - ₹${kitPrice}` : ''})</span>
                        </label>
                      );
                    })}
                    {feeStructures.length === 0 && inventoryKits.length === 0 && (
                      <p className="text-xs text-gray-500 col-span-2">No fee structures or kits defined by admin yet.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bloodGroup">Blood Group</Label>
                  <Select value={formData.bloodGroup} onValueChange={(v) => setFormData({ ...formData, bloodGroup: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NA">NA (Not Available)</SelectItem>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Family Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fatherName">Father's Name</Label>
                    <Input
                      id="fatherName"
                      placeholder="Full Name"
                      value={formData.fatherName}
                      onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="motherName">Mother's Name</Label>
                    <Input
                      id="motherName"
                      placeholder="Full Name"
                      value={formData.motherName}
                      onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guardianPhone">Guardian Phone</Label>
                    <Input
                      id="guardianPhone"
                      placeholder="For SMS Alerts"
                      value={formData.guardianPhone}
                      onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guardianEmail">Guardian Email</Label>
                    <Input
                      id="guardianEmail"
                      type="email"
                      placeholder="For Fee Receipts"
                      value={formData.guardianEmail}
                      onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Residential Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="address">Full Address</Label>
                  <Input
                    id="address"
                    placeholder="Enter street address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pincode">Pincode</Label>
                    <Input id="pincode" value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="bg-red-50/50 p-4 rounded-xl border border-red-100/50">
                <h3 className="text-[10px] font-black uppercase text-red-600 tracking-widest mb-3">Health & Safety</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContact">Emergency Contact</Label>
                    <Input
                      id="emergencyContact"
                      placeholder="Emergency phone number"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="previousSchool">Previous School</Label>
                    <Input
                      id="previousSchool"
                      placeholder="Name of previous institution"
                      value={formData.previousSchool}
                      onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medicalConditions">Medical Conditions</Label>
                    <Input
                      id="medicalConditions"
                      placeholder="Any known conditions"
                      value={formData.medicalConditions}
                      onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Input
                      id="allergies"
                      placeholder="Any known allergies"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {!isEdit && (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50 mt-4 space-y-3">
                  <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-1">Enrollment Actions</h3>

                  {isCurrentMonthSelected && formData.generateFees && formData.generateFees.length > 0 && (
                    <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                      <p className="text-xs text-green-800 font-medium">
                        ✓ {formData.generateFees.length} fee structure(s) will be auto-generated for {feeStartMonths.find(m => m.value === formData.feeStartMonth)?.label}
                      </p>
                    </div>
                  )}

                  {!isCurrentMonthSelected && formData.generateFees && formData.generateFees.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-2">
                      <p className="text-xs text-amber-800 font-medium">
                        ⚠️ Fees will NOT be auto-generated (start month is not current)
                      </p>
                      <p className="text-[10px] text-amber-600">
                        First bill will be for {feeStartMonths.find(m => m.value === formData.feeStartMonth)?.label}. Admin must generate fees manually from the Fees page.
                      </p>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.generateFeesConfirm}
                      onChange={(e) => setFormData({ ...formData, generateFeesConfirm: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    Generate initial fee dues for the current month
                  </label>

                  {(!formData.generateFees || formData.generateFees.length === 0) && (
                    <p className="text-xs text-gray-500 italic">
                      No fees selected. Select fee structures above to generate dues.
                    </p>
                  )}

                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.sendNotification}
                      onChange={(e) => setFormData({ ...formData, sendNotification: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    Send Email & WhatsApp enrollment credentials to parents
                  </label>
                </div>
              )}
            </div>
          )}

          {role === 'teacher' && (
            <div className="space-y-6">
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">
                <h3 className="text-[10px] font-black uppercase text-amber-600 tracking-widest mb-3">Employment Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div className="space-y-2">
                    <Label>Staff Role (Salary Structure)</Label>
                    <Select onValueChange={(v) => {
                      const struct = payrollStructures.find(s => s.id === v);
                      if (struct) {
                        setFormData({
                          ...formData,
                          payroll_structure_id: struct.id,
                          salary: struct.amount,
                          designation: struct.name
                        });
                      }
                    }}>
                      <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200">
                        <SelectValue placeholder="Select Staff Role" />
                      </SelectTrigger>
                      <SelectContent>
                        {payrollStructures.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name} (₹{s.amount})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="designation">Designation</Label>
                    <Input id="designation" placeholder="e.g. Senior Teacher" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Select value={formData.department} onValueChange={(v) => setFormData({ ...formData, department: v })}>
                      <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200"><SelectValue placeholder="Select Dept" /></SelectTrigger>
                      <SelectContent>
                        {subjects.length > 0 ? (
                          subjects.map(sub => (
                            <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                          ))
                        ) : (
                          ['Mathematics', 'Science', 'English', 'Social Studies', 'Physical Education', 'Arts'].map(dept => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfJoining">Date of Joining</Label>
                    <Input id="dateOfJoining" type="date" className="h-12 rounded-xl bg-gray-50 border-gray-200" value={formData.dateOfJoining} onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qualification">Qualification</Label>
                  <Input id="qualification" placeholder="e.g. M.Sc, B.Ed" value={formData.qualification} onChange={(e) => setFormData({ ...formData, qualification: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experienceYears">Experience (Years)</Label>
                  <Input id="experienceYears" type="number" value={formData.experienceYears} onChange={(e) => setFormData({ ...formData, experienceYears: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialization">Specialization</Label>
                  <Input id="specialization" placeholder="e.g. Quantum Physics" value={formData.specialization} onChange={(e) => setFormData({ ...formData, specialization: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary">Monthly Salary (₹)</Label>
                  <Input id="salary" type="number" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth (Optional)</Label>
                <Input id="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} />
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Class Teacher Assignment</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Will this teacher be managing a specific class & section?</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={formData.isClassTeacher}
                      onChange={(e) => setFormData({ ...formData, isClassTeacher: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {formData.isClassTeacher && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-200 border-dashed">
                    <div className="space-y-2">
                      <Label>Select Class</Label>
                      <Select value={formData.teacherClassId} onValueChange={(v) => setFormData({ ...formData, teacherClassId: v, teacherSectionId: '' })}>
                        <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                        <SelectContent>
                          {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Select Section</Label>
                      <Select
                        value={formData.teacherSectionId}
                        onValueChange={(v) => setFormData({ ...formData, teacherSectionId: v })}
                        disabled={!formData.teacherClassId}
                      >
                        <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                        <SelectContent>
                          {formData.teacherClassId && classes.find(c => c.id === formData.teacherClassId)?.sections?.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {role === 'admin' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 italic">Admin accounts have global access to institutional data. Credentials will be auto-generated based on the email provided.</p>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading} className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="w-4 h-4 mr-2" />
              {isEdit ? 'Update Profile' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
