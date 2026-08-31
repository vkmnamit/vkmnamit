import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Users, ArrowRight, UserCheck, ShieldCheck, CalendarRange, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';

export function BulkPromoteStudents() {
  const [classes, setClasses] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);

  // Selection state for Manual Promotion
  const [sourceClass, setSourceClass] = useState('');
  const [sourceSection, setSourceSection] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [targetSection, setTargetSection] = useState('');

  // Academic Year selectors
  const [sourceAcademicYear, setSourceAcademicYear] = useState('');
  const [targetAcademicYear, setTargetAcademicYear] = useState('');

  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [result, setResult] = useState<{ promoted: number; skipped: number; feesGenerated: number, passedOut?: number } | null>(null);
  const [promotionProgress, setPromotionProgress] = useState<{ current: number; total: number; percentage: number } | null>(null);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    api.getClasses().then(data => { if (Array.isArray(data)) setClasses(data); });
    api.getAcademicYears().then((data: any) => {
      const years = Array.isArray(data) ? data : (data?.years || data?.data || []);
      setAcademicYears(years);

      const currentYear = years.find((y: any) => y.is_current);
      if (currentYear) setSourceAcademicYear(currentYear.id);

      // Default target to next academic year (non-current year)
      const nextYear = years.find((y: any) => !y.is_current);
      if (nextYear) {
        setTargetAcademicYear(nextYear.id);
      } else if (years.length > 1) {
        setTargetAcademicYear(years[1].id);
      }
    }).catch(() => { });
  }, []);

  const fetchStudents = async () => {
    if (!sourceSection) return;
    setLoading(true);
    try {
      const data = await api.getStudents({ section_id: sourceSection, limit: '9999' });
      const list = Array.isArray(data) ? data : (data?.students || []);
      setStudents(list);
      setSelectedStudents(list.map((s: any) => s.id));
    } catch {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setResult(null);
    fetchStudents();
  }, [sourceSection]);

  const handlePromote = async () => {
    if (!targetSection) return toast.error('Please select a target section');
    if (!targetAcademicYear) return toast.error('Please select the target academic year');
    if (selectedStudents.length === 0) return toast.error('Please select students to promote');

    setPromoting(true);
    setResult(null);
    setPromotionProgress({ current: 0, total: selectedStudents.length, percentage: 0 });

    try {
      // Process in batches of 20 for better progress tracking
      const batchSize = 20;
      const batches = [];
      for (let i = 0; i < selectedStudents.length; i += batchSize) {
        batches.push(selectedStudents.slice(i, i + batchSize));
      }

      let totalPromoted = 0;
      let totalSkipped = 0;
      let hasErrors = false;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const processedCount = Math.min((i + 1) * batchSize, selectedStudents.length);
        const percentage = Math.round((processedCount / selectedStudents.length) * 100);

        setPromotionProgress({
          current: processedCount,
          total: selectedStudents.length,
          percentage
        });

        try {
          const res = await api.bulkPromoteStudents({
            studentIds: batch,
            targetSectionId: targetSection,
            targetAcademicYearId: targetAcademicYear,
          });

          totalPromoted += res.promoted || 0;
          totalSkipped += res.skipped || 0;
        } catch (err: any) {
          hasErrors = true;
          console.error(`Batch ${i + 1} failed:`, err);
          // Continue with next batch even if one fails
        }
      }

      setResult({ promoted: totalPromoted, skipped: totalSkipped, feesGenerated: 0 });

      if (totalPromoted > 0) {
        toast.success(
          hasErrors
            ? `Partially completed: ${totalPromoted} students promoted, ${totalSkipped} skipped (some batches failed)`
            : `Successfully promoted ${totalPromoted} students!`
        );
      } else if (totalSkipped > 0) {
        toast.error(`All ${totalSkipped} students were skipped. They may already be in the target section/year.`);
      } else {
        toast.error('No students were promoted. Check if they are already in the target section/year.');
      }

      fetchStudents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to promote students');
      setResult({ promoted: 0, skipped: 0, feesGenerated: 0 });
    } finally {
      setPromoting(false);
      setPromotionProgress(null);
    }
  };


  const getSections = (classId: string) => classes.find(c => c.id === classId)?.sections || [];

  return (
    <Card className="rounded-3xl border-gray-100 shadow-sm bg-white">
      <CardHeader className="bg-gray-50/50 border-b border-gray-100">
        <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Bulk Promotion & Year Transition
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="bg-gray-100/50 p-1 rounded-xl mb-6 inline-flex">
            <TabsTrigger value="manual" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold text-xs flex items-center gap-2">
              <Users className="w-4 h-4" /> Manual Section Promote
            </TabsTrigger>
          </TabsList>

          {/* Result banner (shared) */}
          {result && (
            <div className="mb-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-black text-emerald-900">Promotion Complete!</p>
                <p className="text-emerald-700 text-sm font-medium">
                  {result.promoted} promoted
                  {result.feesGenerated > 0 && ` · ${result.feesGenerated} fee records created`}
                  {result.passedOut !== undefined && ` · ${result.passedOut} graduated/alumni`}
                  {result.skipped > 0 && ` · ${result.skipped} skipped`}
                </p>
              </div>
            </div>
          )}


          <TabsContent value="manual">
            {/* Selectors */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* Source */}
              <div className="lg:col-span-5 p-6 bg-red-50/50 rounded-2xl border border-red-100/50">
                <h3 className="text-sm font-bold text-red-900 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4" /> From (Current Class)
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block flex items-center gap-1">
                      <CalendarRange className="w-3 h-3" /> Academic Year
                    </label>
                    <Select value={sourceAcademicYear} onValueChange={setSourceAcademicYear}>
                      <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl font-medium">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {academicYears.map((y: any) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.name} {y.is_current ? '(Current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Class</label>
                    <Select value={sourceClass} onValueChange={val => { setSourceClass(val); setSourceSection(''); }}>
                      <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl font-medium"><SelectValue placeholder="Select Class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Section</label>
                    <Select value={sourceSection} onValueChange={setSourceSection} disabled={!sourceClass}>
                      <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl font-medium"><SelectValue placeholder="Select Section" /></SelectTrigger>
                      <SelectContent>
                        {getSections(sourceClass).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 flex justify-center items-center py-4 lg:pt-14">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border-4 border-white shadow-sm">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>

              {/* Target */}
              <div className="lg:col-span-5 p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                <h3 className="text-sm font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <UserCheck className="w-4 h-4" /> To (Next Class + Year)
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block flex items-center gap-1">
                      <CalendarRange className="w-3 h-3" /> Academic Year
                    </label>
                    <Select value={targetAcademicYear} onValueChange={setTargetAcademicYear}>
                      <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl font-medium"><SelectValue placeholder="Select Year" /></SelectTrigger>
                      <SelectContent>
                        {academicYears.map((y: any) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.name} {y.is_current ? '(Current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Class</label>
                    <Select value={targetClass} onValueChange={val => { setTargetClass(val); setTargetSection(''); }}>
                      <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl font-medium"><SelectValue placeholder="Select Class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Section</label>
                    <Select value={targetSection} onValueChange={setTargetSection} disabled={!targetClass}>
                      <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl font-medium"><SelectValue placeholder="Select Section" /></SelectTrigger>
                      <SelectContent>
                        {getSections(targetClass).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Student List */}
            {sourceSection && (
              <div className="mt-8 border border-gray-100 rounded-2xl overflow-hidden">
                <div className="bg-gray-50 p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">Students in Section</h3>
                    <Badge className="bg-blue-100 text-blue-700 border-0">{students.length} total</Badge>
                    {selectedStudents.length !== students.length && (
                      <Badge className="bg-indigo-100 text-indigo-700 border-0">{selectedStudents.length} selected</Badge>
                    )}
                  </div>
                  <Button
                    onClick={handlePromote}
                    disabled={promoting || !targetSection || !targetAcademicYear || selectedStudents.length === 0}
                    className="font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  >
                    {promoting ? 'Promoting...' : `Promote ${selectedStudents.length} Students →`}
                  </Button>

                  {/* Progress Bar */}
                  {promotionProgress && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-700">
                        <span>Progress: {promotionProgress.current} / {promotionProgress.total} students</span>
                        <span className="font-bold">{promotionProgress.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${promotionProgress.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        Processing batch... Please don't close this page.
                      </p>
                    </div>
                  )}
                </div>

                {loading ? (
                  <div className="p-8 text-center text-gray-500 font-medium">Loading students...</div>
                ) : students.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 font-medium">No students found in this section.</div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-gray-50 sticky top-0">
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedStudents.length === students.length && students.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedStudents(students.map(s => s.id));
                                else setSelectedStudents([]);
                              }}
                            />
                          </TableHead>
                          <TableHead className="font-bold text-xs uppercase text-gray-500">Student</TableHead>
                          <TableHead className="font-bold text-xs uppercase text-gray-500">Admission No</TableHead>
                          <TableHead className="font-bold text-xs uppercase text-gray-500">Current Year</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                              No students found in this section
                            </TableCell>
                          </TableRow>
                        ) : (
                          students.map((student) => (
                            <TableRow key={student.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedStudents.includes(student.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) setSelectedStudents(prev => [...prev, student.id]);
                                    else setSelectedStudents(prev => prev.filter(id => id !== student.id));
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="w-8 h-8">
                                    <AvatarFallback className="font-bold bg-blue-50 text-blue-700 text-xs">
                                      {student.user?.first_name?.[0]}{student.user?.last_name?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-bold text-sm text-gray-900">
                                    {student.user?.first_name} {student.user?.last_name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium text-gray-500">{student.admission_number}</TableCell>
                              <TableCell className="text-xs text-gray-500">
                                {student.academic_year?.name || <span className="text-gray-300 italic">Not set</span>}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    {students.length > 0 && (
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                        Showing {students.length} student{students.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

      </CardContent>
    </Card>
  );
}
