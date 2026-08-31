import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Search, Plus, Download, Filter, Mail, Phone, X, Users, Upload, ChevronLeft, ChevronRight, Trash2, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Link } from 'react-router';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { AddUserModal } from '../../components/modals/AddUserModal';
import { PromoteStudentModal } from '../../components/modals/PromoteStudentModal';
import { useAuth } from '../../context/AuthContext';
import { ClassSectionFilter } from '../../components/ClassSectionFilter';
import { StudentSortFilter, sortStudentsArray } from '../../components/StudentSortFilter';
import { phoneMatches, textIncludes } from '../../../lib/search';
import { useSearchParams } from 'react-router';

export function StudentsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const academicYearId = searchParams.get('academic_year_id');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState(academicYearId || 'all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all'); // New decision filter
  const [selectedAttendanceFilter, setSelectedAttendanceFilter] = useState('all'); // New filter
  const [selectedGender, setSelectedGender] = useState('all');
  const [admissionDateFrom, setAdmissionDateFrom] = useState('');
  const [admissionDateTo, setAdmissionDateTo] = useState('');
  const [studentSort, setStudentSort] = useState('roll_asc');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [promotingStudent, setPromotingStudent] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importGenerateFees, setImportGenerateFees] = useState(true);
  const [importSendNotif, setImportSendNotif] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFeeMonth, setImportFeeMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM format
  const importMonthOptions = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return {
      value: d.toISOString().substring(0, 7),
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  });
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; studentId: string; name: string }>({ open: false, studentId: '', name: '' });
  const [isDetailedView, setIsDetailedView] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const itemsPerPage = 10;
  const latestStudentRequest = useRef(0);
  const hasLoadedStudents = useRef(false);

  const currentYearObj = academicYears.find((y: any) => y.is_current);
  const isPastYearView = selectedAcademicYear !== 'all' && !!currentYearObj && selectedAcademicYear !== currentYearObj.id;

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    setSelectedAcademicYear(academicYearId || 'all');
  }, [academicYearId]);

  useEffect(() => {
    const timer = setTimeout(fetchStudents, searchTerm ? 350 : 0);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedClass, selectedSection, selectedAcademicYear, selectedStatus, selectedRisk, selectedAttendanceFilter, selectedGender, admissionDateFrom, admissionDateTo, user?.role]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClass, selectedSection, selectedAcademicYear, selectedStatus, selectedRisk, selectedAttendanceFilter, selectedGender, admissionDateFrom, admissionDateTo]);

  const fetchMetadata = async () => {
    try {
      const [cls, years] = await Promise.all([
        api.getClasses(),
        api.getAcademicYears(),
      ]);
      setClasses(cls || []);
      setAcademicYears(years || []);
    } catch (err) { /* silent */ }
  };

  const fetchStudents = async () => {
    const requestId = ++latestStudentRequest.current;
    setLoading(true);
    try {
      const params: any = { limit: '9999' };
      if (selectedSection !== 'all') params.section_id = selectedSection;
      else if (selectedClass !== 'all') params.class_id = selectedClass;
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedRisk !== 'all') params.risk_level = selectedRisk;
      if (selectedAttendanceFilter === 'low') params.attendance_low = 'true';
      if (selectedAcademicYear !== 'all') params.academic_year_id = selectedAcademicYear;
      if (searchTerm) params.search = searchTerm;

      if (user?.role === 'teacher') {
        const data = await api.getTeacherStudents();
        if (requestId === latestStudentRequest.current) setStudents(data || []);
      } else if (user?.role === 'parent') {
        const children = await api.getParentChildren();
        if (requestId === latestStudentRequest.current) setStudents((children || []).map((c: any) => c.student).filter(Boolean));
      } else {
        // For a PAST academic year, the class roster is rebuilt from promotion history
        // so the old class (e.g. Class 9 in 2026-27) still lists every student who was there.
        if (isPastYearView && selectedAcademicYear !== 'all') {
          const data = await api.getHistoricalStudents(selectedAcademicYear, selectedClass !== 'all' ? selectedClass : undefined);
          if (requestId === latestStudentRequest.current) setStudents(data.students || data || []);
        } else {
          const data = await api.getStudents(params);
          if (requestId === latestStudentRequest.current) setStudents(data.students || data || []);
        }
      }
    } catch (err) {
      if (requestId !== latestStudentRequest.current) return;
      console.error('Failed to fetch students');
      toast.error('Failed to load students');
    } finally {
      if (requestId === latestStudentRequest.current) {
        hasLoadedStudents.current = true;
        setLoading(false);
      }
    }
  };

  const handleDeleteStudent = async (studentId: string, name: string) => {
    setDeleteConfirm({ open: true, studentId, name });
  };

  const confirmDeleteStudent = async () => {
    const { studentId } = deleteConfirm;
    setDeleteConfirm(prev => ({ ...prev, open: false }));

    try {
      await api.deleteStudent(studentId);
      toast.success('Student deleted successfully');
      fetchStudents();
    } catch (err) {
      toast.error('Failed to delete student');
    }
  };

  const handlePromoteStudent = (student: any) => {
    setPromotingStudent(student);
    setIsPromoteModalOpen(true);
  };

  const openEditModal = (student: any) => {
    setEditingStudent({
      ...student,
      firstName: student.user?.first_name || '',
      lastName: student.user?.last_name || '',
      email: student.user?.email || '',
      phone: student.user?.phone || '',
      sectionId: student.section_id || '',
      rollNumber: student.roll_number || '',
      admissionNumber: student.admission_number || '',
      gender: student.gender || 'male',
      dateOfBirth: student.dob || student.date_of_birth || '',
      bloodGroup: student.blood_group || 'O+',
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
    setIsAddModalOpen(true);
  };


  const handleTemplateDownload = () => {
    const template = [
      {
        'Name': 'Rahul Kumar',
        'Phone': '9876543210',
        'Class Name': 'Class 10',
        'Section Name': 'A',
        'Father Name': 'Suresh Kumar',
        'Address': 'Delhi',
        'Transport Route': 'North Route',
        'Transport Fee Amount': '350'
      },
      {
        'Name': 'Priya Singh',
        'Phone': '9876543211',
        'Class Name': 'LKG',
        'Section Name': 'B',
        'Father Name': 'Amit Singh',
        'Address': 'Mumbai',
        'Transport Route': 'North Route',
        'Transport Fee Amount': '350'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students Template');
    XLSX.writeFile(wb, 'student_import_template.xlsx');
    toast.success('Student import template downloaded!');
  };

  const handleTransportTemplateDownload = () => {
    const template = [
      {
        'Name': 'Rahul Kumar',
        'Phone': '9876543210',
        'Class Name': 'Class 10',
        'Section Name': 'A',
        'Father Name': 'Suresh Kumar',
        'Address': 'Delhi',
        'Transport Route': 'North Route',
        'Transport Fee Amount': '350'
      },
      {
        'Name': 'Priya Singh',
        'Phone': '9876543211',
        'Class Name': 'LKG',
        'Section Name': 'B',
        'Father Name': 'Amit Singh',
        'Address': 'Mumbai',
        'Transport Route': 'South Route',
        'Transport Fee Amount': '400'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transport Bulk Template');
    XLSX.writeFile(wb, 'transport_bulk_template.xlsx');
    toast.success('Transport bulk upload template downloaded!');
  };

  // ─── Fuzzy match a raw string from Excel to a DB name ──────────
  const fuzzyMatch = (raw: string, candidates: string[]): string | null => {
    if (!raw) return null;
    const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const rawNorm = norm(raw);
    // 1. Exact match (normalized)
    const exact = candidates.find(c => norm(c) === rawNorm);
    if (exact) return exact;
    // 2. DB name contains raw (e.g. 'Class 10' contains '10')
    const contains = candidates.find(c => norm(c).includes(rawNorm) || rawNorm.includes(norm(c)));
    if (contains) return contains;
    // 3. Just the digits match
    const rawDigits = rawNorm.replace(/\D/g, '');
    if (rawDigits) {
      const digitMatch = candidates.find(c => norm(c).replace(/\D/g, '') === rawDigits);
      if (digitMatch) return digitMatch;
    }
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          toast.error('The file is empty');
          return;
        }

        // Map human-readable Excel columns to backend API keys using ultra-flexible normalization
        const mappedData = rawData.map((row: any) => {
          // Create a normalized row where keys are lowercase, no spaces/special chars
          const nRow: Record<string, any> = {};
          Object.keys(row).forEach(k => {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            nRow[cleanKey] = row[k];
          });

          const fullName = String(nRow.name || nRow.studentname || nRow.fullname || nRow.student || '').trim();
          const nameParts = fullName.split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          return {
            firstName,
            lastName,
            email: nRow.email || nRow.emailaddress || nRow.studentemail,
            phone: String(nRow.phone || nRow.phoneno || nRow.phonenumber || nRow.mobile || nRow.contact || nRow.contactno || ''),
            className: nRow.class || nRow.classname || nRow.grade || nRow.standard || nRow.existingclassname,
            sectionName: nRow.section || nRow.sectionname || nRow.division || nRow.existingsectionname,
            academicYear: nRow.academicyear || nRow.year || nRow.session || nRow.existingacademicyear,
            gender: nRow.gender || nRow.sex,
            bloodGroup: nRow.bloodgroup || nRow.bg,
            dateOfBirth: nRow.dob || nRow.dateofbirth || nRow.birthdate,
            fatherName: nRow.fathername || nRow.fathersname || nRow.father,
            motherName: nRow.mothername || nRow.mothersname || nRow.mother,
            guardianPhone: String(nRow.guardianphone || nRow.parentphone || nRow.fatherphone || nRow.motherphone || nRow.guardiancontact || ''),
            transportRouteName: String(nRow.transportroute || nRow.routename || nRow.route || nRow.transportroute || '').trim(),
            transportFeeAmount: nRow.transportfeeamount || nRow.routefee || nRow.transportfee || nRow.routefeeamount || nRow.amount || nRow.feeamount || nRow.fee || nRow.totalamount,
            guardianEmail: nRow.guardianemail || nRow.parentemail || nRow.fatheremail || nRow.motheremail,
            emergencyContact: String(nRow.emergencycontact || nRow.emergencyphone || nRow.emergency || ''),
            admissionNumber: nRow.admissionno || nRow.admissionnumber || nRow.grno,
            rollNumber: nRow.rollnumber || nRow.rollno || nRow.roll,
            address: nRow.address || nRow.addressline || nRow.residentialaddress || nRow.fulladdress,
            city: nRow.city || nRow.town,
            state: nRow.state || nRow.province,
            pincode: nRow.pincode || nRow.pin || nRow.zipcode || nRow.postalcode,
            previousSchool: nRow.previousschool || nRow.lastschool || nRow.oldschool,
            medicalConditions: nRow.medicalconditions || nRow.medical || nRow.medicalhistory,
            allergies: nRow.allergies || nRow.allergy,
          };
        });

        // ── Fuzzy-resolve class & section names against DB ──────
        const today = new Date().getDate();
        const defaultGenerateFees = today <= 5; // auto-true before 5th, else default to ask in modal

        // Build a flat list of all DB classes + their sections
        const allClasses = classes; // already loaded via fetchMetadata

        const preview = mappedData.map((student: any, idx: number) => {
          const rawClass = String(student.className || '').trim();
          const rawSection = String(student.sectionName || '').trim();

          const classNames = allClasses.map((c: any) => c.name);
          const matchedClassName = fuzzyMatch(rawClass, classNames) || rawClass;

          // Find the matched class object
          const matchedClassObj = allClasses.find((c: any) => c.name === matchedClassName);
          const sectionNames = (matchedClassObj?.sections || []).map((s: any) => s.name);
          const matchedSectionName = fuzzyMatch(rawSection, sectionNames) || rawSection;

          const isClassMatched = !!matchedClassObj;
          const isSectionMatched = sectionNames.includes(matchedSectionName);

          return {
            ...student,
            rowIndex: idx,
            rawClass,
            rawSection,
            className: matchedClassName,
            sectionName: matchedSectionName,
            isClassMatched,
            isSectionMatched,
          };
        });

        setImportPreview(preview);
        setImportGenerateFees(defaultGenerateFees);
        setImportSendNotif(false);
        setImportPreviewOpen(true);
      } catch (err: any) {
        console.error('Import failed', err);
        toast.error(err?.message || 'Failed to import students. Please check the file format.');
      } finally {
        e.target.value = ''; // Reset input to allow re-uploading the same file
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Confirm and fire the actual import after preview ─────────────
  const handleConfirmImport = async () => {
    setImportLoading(true);
    const toastId = toast.loading(`Importing ${importPreview.length} students...`);
    try {
      const response = await api.bulkCreateStudents(importPreview, importGenerateFees, importSendNotif);
      if (response && response.results) {
        const successCount = response.results.filter((r: any) => r.success === true).length;
        const failedRows = response.results.filter((r: any) => r.success !== true);
        const failCount = failedRows.length;
        if (failCount > 0) {
          const firstError = failedRows[0]?.error || 'Check console for details.';
          toast.error(`${successCount} imported, ${failCount} failed. ${firstError}`, { id: toastId, duration: 10000 });
        } else {
          toast.success(`✅ ${successCount} students imported successfully!`, { id: toastId });
        }
      } else {
        toast.success('Students imported successfully!', { id: toastId });
      }
      setImportPreviewOpen(false);
      setImportPreview([]);
      fetchStudents();
    } catch (err: any) {
      toast.error(err?.message || 'Import failed', { id: toastId });
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const filteredStudents = (students || []).filter((student: any) => {
    const search = searchTerm.trim();
    if (search) {
      const name = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`;
      const matches =
        textIncludes(name, search) ||
        String(student.roll_number ?? '').includes(search) ||
        textIncludes(student.admission_number, search) ||
        textIncludes(student.user?.email, search) ||
        phoneMatches(student.user?.phone, search) ||
        phoneMatches(student.guardian_phone, search) ||
        textIncludes(student.father_name, search) ||
        textIncludes(student.mother_name, search);
      if (!matches) return false;
    }
    const matchesClass = selectedClass === 'all' || student.section?.class?.id === selectedClass;
    const matchesSection = selectedSection === 'all' || student.section?.id === selectedSection;
    const matchesAcademicYear = selectedAcademicYear === 'all' || student.academic_year_id === selectedAcademicYear;
    const matchesStatus = selectedStatus === 'all' || (student.is_active ? 'active' : 'inactive') === selectedStatus;
    const matchesRisk = selectedRisk === 'all' || student.risk_level === selectedRisk;
    const matchesAttendance = selectedAttendanceFilter !== 'low' || Number(student.attendance_percentage || 0) < 75;
    const matchesGender = selectedGender === 'all' || String(student.gender || '').toLowerCase() === selectedGender;
    const admissionDate = student.admission_date || student.created_at?.slice(0, 10) || '';
    const matchesFromDate = !admissionDateFrom || admissionDate >= admissionDateFrom;
    const matchesToDate = !admissionDateTo || admissionDate <= admissionDateTo;
    return matchesClass && matchesSection && matchesAcademicYear && matchesStatus && matchesRisk && matchesAttendance && matchesGender && matchesFromDate && matchesToDate;
  });

  const sortedStudents = sortStudentsArray(filteredStudents, studentSort);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedClass('all');
    setSelectedSection('all');
    setSelectedAcademicYear('all');
    setSelectedStatus('all');
    setSelectedRisk('all');
    setSelectedAttendanceFilter('all');
    setSelectedGender('all');
    setAdmissionDateFrom('');
    setAdmissionDateTo('');
    setCurrentPage(1);
  };

  const hasActiveFilters = selectedClass !== 'all' || selectedSection !== 'all' || selectedAcademicYear !== 'all' ||
    selectedStatus !== 'all' || selectedRisk !== 'all' || selectedAttendanceFilter !== 'all' || selectedGender !== 'all' ||
    admissionDateFrom !== '' || admissionDateTo !== '' || searchTerm !== '';

  const avgAttendance = students?.length
    ? Math.round(students.reduce((acc: number, s: any) => acc + (s.attendance_percentage || 0), 0) / students.length)
    : 0;

  const stats = [
    { label: 'Total Students', value: students.length.toString(), color: 'bg-blue-600' },
    { label: 'Average Attendance', value: `${avgAttendance}%`, color: 'bg-green-600' },
    { label: 'Low Attendance', value: (students || []).filter((s: any) => (s.attendance_percentage || 0) < 75).length.toString(), color: 'bg-amber-600', onClick: () => { setSelectedAttendanceFilter('low'); setTimeout(() => document.querySelector('.grid')?.scrollIntoView({ behavior: 'smooth' }), 100); } },
    { label: 'High Risk', value: (students || []).filter((s: any) => s.risk_level === 'high').length.toString(), color: 'bg-red-600', onClick: () => { setSelectedRisk('high'); setTimeout(() => document.querySelector('.grid')?.scrollIntoView({ behavior: 'smooth' }), 100); } },
  ];

  if (loading && !hasLoadedStudents.current) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Student Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage student profiles, attendance, and performance</p>
        </div>
        <div className="flex flex-col w-full sm:w-auto sm:flex-row items-stretch sm:items-center gap-2 mt-4 sm:mt-0">
          {user?.role === 'admin' && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto rounded-xl h-10 font-semibold text-gray-700 bg-white border-gray-200 justify-center" onClick={handleTemplateDownload}>
                <Download className="w-4 h-4 mr-2" />
                Student Template
              </Button>
              <Button variant="outline" className="w-full sm:w-auto rounded-xl h-10 font-semibold text-gray-700 bg-white border-gray-200 justify-center" onClick={handleTransportTemplateDownload}>
                <Download className="w-4 h-4 mr-2" />
                Transport Template
              </Button>
              <div className="relative w-full sm:w-auto">
                <input
                  type="file"
                  id="student-import"
                  className="hidden"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                />
                <Button variant="outline" className="w-full sm:w-auto justify-center border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold h-10 rounded-xl" onClick={() => document.getElementById('student-import')?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Bulk Import
                </Button>
              </div>
            </div>
          )}
          {user?.role === 'admin' && (
            <Button className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 font-bold h-10 rounded-xl shadow-lg shadow-blue-600/20" onClick={() => { setEditingStudent(null); setIsAddModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Student
            </Button>
          )}
          <Button
            variant="outline"
            className={`rounded-xl h-10 font-bold px-4 border-gray-200 transition-all ${isDetailedView ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-white text-gray-700'}`}
            onClick={() => setIsDetailedView(!isDetailedView)}
          >
            {isDetailedView ? 'Standard View' : 'Detailed Mode'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800">
        <p className="font-semibold">How the bulk upload works</p>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-blue-700">
          <li>Download the Excel template, fill the rows, and upload the file.</li>
          <li>For transport uploads, the system reads the route name and transport fee amount from the sheet.</li>
          <li>If there is no route-name column and only an amount is present, it will create or reuse a transport route for that amount and assign future students with the same amount to that route.</li>
          <li>The import preview helps you review class and section matching before the final import.</li>
        </ul>
      </div>

      <AddUserModal
        key={editingStudent ? `edit-${editingStudent.id}` : 'add-new'}
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingStudent(null); }}
        role="student"
        onSuccess={fetchStudents}
        initialData={editingStudent}
      />

      <PromoteStudentModal
        isOpen={isPromoteModalOpen}
        onClose={() => { setIsPromoteModalOpen(false); setPromotingStudent(null); }}
        student={promotingStudent}
        onSuccess={fetchStudents}
      />

      {/* Import Preview Modal */}
      <Dialog open={importPreviewOpen} onOpenChange={(open) => { if (!importLoading) setImportPreviewOpen(open); }}>
        <DialogContent className="w-[100vw] max-w-[100vw] h-[100dvh] sm:h-auto sm:w-auto sm:max-w-4xl max-h-[100dvh] sm:max-h-[85vh] overflow-y-auto rounded-none sm:rounded-2xl p-4 sm:p-6 border-0 sm:border">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">
              Import Preview — {importPreview.length} Students
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Review the class/section matching below. <span className="text-amber-600 font-bold">Yellow rows</span> mean the class or section could not be matched exactly — please fix them before importing.
            </p>
          </DialogHeader>

          {/* Summary badges */}
          <div className="flex gap-3 flex-wrap mb-2">
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {importPreview.filter(r => r.isClassMatched && r.isSectionMatched).length} Fully Matched
            </span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1 rounded-full">
              <AlertTriangle className="w-3.5 h-3.5" />
              {importPreview.filter(r => !r.isClassMatched || !r.isSectionMatched).length} Need Attention
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-[10px] font-bold uppercase text-gray-400">#</th>
                  <th className="py-3 px-4 text-left text-[10px] font-bold uppercase text-gray-400">Student Name</th>
                  <th className="py-3 px-4 text-left text-[10px] font-bold uppercase text-gray-400">In Excel (Class)</th>
                  <th className="py-3 px-4 text-left text-[10px] font-bold uppercase text-gray-400">Matched To</th>
                  <th className="py-3 px-4 text-left text-[10px] font-bold uppercase text-gray-400">In Excel (Sec)</th>
                  <th className="py-3 px-4 text-left text-[10px] font-bold uppercase text-gray-400">Matched To</th>
                  <th className="py-3 px-4 text-center text-[10px] font-bold uppercase text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {importPreview.map((row, i) => {
                  const hasIssue = !row.isClassMatched || !row.isSectionMatched;
                  const classOptions = classes.map((c: any) => c.name);
                  const matchedClassObj = classes.find((c: any) => c.name === row.className);
                  const sectionOptions = (matchedClassObj?.sections || []).map((s: any) => s.name);
                  return (
                    <tr key={i} className={hasIssue ? 'bg-amber-50/60' : ''}>
                      <td className="py-2 px-4 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 px-4 font-semibold text-gray-800 text-xs">{row.firstName} {row.lastName}</td>
                      <td className="py-2 px-4 text-gray-500 text-xs font-mono">{row.rawClass || '—'}</td>
                      <td className="py-2 px-4">
                        <select
                          className={`text-xs border rounded px-2 py-1 font-semibold ${row.isClassMatched ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                          value={row.className}
                          onChange={e => {
                            const updated = [...importPreview];
                            const newClass = e.target.value;
                            const newClassObj = classes.find((c: any) => c.name === newClass);
                            const newSections = (newClassObj?.sections || []).map((s: any) => s.name);
                            updated[i] = { ...updated[i], className: newClass, isClassMatched: !!newClassObj, sectionName: newSections[0] || updated[i].sectionName, isSectionMatched: newSections.includes(updated[i].sectionName) };
                            setImportPreview(updated);
                          }}
                        >
                          {classOptions.map((cn: string) => <option key={cn} value={cn}>{cn}</option>)}
                          {!row.isClassMatched && <option value={row.className}>{row.className} (unmatched)</option>}
                        </select>
                      </td>
                      <td className="py-2 px-4 text-gray-500 text-xs font-mono">{row.rawSection || '—'}</td>
                      <td className="py-2 px-4">
                        <select
                          className={`text-xs border rounded px-2 py-1 font-semibold ${row.isSectionMatched ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                          value={row.sectionName}
                          onChange={e => {
                            const updated = [...importPreview];
                            const newSec = e.target.value;
                            updated[i] = { ...updated[i], sectionName: newSec, isSectionMatched: sectionOptions.includes(newSec) };
                            setImportPreview(updated);
                          }}
                        >
                          {sectionOptions.map((sn: string) => <option key={sn} value={sn}>{sn}</option>)}
                          {!row.isSectionMatched && <option value={row.sectionName}>{row.sectionName} (unmatched)</option>}
                        </select>
                      </td>
                      <td className="py-2 px-4 text-center">
                        {hasIssue
                          ? <span className="inline-flex items-center gap-1 text-amber-600 text-[10px] font-bold"><AlertTriangle className="w-3 h-3" /> Fix</span>
                          : <span className="inline-flex items-center gap-1 text-green-600 text-[10px] font-bold"><CheckCircle2 className="w-3 h-3" /> OK</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={importGenerateFees}
                onChange={(e) => setImportGenerateFees(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <div className="flex-1">
                <label className="text-sm font-bold text-gray-900 cursor-pointer">Generate initial fee dues for imported students</label>
                <p className="text-xs text-gray-600 mt-1">Automatically create fee payments based on class fee structures and transport routes</p>
              </div>
            </div>

            {importGenerateFees && (
              <div className="ml-6 p-3 bg-white rounded-lg border border-blue-200 space-y-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Select Month for Fee Generation</label>
                <select
                  value={importFeeMonth}
                  onChange={(e) => setImportFeeMonth(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {importMonthOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500">
                  Fees will be generated for <span className="font-bold text-gray-700">{importMonthOptions.find(m => m.value === importFeeMonth)?.label}</span>
                </p>
              </div>
            )}

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={importSendNotif}
                onChange={(e) => setImportSendNotif(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <div className="flex-1">
                <label className="text-sm font-bold text-gray-900 cursor-pointer">Send enrollment notifications</label>
                <p className="text-xs text-gray-600 mt-1">Send Email and WhatsApp credentials to imported students and their parents</p>
              </div>
            </div>

            {importGenerateFees && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <p className="font-bold mb-1">💡 How it works:</p>
                <ul className="list-disc pl-4 space-y-1 text-blue-700">
                  <li>Fees are generated using the same logic as the Fees page</li>
                  <li>If fees already exist for the selected month, they won't be duplicated</li>
                  <li>Transport fees are created if the student has a transport route</li>
                  <li>Fee exemptions and discounts are automatically applied</li>
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setImportPreviewOpen(false)} disabled={importLoading} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={importLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
            >
              {importLoading ? 'Importing...' : `Confirm & Import ${importPreview.length} Students`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm(prev => ({ ...prev, open: false }))}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[400px] rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-gray-600 text-sm">
            Are you sure you want to permanently delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone and will remove all associated records (fees, attendance, etc).
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirm(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button onClick={confirmDeleteStudent} className="bg-red-600 hover:bg-red-700 text-white">Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className={`hover:shadow-md transition-shadow ${stat.onClick ? 'cursor-pointer hover:border-blue-400 hover:ring-2 hover:ring-blue-100' : ''}`} onClick={stat.onClick}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                <div className={`w-8 h-8 sm:w-12 sm:h-12 ${stat.color} rounded-lg flex items-center justify-center shadow-sm shrink-0`}>
                  <Users className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              All Students ({filteredStudents.length})
              {loading && <span className="text-xs font-medium text-gray-400">Updating...</span>}
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-500 hover:text-red-600 font-medium">
                  <X className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              )}
              <Button variant="outline" size="sm" className="font-medium" onClick={() => {
                const tId = toast.loading('Exporting student registry...');
                try {
                  const exportData = filteredStudents.map((s: any) => ({
                    'Admission No': s.admission_number || '',
                    'Roll No': s.roll_number || '',
                    'First Name': s.user?.first_name || '',
                    'Last Name': s.user?.last_name || '',
                    'Class': s.section?.class?.name || '',
                    'Section': s.section?.name || '',
                    'Gender': s.gender || '',
                    'DOB': s.dob || s.date_of_birth || '',
                    'Blood Group': s.blood_group || '',
                    'Email': s.user?.email || '',
                    'Phone': s.user?.phone || '',
                    'Father Name': s.father_name || '',
                    'Mother Name': s.mother_name || '',
                    'Parent Phone': s.guardian_phone || '',
                    'Parent Email': s.guardian_email || '',
                    'Emergency Contact': s.emergency_contact || '',
                    'Address': s.address || '',
                    'City': s.city || '',
                    'State': s.state || '',
                    'Pincode': s.pincode || '',
                    'Previous School': s.previous_school || '',
                    'Medical Conditions': s.medical_conditions || '',
                    'Allergies': s.allergies || '',
                    'Status': s.is_active ? 'Active' : 'Inactive'
                  }));

                  const ws = XLSX.utils.json_to_sheet(exportData);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Students');
                  XLSX.writeFile(wb, `Students_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
                  toast.success('Registry export completed successfully', { id: tId });
                } catch (err) {
                  console.error(err);
                  toast.error('Failed to export students', { id: tId });
                }
              }}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 mb-6">
            <div className="relative w-full">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10"
              />

              <input
                type="text"
                placeholder="Search name, roll number, admission no, phone, or parent..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-12 rounded-xl border border-gray-200 bg-white shadow-sm pl-12 pr-4 text-base"
              />
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
              <Select value={selectedAcademicYear} onValueChange={(value) => { setSelectedAcademicYear(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-auto min-w-[180px] h-11 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Academic Years</SelectItem>
                  {academicYears.map((year: any) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}{year.is_current || year.isCurrent ? ' (Current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ClassSectionFilter
                showLabels={false}
                onFilterChange={({ classId, sectionId }) => {
                  setSelectedClass(classId);
                  setSelectedSection(sectionId);
                  setCurrentPage(1);
                }}
              />
              {isPastYearView && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
                  <History className="h-3.5 w-3.5" />
                  Historical · showing past-year class rosters
                </span>
              )}

              <Select value={selectedRisk} onValueChange={(value) => { setSelectedRisk(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-auto min-w-[150px] h-11 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedAttendanceFilter} onValueChange={(value) => { setSelectedAttendanceFilter(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-auto min-w-[150px] h-11 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
                  <SelectValue placeholder="Attendance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Attendance</SelectItem>
                  <SelectItem value="low">Below 75%</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={(value) => { setSelectedStatus(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-auto min-w-[150px] h-11 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedGender} onValueChange={(value) => { setSelectedGender(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-auto min-w-[130px] h-11 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="date"
                aria-label="Admission date from"
                value={admissionDateFrom}
                onChange={(event) => { setAdmissionDateFrom(event.target.value); setCurrentPage(1); }}
                className="w-full sm:w-[155px] h-11 rounded-xl bg-white border-gray-200 shadow-sm"
              />
              <Input
                type="date"
                aria-label="Admission date to"
                value={admissionDateTo}
                min={admissionDateFrom || undefined}
                onChange={(event) => { setAdmissionDateTo(event.target.value); setCurrentPage(1); }}
                className="w-full sm:w-[155px] h-11 rounded-xl bg-white border-gray-200 shadow-sm"
              />

              <StudentSortFilter value={studentSort} onChange={setStudentSort} showLabel={false} />

              <div className="flex items-center gap-2 border-l pl-3 border-gray-100 h-11">
                <span className="text-xs font-bold text-gray-500 whitespace-nowrap">View All</span>
                <input
                  type="checkbox"
                  checked={viewAll}
                  onChange={(e) => { setViewAll(e.target.checked); setCurrentPage(1); }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3 mb-4">
            {(viewAll ? sortedStudents : sortedStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)).map(student => (
              <div key={student.id} className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-600 text-white font-bold text-xs">
                      {(student.user?.first_name?.[0] || '') + (student.user?.last_name?.[0] || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{student.user?.first_name} {student.user?.last_name}</p>
                    <p className="text-xs text-gray-500">{student.section?.class?.name} - {student.section?.name} · Roll {student.roll_number ?? '—'}</p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] font-bold ${student.risk_level === 'high' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {student.risk_level || 'low'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-gray-500">Attendance</span>
                  <span className="font-bold">{student.attendance_percentage || 0}%</span>
                </div>
                <Link to={`/students/${student.id}`}>
                  <Button variant="outline" className="w-full h-10 rounded-xl font-bold text-blue-600 mb-2">View Profile</Button>
                </Link>
                {user?.role === 'admin' && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-10 rounded-xl font-bold text-gray-700 hover:bg-gray-50"
                      onClick={() => openEditModal(student)}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 px-2 font-bold"
                      onClick={() => handlePromoteStudent(student)}
                    >
                      Promote
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-10 rounded-xl font-bold text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleDeleteStudent(student.id, `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim())}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hidden md:block rounded-xl border border-gray-100 overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="font-bold whitespace-nowrap">Student</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">Class</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">Roll No.</TableHead>
                  {isDetailedView && (
                    <>
                      <TableHead className="font-bold whitespace-nowrap">Phone</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">Guardian</TableHead>
                    </>
                  )}
                  <TableHead className="font-bold whitespace-nowrap">Attendance</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">Risk Level</TableHead>
                  {isDetailedView && (
                    <TableHead className="font-bold whitespace-nowrap">Admission Date</TableHead>
                  )}
                  <TableHead className="font-bold whitespace-nowrap">Weak Subjects</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(viewAll ? sortedStudents : sortedStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)).map((student) => (
                  <TableRow key={student.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarFallback className="bg-blue-600 text-white font-bold text-xs">
                            {(student.user?.first_name?.[0] || '') + (student.user?.last_name?.[0] || '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-sm text-gray-900">{student.user?.first_name} {student.user?.last_name}</p>
                          <p className="text-[11px] font-medium text-gray-500">ID: {student.admission_number}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {student.section?.class?.name} - {student.section?.name}
                    </TableCell>
                    <TableCell className="font-semibold text-sm text-gray-700">{student.roll_number ?? '—'}</TableCell>
                    {isDetailedView && (
                      <>
                        <TableCell className="text-xs font-medium text-gray-600">
                          {student.user?.phone || 'No Phone'}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-gray-600">
                          {student.father_name || 'N/A'}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span>{student.attendance_percentage || 0}%</span>
                        </div>
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${(student.attendance_percentage || 0) < 75 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${student.attendance_percentage || 0}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`
                        font-bold px-2 rounded-lg text-[10px] uppercase
                        ${student.risk_level === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                          student.risk_level === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'}
                      `}>
                        {student.risk_level || 'low'}
                      </Badge>
                    </TableCell>
                    {isDetailedView && (
                      <TableCell className="text-xs font-medium text-gray-600">
                        {student.admission_date ? new Date(student.admission_date).toLocaleDateString() : 'N/A'}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {student.weak_subjects?.map((s: string) => (
                          <Badge key={s} variant="secondary" className="text-[10px] bg-gray-100 text-gray-600 border-none font-medium">
                            {s}
                          </Badge>
                        )) || <span className="text-gray-400 text-[10px]">None</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/students/${student.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                            Analyze Profile
                          </Button>
                        </Link>
                        {user?.role === 'admin' && (
                          <>
                            <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 px-2 font-bold"
                              onClick={() => handlePromoteStudent(student)}
                            >
                              Promote
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 rounded-lg text-gray-600 hover:bg-gray-50 font-bold text-xs"
                              onClick={() => openEditModal(student)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDeleteStudent(student.id, `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim())}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!viewAll && filteredStudents.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-6 px-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Page {currentPage} of {Math.ceil(filteredStudents.length / itemsPerPage)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-xl border-gray-200"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-xl border-gray-200"
                  disabled={currentPage === Math.ceil(filteredStudents.length / itemsPerPage)}
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredStudents.length / itemsPerPage), prev + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
