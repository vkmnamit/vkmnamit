import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Calendar } from '../../components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { CheckCircle, XCircle, Calendar as CalendarIcon, Download, Save, Users, Clock, CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { ClassSectionFilter } from '../../components/ClassSectionFilter';
import { StudentSortFilter, sortStudentsArray } from '../../components/StudentSortFilter';
import React from 'react';

export function AttendancePage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const isPersonalView = user?.role === 'student' || user?.role === 'parent';
  const isParent = user?.role === 'parent';

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = useState<'daily' | 'register'>('register');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent' | 'unmarked'>('all');
  const [saving, setSaving] = useState(false);
    const [registerData, setRegisterData] = useState<any[]>([]);
  const [studentSort, setStudentSort] = useState('roll_asc');
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [isHolidayDate, setIsHolidayDate] = useState(false);

  // Holiday manager state (admin only)
  const [holidays, setHolidays] = useState<any[]>([]);
  const [showHolidayManager, setShowHolidayManager] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayReason, setNewHolidayReason] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Parent child selector
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const canEditAttendance = React.useMemo(() => {
    if (user?.role === 'admin') return true;
    if (user?.role !== 'teacher') return false;
    if (selectedSection === 'all') return false;

    return classes.some(c =>
      c.sections?.some((s: any) => s.id === selectedSection && (s.class_teacher_id === user?.id || s.isClassTeacher))
    );
  }, [user, selectedSection, classes]);

  useEffect(() => {
    fetchInitialData();
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const res = await api.getHolidays();
      setHolidays(res?.holidays || []);
    } catch {
      // graceful degrade — table may not exist yet
    }
  };

  const handleMarkHoliday = async () => {
    if (!newHolidayDate) { toast.error('Select a date first'); return; }
    setSavingHoliday(true);
    try {
      await api.markHoliday({ date: newHolidayDate, reason: newHolidayReason || `Holiday on ${newHolidayDate}` });
      toast.success('Holiday marked successfully');
      setNewHolidayDate('');
      setNewHolidayReason('');
      await fetchHolidays();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark holiday');
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await api.deleteHoliday(id);
      toast.success('Holiday removed');
      await fetchHolidays();
    } catch {
      toast.error('Failed to remove holiday');
    }
  };

  useEffect(() => {
    if (viewMode === 'daily' && date) fetchAttendance();
    if (viewMode === 'register') fetchRegister();
  }, [date, selectedClass, selectedSection, viewMode, selectedChildId]);

  const fetchInitialData = async () => {
    try {
      if (isStaff) {
        const classData = user?.role === 'teacher' ? await api.getTeacherSections() : await api.getClasses();
        setClasses(classData);
        setSelectedSection('all');
      } else if (isParent) {
        const kids = await api.getParentChildren();
        const mapped = (kids || []).map((k: any) => ({
          id: k.student?.id,
          name: `${k.student?.user?.first_name || ''} ${k.student?.user?.last_name || ''}`.trim(),
          class: `${k.student?.section?.class?.name || ''} ${k.student?.section?.name || ''}`.trim(),
        })).filter((k: any) => k.id);
        setChildrenList(mapped);
        if (mapped.length > 0) setSelectedChildId(mapped[0].id);
      }
    } catch (err) {
      if (isStaff) toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const formattedDate = date?.toISOString().split('T')[0];
      const params: any = {};
      if (isStaff) {
        if (selectedSection !== 'all') params.section_id = selectedSection;
        else if (selectedClass !== 'all') params.class_id = selectedClass;
      }

      let studentsArray = [];
      if (user?.role === 'parent') {
        const children = await api.getParentChildren();
        const allKids = children.map((c: any) => c.student);
        studentsArray = selectedChildId ? allKids.filter((k: any) => k.id === selectedChildId) : allKids;
      } else if (user?.role === 'student') {
        const dash = await api.getStudentDashboard();
        studentsArray = [dash.student];
      } else {
        const sectionStudents = await api.getStudents(params);
        studentsArray = sectionStudents.students || [];
      }

            const existingRecords = await api.getAttendance({
        ...(isStaff && selectedSection !== 'all' && { section_id: selectedSection }),
        date: formattedDate,
      });

      const attendanceData = existingRecords.records || existingRecords || [];
      setHolidayDates(existingRecords.holiday_dates || []);
      const isHolidayDate = (existingRecords.holiday_dates || []).includes(formattedDate);
      setIsHolidayDate(isHolidayDate);

      const mappedStudents = studentsArray.map((student: any) => {
        const record = attendanceData.find((r: any) => r.student_id === student.id);
        let status: string;
        if (isHolidayDate) {
          status = 'holiday';
        } else {
          status = record ? record.status : 'unmarked';
        }
        return {
          ...student,
          status,
          remarks: record ? record.remarks : ''
        };
      });

      setStudents(mappedStudents);
    } catch (err) {
      toast.error('Failed to load student list');
    } finally {
      setLoading(false);
    }
  };

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const fetchRegister = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (isStaff) {
        if (selectedSection !== 'all') params.section_id = selectedSection;
        else if (selectedClass !== 'all') params.class_id = selectedClass;
      }

      let studentsArray = [];
      if (user?.role === 'parent') {
        const children = await api.getParentChildren();
        const allKids = children.map((c: any) => c.student);
        studentsArray = selectedChildId ? allKids.filter((k: any) => k.id === selectedChildId) : allKids;
      } else if (user?.role === 'student') {
        const dash = await api.getStudentDashboard();
        studentsArray = [dash.student];
      } else {
        const sectionStudents = await api.getStudents(params);
        studentsArray = sectionStudents.students || [];
      }

      // Calculate all dates for the selected month
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(selectedYear, selectedMonth, i + 1);
        return d.toISOString().split('T')[0];
      });

      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      const attendanceResponse = await api.getAttendance({
        ...(isStaff && selectedSection !== 'all' && { section_id: selectedSection }),
        start_date: startDate,
        end_date: endDate,
      });

      const attendanceRecords = attendanceResponse.records || attendanceResponse || [];
      const holidaySet = new Set(attendanceResponse.holiday_dates || []);
      setHolidayDates(attendanceResponse.holiday_dates || []);

      const mappedData = studentsArray.map((student: any) => {
        const attendance: any = {};
        dates.forEach(d => {
          const record = attendanceRecords.find((r: any) => r.student_id === student.id && r.date === d);
          if (holidaySet.has(d)) {
            attendance[d] = 'H';
          } else {
            attendance[d] = record ? (record.status === 'present' ? 'P' : record.status === 'holiday' ? 'H' : 'A') : '-';
          }
        });

        const presentDays = Object.values(attendance).filter(v => v === 'P').length;
        const totalDays = Object.values(attendance).filter(v => v !== '-' && v !== 'H').length;
        const percentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

        return {
          id: student.id,
          name: `${student.user?.first_name} ${student.user?.last_name}`,
          rollNo: student.roll_number,
          className: `${student.section?.class?.name || ''}-${student.section?.name || ''}`,
          attendance,
          percentage
        };
      });

      setRegisterData(mappedData);
    } catch (err) {
      toast.error('Failed to load register data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'register') fetchRegister();
  }, [selectedSection, selectedMonth, selectedYear, viewMode]);

    const toggleRegisterStatus = async (studentId: string, date: string, currentStatus: string) => {
    // Prevent toggling on holidays or if no status mapping exists
    if (currentStatus === 'H' || holidayDates.includes(date)) {
      return;
    }

    const nextStatusMap: Record<string, 'present' | 'absent'> = {
      'P': 'absent',
      'A': 'present',
      '-': 'present'
    };

    const nextStatus = nextStatusMap[currentStatus] || 'present';
    const displayStatus = nextStatus === 'present' ? 'P' : 'A';

    // Optimistic Update
    setRegisterData(prev => prev.map(row => {
      if (row.id === studentId) {
        const newAttendance = { ...row.attendance, [date]: displayStatus };
        const presentDays = Object.values(newAttendance).filter(v => v === 'P').length;
        const totalDays = Object.values(newAttendance).filter(v => v !== '-').length;
        const percentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;
        return { ...row, attendance: newAttendance, percentage };
      }
      return row;
    }));

    try {
      await api.submitAttendance({
        date,
        records: [{ studentId, status: nextStatus }]
      });
      toast.success(`Marked ${displayStatus === 'P' ? 'Present' : 'Absent'} for ${date}`, { duration: 1000 });
    } catch (err) {
      toast.error('Sync failed. Reverting...');
      fetchRegister();
    }
  };

  const toggleStatus = async (studentId: string, status: 'present' | 'absent' | 'late') => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status } : s));
    try {
      await api.submitAttendance({
        date: date?.toISOString().split('T')[0],
        records: [{ studentId, status }]
      });
      toast.success(`Auto-saved: marked ${status}`, { duration: 1000 });
    } catch (err) {
      toast.error('Auto-save failed');
      fetchAttendance();
    }
  };

  const handleMarkAll = async (status: 'present' | 'absent') => {
    const previousStudents = [...students];
    setStudents(prev => prev.map(s => ({ ...s, status })));
    try {
      await api.submitAttendance({
        date: date?.toISOString().split('T')[0],
        records: students.map(s => ({ studentId: s.id, status }))
      });
      toast.success(`Bulk Sync: All marked ${status}`);
    } catch (err) {
      toast.error('Bulk sync failed');
      setStudents(previousStudents);
    }
  };

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    try {
      const payload = {
        sectionId: selectedSection === 'all' ? undefined : selectedSection,
        date: date.toISOString().split('T')[0],
                records: students
          .filter(s => s.status !== 'unmarked' && s.status !== 'holiday')
          .map(s => ({
            studentId: s.id,
            status: s.status,
            remarks: s.remarks
          }))
      };
      await api.submitAttendance(payload);
      toast.success('Registry state persisted');
    } catch (err) {
      toast.error('Persistence failed');
    } finally {
      setSaving(false);
    }
  };

        const presentCount = students.filter(s => s.status === 'present').length;
  const absentCount = students.filter(s => s.status === 'absent').length;
  const unmarkedCount = students.filter(s => s.status === 'unmarked').length;

    const generateReport = () => {
    try {
      const doc = new jsPDF();

      // Header band (black & white)
      doc.setFillColor(0, 0, 0); // black
      doc.rect(0, 0, 210, 30, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(user?.school?.toUpperCase() || 'KAUTIX SCHOOL', 14, 20);

      doc.setTextColor(0, 0, 0); // black
      doc.setFontSize(16);
      doc.text('Attendance Registry Protocol', 14, 45);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Node: ${selectedSection === 'all' ? 'All Classes' : 'Specific Section'}`, 14, 53);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 59);

      const tableData = registerData.map(row => [
        row.name,
        row.rollNo,
        row.className,
        `${row.percentage}%`
      ]);

      (doc as any).autoTable({
        startY: 65,
        head: [['Student Name', 'Roll #', 'Class/Section', 'Attendance %']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 }
      });

      // Footer (black & white)
      const finalY = (doc as any).lastAutoTable.finalY;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100); // neutral gray
      doc.text('This is a computer-generated document. No signature is required.', 105, 280, { align: 'center' });
      doc.text('Kautix School Management OS • Empowering Education through AI', 105, 285, { align: 'center' });

      doc.save(`Attendance_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Professional attendance report generated');
    } catch (err) {
      toast.error('Report generation failed');
    }
  };

  const generateExcelReport = () => {
    try {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(selectedYear, selectedMonth, i + 1);
        return d.toISOString().split('T')[0];
      });

      const excelData = registerData.map(row => {
        const rowData: any = {
          'Student Name': row.name,
          'Roll Number': row.rollNo,
          'Class/Section': row.className,
          'Attendance Rate': `${row.percentage}%`
        };
        // Add each date as a column
        dates.forEach(d => {
          rowData[d.split('-')[2]] = row.attendance[d] || '-';
        });
        return rowData;
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Attendance");

      const fileName = `Attendance_${selectedMonth + 1}_${selectedYear}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success('Excel ledger downloaded successfully');
    } catch (err) {
      toast.error('Failed to generate Excel report');
    }
  };

  const isLocked = isStaff && new Date().getHours() >= 18 && user?.role !== 'admin';

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {isPersonalView ? (user?.role === 'parent' ? 'My Children\'s Attendance' : 'My Attendance') : 'Attendance Registry'}
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            {isPersonalView
              ? 'Your personal attendance record only'
              : `Digital attendance sheet for ${selectedSection === 'all' ? 'All Classes' : 'selected section'}`}
          </p>
        </div>
        {isStaff ? (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {isLocked && (
              <Badge className="bg-amber-100 text-amber-700 border-none font-bold px-3 py-1.5 rounded-xl">
                <Clock className="w-4 h-4 mr-2" /> REGISTRY LOCKED
              </Badge>
            )}
            <div className="bg-gray-100 p-1 rounded-xl flex">
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'daily' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                onClick={() => setViewMode('daily')}
              >Daily</Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                onClick={() => setViewMode('register')}
              >Register</Button>
            </div>
            {user?.role === 'admin' && (
              <Button
                variant="outline"
                className="h-10 px-4 rounded-xl font-bold text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                onClick={() => setShowHolidayManager(true)}
              >
                <CalendarDays className="w-4 h-4 mr-2" /> Holidays
                {holidays.length > 0 && (
                  <span className="ml-1.5 bg-purple-100 text-purple-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{holidays.length}</span>
                )}
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 w-12 sm:w-auto font-bold text-xs rounded-xl border-gray-200 px-0 sm:px-4" onClick={generateReport}>
                <Download className="w-4 h-4 text-red-600 sm:mr-2" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" className="h-10 w-12 sm:w-auto font-bold text-xs rounded-xl border-gray-200 px-0 sm:px-4" onClick={generateExcelReport}>
                <Download className="w-4 h-4 text-emerald-600 sm:mr-2" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-100 p-1 rounded-xl flex">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'daily' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
              onClick={() => setViewMode('daily')}
            >Today</Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest ${viewMode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
              onClick={() => setViewMode('register')}
            >Monthly</Button>
          </div>
        )}
      </div>

      {/* Child Selector for Parents */}
      {isParent && childrenList.length > 1 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-black uppercase text-blue-400 tracking-widest mb-3 flex items-center gap-2">
            <Users className="w-3 h-3" /> Select Child
          </p>
          <div className="flex flex-wrap gap-2">
            {childrenList.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${selectedChildId === child.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/25'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                  }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${selectedChildId === child.id ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                  }`}>
                  {child.name?.[0] || '?'}
                </div>
                <div className="text-left">
                  <p className="leading-tight">{child.name}</p>
                  <p className={`text-[10px] font-medium leading-tight ${selectedChildId === child.id ? 'text-blue-200' : 'text-slate-400'}`}>{child.class}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-6">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="py-4 px-4 sm:px-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {isStaff && (
                  <div className="flex flex-wrap items-center gap-3">
                    <ClassSectionFilter
                      showLabels={false}
                      onFilterChange={({ classId, sectionId }) => {
                        setSelectedClass(classId);
                        setSelectedSection(sectionId);
                      }}
                    />
                    <StudentSortFilter value={studentSort} onChange={setStudentSort} showLabel={false} />
                  </div>
                )}

                {viewMode === 'register' && (
                  <div className="flex items-center gap-2 border-t sm:border-t-0 border-l-0 sm:border-l pt-2 sm:pt-0 pl-0 sm:pl-4 border-gray-100 w-full sm:w-auto">
                    <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                      <SelectTrigger className="w-28 sm:w-32 h-10 rounded-xl font-bold text-xs">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                          <SelectItem key={i} value={i.toString()} className="text-xs font-bold">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                      <SelectTrigger className="w-24 h-10 rounded-xl font-bold text-xs">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {[2024, 2025, 2026].map(y => (
                          <SelectItem key={y} value={y.toString()} className="text-xs font-bold">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {viewMode === 'daily' && isStaff && !isLocked && !isHolidayDate && canEditAttendance && (
                  <div className="flex gap-1 border-t sm:border-t-0 border-l-0 sm:border-l pt-2 sm:pt-0 pl-0 sm:pl-4 border-gray-100">
                    <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase text-green-600" onClick={() => handleMarkAll('present')}>All P</Button>
                    <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase text-red-600" onClick={() => handleMarkAll('absent')}>All A</Button>
                  </div>
                )}
                {viewMode === 'daily' && (
                  <div className="flex items-center gap-2 shrink-0">
                    {isHolidayDate && (
                      <Badge className="bg-gray-100 text-gray-600 border-none px-3 py-1 font-black text-[10px]">
                        Holiday — No attendance needed
                      </Badge>
                    )}
                    <Badge className="bg-emerald-50 text-emerald-700 border-none px-3 py-1 font-black text-[10px]">{presentCount} Present</Badge>
                    <Badge className="bg-red-50 text-red-700 border-none px-3 py-1 font-black text-[10px]">{absentCount} Absent</Badge>
                    {unmarkedCount > 0 && (
                      <Badge className="bg-gray-100 text-gray-500 border-none px-3 py-1 font-black text-[10px]">{unmarkedCount} Unmarked</Badge>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="p-10 space-y-4">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : viewMode === 'register' ? (
                <div className="min-w-[1000px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="p-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 sticky left-0 bg-gray-50/50 z-10 w-[200px]">Student Node</th>
                         {Object.keys(registerData[0]?.attendance || {}).map(d => {
                          const isHoliday = holidayDates.includes(d) || holidays.some(h => h.date === d);
                          const holiday = holidays.find(h => h.date === d);
                          return (
                            <th key={d} className={`p-4 text-center text-[10px] font-black uppercase tracking-widest border-b border-gray-100 min-w-[50px] ${
                              isHoliday ? 'bg-gray-200 text-gray-600' : 'text-gray-400'
                            }`} title={isHoliday ? (holiday?.reason || 'Holiday') : undefined}>
                              {d.split('-')[2]}
                              {isHoliday && <div className="text-[7px] text-gray-500 font-black">HOL</div>}
                            </th>
                          );
                        })}
                        <th className="p-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortStudentsArray(registerData, studentSort).map((row: any) => (
                        <tr key={row.id} className="hover:bg-gray-50/30 transition-colors group">
                          <td className="p-4 sticky left-0 bg-white group-hover:bg-gray-50/30 z-10 border-r border-gray-50">
                            <Link to={`/students/${row.id}`} className="block hover:translate-x-1 transition-transform">
                              <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{row.name}</p>
                              <div className="flex gap-2">
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Roll #{row.rollNo}</p>
                                <p className="text-[9px] text-blue-500 font-bold uppercase">{row.className}</p>
                              </div>
                            </Link>
                          </td>
                          {Object.entries(row.attendance).map(([date, status]: any) => {
                              const isHoliday = holidayDates.includes(date);
                              return (
                              <td key={date} className="p-2 text-center">
                                <div
                                  onClick={() => canEditAttendance && !isLocked && !isHoliday && toggleRegisterStatus(row.id, date, status)}
                                  className={`w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-[10px] font-black transition-all ${status === 'P' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                    status === 'A' ? 'bg-red-50 text-red-600 border border-red-100' :
                                    status === 'H' ? 'bg-gray-200 text-gray-600 border border-gray-300' :
                                      'bg-gray-50 text-gray-400 border border-gray-100'
                                    } ${canEditAttendance && !isLocked && !isHoliday ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-60'}`}>
                                  {status}
                                </div>
                              </td>
                              );
                            })}
                          <td className="p-4 text-center">
                            <Badge className={`${row.percentage >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                              } border-none font-black text-[10px]`}>{row.percentage}%</Badge>
                          </td>
                        </tr>
                      ))}
                      {registerData.length === 0 && (
                        <tr>
                          <td colSpan={17} className="p-20 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Users className="w-8 h-8 text-gray-300" />
                            </div>
                            <p className="text-sm text-gray-400 font-bold">No students assigned to this node.</p>
                            <p className="text-xs text-gray-400 mt-1">Select 'All Classes' or verify section assignments.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sortStudentsArray(students, studentSort).filter(s => statusFilter === 'all' || s.status === statusFilter).map((student: any) => {
                    const parent = student.parents?.[0]?.parent;
                    const parentName = parent ? `${parent.user?.first_name || ''} ${parent.user?.last_name || ''}`.trim() : '';
                    const parentPhone = parent?.user?.phone || '';
                    const className = `${student.section?.class?.name || ''} ${student.section?.name || ''}`.trim();
                    return (
                      <div key={student.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 sm:p-5 hover:bg-gray-50/30 transition-colors">
                        <Link to={`/students/${student.id}`} className="flex items-start gap-3 sm:gap-4 group min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                            {student.user?.first_name?.[0]}{student.user?.last_name?.[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">{student.user?.first_name} {student.user?.last_name}</p>
                              {student.attendance_percentage < 75 && (
                                <Badge className="bg-red-50 text-red-600 text-[8px] font-black h-4 px-1 border-none shrink-0">HIGH RISK</Badge>
                              )}
                            </div>
                            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                              <p className="text-[10px] text-gray-500 font-semibold">
                                <span className="text-gray-400 font-bold uppercase tracking-wider">Roll:</span> #{student.roll_number || 'N/A'}
                              </p>
                              <p className="text-[10px] text-gray-500 font-semibold">
                                <span className="text-gray-400 font-bold uppercase tracking-wider">Class:</span> {className || 'N/A'}
                              </p>
                              {parentName && (
                                <p className="text-[10px] text-gray-500 font-semibold truncate">
                                  <span className="text-gray-400 font-bold uppercase tracking-wider">Parent:</span> {parentName}
                                </p>
                              )}
                              {parentPhone && (
                                <p className="text-[10px] text-gray-500 font-semibold">
                                  <span className="text-gray-400 font-bold uppercase tracking-wider">Phone:</span> {parentPhone}
                                </p>
                              )}
                              {student.address && (
                                <p className="text-[10px] text-gray-500 font-semibold truncate sm:col-span-2">
                                  <span className="text-gray-400 font-bold uppercase tracking-wider">Address:</span> {student.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          {isStaff ? (
                            isHolidayDate ? (
                              <Badge className="bg-gray-100 text-gray-600 border-none font-black text-xs uppercase">
                                Holiday
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 p-1 rounded-xl w-full sm:w-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isLocked || !canEditAttendance}
                                  className={`flex-1 sm:flex-none h-9 px-4 sm:px-6 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all duration-200 ${student.status === 'present'
                                    ? '!bg-emerald-600 hover:!bg-emerald-700 !text-white shadow-lg shadow-emerald-600/25 border-2 border-emerald-600 scale-[1.02]'
                                    : '!bg-transparent !text-gray-400 hover:!text-emerald-600 hover:!bg-emerald-50 border-2 border-transparent'
                                    }`}
                                  onClick={() => toggleStatus(student.id, 'present')}
                                >
                                  <CheckCircle className={`w-3.5 h-3.5 mr-1.5 ${student.status === 'present' ? '!text-white' : '!text-gray-300'}`} />
                                  Present
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isLocked || !canEditAttendance}
                                  className={`flex-1 sm:flex-none h-9 px-4 sm:px-6 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all duration-200 ${student.status === 'absent'
                                    ? '!bg-red-600 hover:!bg-red-700 !text-white shadow-lg shadow-red-600/25 border-2 border-red-600 scale-[1.02]'
                                    : '!bg-transparent !text-gray-400 hover:!text-red-600 hover:!bg-red-50 border-2 border-transparent'
                                    }`}
                                  onClick={() => toggleStatus(student.id, 'absent')}
                                >
                                  <XCircle className={`w-3.5 h-3.5 mr-1.5 ${student.status === 'absent' ? '!text-white' : '!text-gray-300'}`} />
                                  Absent
                                </Button>
                              </div>
                            )
                          ) : (
                            <Badge className={`border-none font-bold text-xs uppercase ${student.status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                              student.status === 'absent' ? 'bg-red-50 text-red-700' :
                              student.status === 'holiday' ? 'bg-gray-100 text-gray-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>{student.status}</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {viewMode === 'daily' && (
          <div className="w-full lg:w-80">
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="py-4 px-6 border-b border-gray-50">
                <CardTitle className="text-base font-bold text-gray-900">Protocol Date</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-xl border border-gray-50" />
                <div className={`mt-6 p-5 rounded-[24px] ${isLocked ? 'bg-amber-500' : 'bg-slate-900'} text-white relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Save className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2">{isLocked ? 'System Locked' : 'Sync Active'}</p>
                  <p className="text-xs font-medium leading-relaxed opacity-80">
                    {isLocked
                      ? 'Attendance protocols are locked for the day. Contact administrator for manual overrides.'
                      : `Syncing all interactions for ${date?.toLocaleDateString()}. Changes are persisted in real-time.`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Holiday Manager Slide-over (Admin only) ───────────────── */}
      {showHolidayManager && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={() => setShowHolidayManager(false)} />
          {/* Panel */}
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Manage Holidays</h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Marked holidays don't count as working days</p>
              </div>
              <button onClick={() => setShowHolidayManager(false)} className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Add new holiday */}
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">Mark New Holiday</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Date</label>
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={e => setNewHolidayDate(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Holiday Name / Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Ganesh Chaturthi"
                    value={newHolidayReason}
                    onChange={e => setNewHolidayReason(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
                <Button
                  className="w-full h-10 rounded-xl bg-purple-600 hover:bg-purple-700 font-bold text-xs text-white"
                  onClick={handleMarkHoliday}
                  disabled={savingHoliday || !newHolidayDate}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {savingHoliday ? 'Saving...' : 'Mark as Holiday'}
                </Button>
              </div>
            </div>

            {/* Existing holidays list */}
            <div className="flex-1 p-6">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">
                Marked Holidays ({holidays.length})
              </p>
              {holidays.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarDays className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-semibold">No holidays marked yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {holidays
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((h: any) => (
                      <div key={h.id} className="flex items-center gap-4 p-4 bg-purple-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900">
                            {new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                          <p className="text-[10px] font-medium text-purple-600 mt-0.5">{h.reason}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteHoliday(h.id)}
                          className="w-8 h-8 rounded-lg bg-white flex items-center justify-center hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
