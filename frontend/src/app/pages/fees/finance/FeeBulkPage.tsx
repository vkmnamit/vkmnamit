import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { toast } from 'sonner';
import { Package, Bell, Zap, RefreshCw, CheckCircle2, FolderDown, FileText, Loader2, School, CalendarCheck, AlertCircle, AlertTriangle, Truck, GraduationCap, Bus, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import { downloadBlob, generateDueSlipBlob, generateCombinedFeeReportPdf, generateMergedDueSlipsPdf, DueSlipData } from '../../../../lib/pdf';
import JSZip from 'jszip';

const OPERATIONS = [
  { id: 'generate', label: 'Generate Fees', icon: Zap, color: 'bg-blue-600 hover:bg-blue-700', description: 'Auto-generate monthly/quarterly/annual fees for selected students' },
  { id: 'reminder', label: 'Send Reminders', icon: Bell, color: 'bg-amber-500 hover:bg-amber-600', description: 'Send payment reminders via app, email, and WhatsApp' },
  { id: 'sync', label: 'Sync Dues', icon: RefreshCw, color: 'bg-emerald-600 hover:bg-emerald-700', description: 'Mark overdue payments and update statuses' },
];

// Fetches all pages of pending+overdue fees for a given class/section
async function fetchAllPendingFees(params: Record<string, string>) {
  const allPayments: any[] = [];

  for (const status of ['pending', 'overdue']) {
    const statusPayments: any[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const res = await api.getFees({ ...params, status, page: String(page), limit: String(limit) });
      // API wraps response in { payments: [...], total: N }
      const payments: any[] = res?.payments ?? (Array.isArray(res) ? res : []);
      statusPayments.push(...payments);
      const total = res?.total ?? payments.length;
      if (statusPayments.length >= total || payments.length < limit) break;
      page++;
    }
    allPayments.push(...statusPayments);
  }
  return allPayments;
}

export function FeeBulkPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [classFilter, setClassFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [sections, setSections] = useState<any[]>([]);
  const [operation, setOperation] = useState('generate');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Fee type selection: 'tuition' | 'transport' | 'both'
  const [feeType, setFeeType] = useState<'tuition' | 'transport' | 'both'>('both');
  // Month selection for fee generation
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM format
  // Detailed generation results from backend
  const [genResult, setGenResult] = useState<{
    totalGenerated: number;
    totalSkipped: number;
    tuitionGenerated: number;
    transportGenerated: number;
    details: string[];
    metrics?: { generationTimeMs: number; studentsProcessed: number; feesPerSec: number };
  } | null>(null);
  // Generation history from fee_generation_logs
  const [genLogs, setGenLogs] = useState<any[]>([]);

  // Download Due Slips state
  const [dlClassFilter, setDlClassFilter] = useState('all');
  const [dlSectionFilter, setDlSectionFilter] = useState('all');
  const [dlSections, setDlSections] = useState<any[]>([]);
  const [dlLanguage, setDlLanguage] = useState<'english' | 'hindi' | 'bilingual'>('english');
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState('');
  const [dlProgressCount, setDlProgressCount] = useState(0);
  const [dlProgressTotal, setDlProgressTotal] = useState(0);

  // Monthly fee status
  const [monthlyStatus, setMonthlyStatus] = useState<{
    alreadyGenerated: boolean;
    count: number;
    dueDate: string;
    monthLabel: string;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmType, setConfirmType] = useState<'late_month' | 'already_done' | null>(null);

  const currentMonthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  // Generate month options (current month + next 2 months)
  const monthOptions = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return {
      value: d.toISOString().substring(0, 7),
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  });

  const checkMonthlyStatus = async (classId?: string, sectionId?: string) => {
    setCheckingStatus(true);
    try {
      const now = new Date();
      const monthStr = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      const params: any = { status: 'pending', limit: '1' };
      if (classId && classId !== 'all') params.class_id = classId;
      if (sectionId && sectionId !== 'all') params.section_id = sectionId;
      // Search for fees with this month's label
      params.search = monthStr;
      const res = await api.getFees(params);
      const payments: any[] = res?.payments ?? (Array.isArray(res) ? res : []);
      const total = res?.total ?? payments.length;

      if (total > 0) {
        const firstFee = payments[0];
        const dueDate = firstFee?.due_date || '';
        const dueDateFormatted = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        setMonthlyStatus({ alreadyGenerated: true, count: total, dueDate: dueDateFormatted, monthLabel: monthStr });
      } else {
        setMonthlyStatus({ alreadyGenerated: false, count: 0, dueDate: '', monthLabel: monthStr });
      }
    } catch {
      setMonthlyStatus(null);
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => { api.getClasses().then(setClasses).catch(() => { }); checkMonthlyStatus(); loadGenLogs(); }, []);

  const handleClassChange = (val: string) => {
    setClassFilter(val);
    setSectionFilter('all');
    const cls = classes.find(c => c.id === val);
    setSections(cls?.sections || []);
    checkMonthlyStatus(val, 'all');
  };

  const handleSectionChange = (val: string) => {
    setSectionFilter(val);
    checkMonthlyStatus(classFilter, val);
  };

  const handleDlClassChange = (val: string) => {
    setDlClassFilter(val);
    setDlSectionFilter('all');
    const cls = classes.find(c => c.id === val);
    setDlSections(cls?.sections || []);
  };

  const executeGenerate = async () => {
    setRunning(true);
    setResult(null);
    setGenResult(null);
    setShowConfirm(false);
    try {
      const payload: { class_id?: string; section_id?: string; fee_type?: 'tuition' | 'transport' | 'both'; month?: string } = {
        fee_type: feeType,
        month: selectedMonth, // Send selected month to backend
      };
      if (sectionFilter !== 'all') payload.section_id = sectionFilter;
      else if (classFilter !== 'all') payload.class_id = classFilter;

      const r = await api.adminGenerateFees(payload);
      const msg = r?.message || `Generated fees for ${r?.totalGenerated || 0} student(s)`;
      setResult(msg);

      // Store detailed results for the breakdown UI
      if (r) {
        setGenResult({
          totalGenerated: r.totalGenerated || 0,
          totalSkipped: r.totalSkipped || 0,
          tuitionGenerated: r.tuitionGenerated || 0,
          transportGenerated: r.transportGenerated || 0,
          details: r.details || [],
          metrics: r.metrics || undefined,
        });
      }

      if ((r?.totalGenerated || 0) > 0) {
        toast.success(msg);
      } else {
        toast.info(msg);
      }
      await checkMonthlyStatus(classFilter, sectionFilter);
      await loadGenLogs();
    } catch (e: any) {
      toast.error(e?.message || 'Fee generation failed');
    } finally {
      setRunning(false);
    }
  };

  const loadGenLogs = async () => {
    try {
      const logs = await api.getGenerationLogs();
      setGenLogs(Array.isArray(logs) ? logs : []);
    } catch {
      setGenLogs([]);
    }
  };

  const handleRun = async () => {
    if (operation === 'generate') {
      // If current month is selected and not yet generated, generate immediately
      const isCurrentMonth = selectedMonth === new Date().toISOString().substring(0, 7);

      if (isCurrentMonth && !monthlyStatus?.alreadyGenerated) {
        // Current month not generated yet - generate immediately without confirmation
        await executeGenerate();
        return;
      }

      // Check if already generated → show modal instead of blocking silently
      if (monthlyStatus?.alreadyGenerated) {
        setConfirmType('already_done');
        setShowConfirm(true);
        return;
      }
      // Check if date is past the 5th of the month
      const today = new Date().getDate();
      if (today > 5) {
        setConfirmType('late_month');
        setShowConfirm(true);
        return;
      }
      // All good — execute directly
      await executeGenerate();
      return;
    }

    setRunning(true);
    setResult(null);
    try {
      if (operation === 'reminder') {
        const payload: any = {};
        if (classFilter !== 'all') payload.class_id = classFilter;
        if (sectionFilter !== 'all') payload.section_id = sectionFilter;
        await api.sendFeeReminders(payload);
        setResult('Reminders sent successfully to all pending students!');
        toast.success('Reminders sent');
      } else if (operation === 'sync') {
        await api.syncFeeDues();
        setResult('Dues synced — overdue statuses updated');
        toast.success('Dues synced');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Operation failed');
    } finally {
      setRunning(false);
    }
  };

  /**
   * Core download engine — handles both:
   *  - Specific class/section download
   *  - Whole school download (all classes, all sections)
   */
  const handleExportFeeReport = async () => {
    if (dlClassFilter === 'all') {
      toast.error('Please select a class to export the report');
      return;
    }

    setDownloading(true);
    setDlProgress('Preparing PDF report...');

    try {
      const params: Record<string, string> = { class_id: dlClassFilter };
      if (dlSectionFilter !== 'all') params.section_id = dlSectionFilter;

      const allFees = await fetchAllPendingFees(params);
      if (!allFees || allFees.length === 0) {
        toast.info('No pending fees found');
        return;
      }

      const byStudent: Record<string, any[]> = {};
      for (const fee of allFees) {
        const sid = fee.student_id || 'unknown';
        if (!byStudent[sid]) byStudent[sid] = [];
        byStudent[sid].push(fee);
      }

      const items = Object.entries(byStudent).map(([, studentFees]) => {
        const first = studentFees[0];
        const student = first.student || {};
        const studentUser = student.user || {};
        const section = student.section || {};
        const cls = section.class || {};
        const studentName = `${studentUser.first_name || studentUser.firstName || ''} ${studentUser.last_name || studentUser.lastName || ''}`.trim() || 'Student';
        const feeItems = studentFees.map((f: any) => ({
          title: f.title || f.fee_title || f.fee_structure?.name || f.description || 'Fee',
          amount: Math.max(0, parseFloat(f.amount || 0) + parseFloat(f.late_fee || 0) - parseFloat(f.paid_amount || 0) - parseFloat(f.discount_amount || 0)),
        })).filter((item: any) => item.amount > 0);
        const totalDue = feeItems.reduce((sum: number, item: any) => sum + item.amount, 0);
        return {
          studentName,
          admissionNumber: student.admission_number || student.admissionNumber || first.admission_number || 'N/A',
          rollNumber: student.roll_number || student.rollNumber || first.roll_number || undefined,
          className: cls.name || first.class_name || 'Unknown Class',
          sectionName: section.name || first.section_name || 'Unknown Section',
          parentName: student.father_name || studentUser.father_name || first.father_name || '',
          address: [student.address || first.address || '', student.city || first.city || '', student.state || first.state || '', student.pincode || first.pincode || ''].filter(Boolean).join(', '),
          totalDue,
          feeItems,
        };
      }).filter((item) => item.totalDue > 0);

      // Sort by roll number (ascending) so the report is in roll number order
      items.sort((a: any, b: any) => {
        const rollA = Number(a.rollNumber ?? Number.MAX_SAFE_INTEGER);
        const rollB = Number(b.rollNumber ?? Number.MAX_SAFE_INTEGER);
        return rollA - rollB;
      });

      if (!items.length) {
        toast.info('No pending dues found for this selection');
        return;
      }

      const schoolName = user?.school || 'School';
      const schoolAddress = user?.schoolAddress || '';
      const schoolPhone = user?.schoolPhone || '';
      const schoolEmail = user?.schoolEmail || '';
      const schoolWebsite = user?.schoolWebsite || '';
      const cls = classes.find(c => c.id === dlClassFilter);
      const sec = dlSections.find(s => s.id === dlSectionFilter);
      const title = `${cls?.name || 'Class'}${sec ? ` - ${sec.name}` : ''} Fee Report`;

      const blob = await generateCombinedFeeReportPdf({ schoolName, schoolAddress, schoolPhone, schoolEmail, schoolWebsite, title, items });

      const safeClass = (cls?.name || 'Class').replace(/[^a-zA-Z0-9]/g, '_');
      const safeSection = (sec?.name || 'All').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${safeClass}_${safeSection}_Fee_Report.pdf`;
      downloadBlob(blob, fileName);
      toast.success('Downloaded PDF report');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to export report');
      console.error(e);
    } finally {
      setDownloading(false);
      setDlProgress('');
      setDlProgressCount(0);
      setDlProgressTotal(0);
    }
  };

  // ── Shared due-slip item builder ─────────────────────────────────
  // Turns the raw grouped fee records for one student into a DueSlipData
  // object consumed by both the ZIP generator and the merge generator.
  const buildDueSlipItems = (studentFees: any[]): (DueSlipData & { studentNameForFile: string }) | null => {
    const first = studentFees[0];
    if (!first) return null;

    const student = first.student || {};
    const studentUser = student.user || {};
    const section = student.section || {};
    const cls = section.class || {};

    const firstName = studentUser.first_name || studentUser.firstName || '';
    const lastName = studentUser.last_name || studentUser.lastName || '';
    const studentName = `${firstName} ${lastName}`.trim()
      || student.name
      || first.student_name
      || first.studentName
      || 'Student';

    const className = cls.name || first.class_name || 'Unknown Class';
    const sectionName = section.name || first.section_name || 'Unknown Section';
    const fatherName = student.father_name || studentUser.father_name || first.father_name || '';

    const address = student.address || first.address || '';
    const cityState = [student.city || first.city || '', student.state || first.state || '', student.pincode || first.pincode || ''].filter(Boolean).join(', ');
    const fullAddress = [address, cityState].filter(Boolean).join(', ') || '';

    const dueMonthLabel = (() => {
      const dueDates = studentFees.map((f: any) => f.due_date || f.dueDate || '').filter(Boolean);
      if (dueDates.length) {
        const d = new Date(dueDates.sort().reverse()[0]);
        if (!isNaN(d.getTime())) return d.toLocaleString('default', { month: 'long', year: 'numeric' });
      }
      return new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    })();

    const feeItems = studentFees.map(f => ({
      title: f.title || f.fee_title || f.fee_structure?.name || f.description || 'Tuition Fee',
      amount: Math.max(0,
        parseFloat(f.amount || 0)
        + parseFloat(f.late_fee || 0)
        - parseFloat(f.paid_amount || 0)
        - parseFloat(f.discount_amount || 0)
      ),
    })).filter(item => item.amount > 0);

    const totalDue = feeItems.reduce((sum: number, i) => sum + i.amount, 0);
    if (totalDue <= 0) return null;

    const dueDateStr = studentFees.reduce((latest: string, f: any) => {
      const d = f.due_date || f.dueDate || '';
      return d > latest ? d : latest;
    }, '');

    return {
      schoolName: (user as any)?.school || 'School',
      schoolAddress: (user as any)?.schoolAddress || '',
      schoolPhone: (user as any)?.schoolPhone || '',
      schoolEmail: (user as any)?.schoolEmail || '',
      schoolWebsite: (user as any)?.schoolWebsite || '',
      studentName,
      admissionNumber: student.admission_number || student.admissionNumber || first.admission_number || 'N/A',
      rollNumber: student.roll_number || student.rollNumber || first.roll_number || undefined,
      className,
      sectionName,
      parentName: fatherName || undefined,
      address: fullAddress || undefined,
      dueMonth: dueMonthLabel,
      totalDue,
      dueDate: dueDateStr || 'N/A',
      feeItems,
      language: dlLanguage,
      studentNameForFile: studentName,
    };
  };

  // Groups fetched fee records by student and returns the shared list.
  const groupFeesByStudent = (allFees: any[]) => {
    const byStudent: Record<string, any[]> = {};
    for (const fee of allFees) {
      const sid = fee.student_id || 'unknown';
      if (!byStudent[sid]) byStudent[sid] = [];
      if (fee.status === 'pending' || fee.status === 'overdue') byStudent[sid].push(fee);
    }
    return byStudent;
  };

  // ── Individual slip download (ZIP) ───────────────────────────────
  // Now resilient: if one student's slip fails to render we SKIP it and
  // CONTINUE instead of aborting the whole batch. The toast reports how
  // many succeeded and how many were skipped.
  const handleDownloadDueSlips = async (mode: 'selected' | 'all') => {
    if (mode === 'selected' && dlClassFilter === 'all') {
      toast.error('Please select a class to download');
      return;
    }

    setDownloading(true);
    setDlProgress('Fetching pending fee data...');
    setDlProgressCount(0);
    setDlProgressTotal(0);

    try {
      const params: Record<string, string> = {};
      if (mode === 'selected') {
        params.class_id = dlClassFilter;
        if (dlSectionFilter !== 'all') params.section_id = dlSectionFilter;
      }

      const allFees = await fetchAllPendingFees(params);

      if (!allFees || allFees.length === 0) {
        toast.info('No pending fees found');
        return;
      }

      const byStudent = groupFeesByStudent(allFees);
      const entries = Object.values(byStudent).map(studentFees => buildDueSlipItems(studentFees)).filter((x): x is NonNullable<typeof x> => !!x);

      // Sort by roll number (ascending) so the PDFs are in roll number order
      entries.sort((a, b) => {
        const rollA = Number(a.rollNumber ?? Number.MAX_SAFE_INTEGER);
        const rollB = Number(b.rollNumber ?? Number.MAX_SAFE_INTEGER);
        return rollA - rollB;
      });

      if (entries.length === 0) {
        toast.info('No pending dues found for this selection');
        return;
      }

      setDlProgressTotal(entries.length);
      setDlProgress('Generating PDF slips...');

      const zip = new JSZip();
      const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');

      let successCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < entries.length; i++) {
        const item = entries[i];
        setDlProgressCount(i + 1);
        try {
          // Generate PDF blob for each student
          const blob = await generateDueSlipBlob({
            ...item,
            language: dlLanguage,
          });

          const safeClass = item.className.replace(/[^a-zA-Z0-9]/g, '_');
          const safeSection = item.sectionName.replace(/[^a-zA-Z0-9]/g, '_');
          const safeStudentName = item.studentNameForFile.replace(/[^a-zA-Z0-9]/g, '_');
          const filePath = mode === 'all'
            ? `Class_${safeClass}/Section_${safeSection}/${safeStudentName}_Due_Slip.pdf`
            : `${safeStudentName}_Due_Slip.pdf`;

          zip.file(filePath, blob);
          successCount++;
        } catch (e) {
          // Skip the failed student, don't abort the batch.
          skippedCount++;
          console.error(`[SLIP] Skipping ${item.studentNameForFile}:`, e);
        }
      }

      if (successCount === 0) {
        toast.error('All due slips failed to generate');
        return;
      }

      setDlProgress('Compressing ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const zipName = mode === 'all'
        ? `All_School_Due_Slips_${today}.zip`
        : (() => {
          const cls = classes.find(c => c.id === dlClassFilter);
          const sec = dlSections.find(s => s.id === dlSectionFilter);
          return sec
            ? `Class_${cls?.name}_${sec?.name}_Due_Slips_${today}.zip`
            : `Class_${cls?.name}_Due_Slips_${today}.zip`;
        })();

      downloadBlob(zipBlob, zipName);
      if (skippedCount > 0) {
        toast.warning(`Downloaded ${successCount} due slips (${skippedCount} skipped due to errors)`);
      } else {
        toast.success(`Downloaded ${successCount} due slips in ${zipName}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate due slips');
      console.error(e);
    } finally {
      setDownloading(false);
      setDlProgress('');
      setDlProgressCount(0);
      setDlProgressTotal(0);
    }
  };

  // ── Merge slips into ONE file ────────────────────────────────────
  // Merge = ONE PDF or DOCX where EVERY student gets their OWN full page
  // (50 students → ~50 pages). This is separate from the ZIP flow.
  const handleMergeDueSlips = async () => {
    setDownloading(true);
    setDlProgress(`Fetching pending fee data for merge...`);
    setDlProgressCount(0);
    setDlProgressTotal(0);

    try {
      // 'all' merges the whole school (same path as the whole-school ZIP);
      // otherwise only the selected class/section.
      const params: Record<string, string> = {};
      if (dlClassFilter !== 'all') {
        params.class_id = dlClassFilter;
        if (dlSectionFilter !== 'all') params.section_id = dlSectionFilter;
      }

      const allFees = await fetchAllPendingFees(params);
      if (!allFees || allFees.length === 0) {
        toast.info('No pending fees found');
        return;
      }

      const byStudent = groupFeesByStudent(allFees);
      const entries = Object.values(byStudent).map(studentFees => buildDueSlipItems(studentFees)).filter((x): x is NonNullable<typeof x> => !!x);

      // Sort by roll number (ascending) so the merged PDF pages are in roll number order
      entries.sort((a, b) => {
        const rollA = Number(a.rollNumber ?? Number.MAX_SAFE_INTEGER);
        const rollB = Number(b.rollNumber ?? Number.MAX_SAFE_INTEGER);
        return rollA - rollB;
      });

      if (entries.length === 0) {
        toast.info('No pending dues found for this selection');
        return;
      }

      setDlProgressTotal(entries.length);
      setDlProgress('Merging PDF slips...');

      // generateMergedDueSlipsPdf already skips failed slips internally.
      const pdfBlob = await generateMergedDueSlipsPdf(entries.map(({ studentNameForFile, ...rest }) => rest), (done, total, name) => {
        setDlProgressCount(done + 1);
        setDlProgress(`Merging page ${done + 1}/${total} — ${name}`);
      });
      const skipped = (pdfBlob as any)?._kautixSkipped || 0;
      const blob = pdfBlob;

      const cls = dlClassFilter !== 'all' ? classes.find(c => c.id === dlClassFilter) : null;
      const sec = dlSectionFilter !== 'all' ? dlSections.find(s => s.id === dlSectionFilter) : null;
      const safeClass = (cls?.name || 'All_School').replace(/[^a-zA-Z0-9]/g, '_');
      const safeSection = (sec?.name || 'All').replace(/[^a-zA-Z0-9]/g, '_');
      const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      const fileName = `${safeClass}${safeClass === 'All_School' ? '' : '_' + safeSection}_Merged_Due_Slips_${today}.pdf`;

      downloadBlob(blob, fileName);
      if (skipped > 0) {
        toast.warning(`Downloaded merged PDF with ${entries.length} pages (${skipped} skipped due to errors)`);
      } else {
        toast.success(`Downloaded merged PDF (${entries.length} pages — one per student)`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to merge due slips');
      console.error(e);
    } finally {
      setDownloading(false);
      setDlProgress('');
      setDlProgressCount(0);
      setDlProgressTotal(0);
    }
  };

  const selectedOp = OPERATIONS.find(o => o.id === operation)!;
  const dlProgressPct = dlProgressTotal > 0 ? Math.round((dlProgressCount / dlProgressTotal) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Bulk Operations</h1>
        <p className="text-sm text-gray-500 font-medium mt-1">Perform batch fee management operations across the school</p>
      </div>

      {/* ── Confirmation Dialog ── */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            {confirmType === 'already_done' ? (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                    <CalendarCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <DialogTitle className="text-lg font-black">Fees Already Generated</DialogTitle>
                </div>
                <DialogDescription className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-bold text-emerald-700">{monthlyStatus?.monthLabel}</span> fees have already been generated for{' '}
                  <span className="font-bold">{monthlyStatus?.count}</span> students (Due: {monthlyStatus?.dueDate}).
                  <br /><br />
                  Generating again will create <span className="font-bold text-red-600">duplicate fee entries</span> for students. Are you absolutely sure you want to proceed?
                </DialogDescription>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <DialogTitle className="text-lg font-black">Late Fee Generation</DialogTitle>
                </div>
                <DialogDescription className="text-sm text-gray-600 leading-relaxed">
                  Today is the <span className="font-bold">{new Date().getDate()}th</span> — past the recommended 5th-of-month cutoff for generating fees.
                  <br /><br />
                  Generating now means some parents may have already missed their due date notice. Consider adjusting the due date if needed. Do you want to continue?
                </DialogDescription>
              </>
            )}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row mt-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="rounded-xl h-11 flex-1">
              Cancel
            </Button>
            <Button
              onClick={executeGenerate}
              disabled={running}
              className={`rounded-xl h-11 flex-1 font-bold text-white ${confirmType === 'already_done' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
            >
              {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : confirmType === 'already_done' ? 'Yes, Generate Anyway' : 'Yes, Proceed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Fee Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {OPERATIONS.map(op => (
          <button key={op.id} onClick={() => setOperation(op.id)}
            className={`p-5 rounded-2xl text-left transition-all border-2 ${operation === op.id ? 'border-blue-600 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
            <div className={`w-10 h-10 rounded-xl ${operation === op.id ? 'bg-blue-600' : 'bg-gray-100'} flex items-center justify-center mb-3`}>
              <op.icon className={`w-5 h-5 ${operation === op.id ? 'text-white' : 'text-gray-500'}`} />
            </div>
            <p className={`font-black text-sm ${operation === op.id ? 'text-blue-700' : 'text-gray-900'}`}>{op.label}</p>
            <p className="text-xs text-gray-500 font-medium mt-1">{op.description}</p>
          </button>
        ))}
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest">Target Scope</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Class</Label>
              <Select value={classFilter} onValueChange={handleClassChange}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Section</Label>
              <Select value={sectionFilter} onValueChange={handleSectionChange} disabled={classFilter === 'all'}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {sections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {operation === 'generate' && (
            <div className="pt-2 border-t border-gray-100 space-y-4">

              {/* Monthly Status Banner */}
              <div className={`rounded-xl p-4 flex items-center gap-3 border ${checkingStatus
                ? 'bg-gray-50 border-gray-200'
                : monthlyStatus?.alreadyGenerated
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-amber-50 border-amber-200'
                }`}>
                {checkingStatus
                  ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin shrink-0" />
                  : monthlyStatus?.alreadyGenerated
                    ? <CalendarCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    : <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  {checkingStatus ? (
                    <p className="text-xs font-semibold text-gray-500">Checking {currentMonthLabel} status...</p>
                  ) : monthlyStatus?.alreadyGenerated ? (
                    <p className="text-xs font-bold text-emerald-700">
                      ✅ <strong>{monthlyStatus.monthLabel}</strong> fees generated for <strong>{monthlyStatus.count}</strong> students &nbsp;·&nbsp; Due: <strong>{monthlyStatus.dueDate}</strong>
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-700">
                      ⚠️ <strong>{currentMonthLabel}</strong> fees NOT yet generated — Click <strong>Generate Fees</strong> to create fees for all students
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Action: Generate Current Month Fees */}
              {!monthlyStatus?.alreadyGenerated && !checkingStatus && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-blue-900 mb-1">Generate {currentMonthLabel} Fees</p>
                      <p className="text-xs text-blue-700 font-medium mb-3">
                        Create fee dues for all active students based on their class fee structures and transport routes.
                      </p>
                      <Button
                        onClick={executeGenerate}
                        disabled={running}
                        className="h-10 px-6 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md w-full sm:w-auto"
                      >
                        {running ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                        ) : (
                          <><Zap className="w-4 h-4 mr-2" />Generate {currentMonthLabel} Fees Now</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Month Selector ── */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Select Month to Generate Fees</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <CalendarCheck className="w-4 h-4 mr-2 text-gray-500" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-500 font-medium">
                  Fees will be generated for <span className="font-bold text-gray-700">{monthOptions.find(m => m.value === selectedMonth)?.label}</span>
                </p>
              </div>

              {/* ── Fee Type Selector ── */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Fee Type to Generate</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setFeeType('both')}
                    className={`p-3 rounded-xl text-left transition-all border-2 ${feeType === 'both' ? 'border-blue-600 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${feeType === 'both' ? 'bg-blue-600' : 'bg-gray-100'} flex items-center justify-center mb-2`}>
                      <Layers className={`w-4 h-4 ${feeType === 'both' ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <p className={`font-black text-xs ${feeType === 'both' ? 'text-blue-700' : 'text-gray-900'}`}>Both</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">Tuition + Transport</p>
                  </button>
                  <button
                    onClick={() => setFeeType('tuition')}
                    className={`p-3 rounded-xl text-left transition-all border-2 ${feeType === 'tuition' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${feeType === 'tuition' ? 'bg-indigo-600' : 'bg-gray-100'} flex items-center justify-center mb-2`}>
                      <GraduationCap className={`w-4 h-4 ${feeType === 'tuition' ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <p className={`font-black text-xs ${feeType === 'tuition' ? 'text-indigo-700' : 'text-gray-900'}`}>Tuition</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">Fee structures only</p>
                  </button>
                  <button
                    onClick={() => setFeeType('transport')}
                    className={`p-3 rounded-xl text-left transition-all border-2 ${feeType === 'transport' ? 'border-amber-600 bg-amber-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${feeType === 'transport' ? 'bg-amber-600' : 'bg-gray-100'} flex items-center justify-center mb-2`}>
                      <Bus className={`w-4 h-4 ${feeType === 'transport' ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <p className={`font-black text-xs ${feeType === 'transport' ? 'text-amber-700' : 'text-gray-900'}`}>Transport</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">Route fees only</p>
                  </button>
                </div>
              </div>

              {/* Info box explaining what will happen */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 leading-relaxed">
                <p className="font-bold text-gray-800 mb-1">📋 How Generate Fees works:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Tuition</strong>: Reads all fee structures from <em>Finance → Structures</em> and pushes pending fees to eligible students</li>
                  <li><strong>Transport</strong>: Reads transport route fees (monthly/quarterly/annual) and pushes to students assigned to routes</li>
                  <li>Only generates for students who <strong>don't already have</strong> the fee this month — safe to click multiple times</li>
                  <li>Skips exempted students and sends in-app notifications to parents automatically</li>
                  <li>Uses <strong>batched inserts</strong> (500 rows at a time) — handles 5000+ student schools without crashing</li>
                </ul>
              </div>

              {/* ── Detailed Results Breakdown ── */}
              {genResult && (
                <div className="rounded-xl border-2 border-gray-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <p className="text-base font-black text-gray-900">Generation Results - {currentMonthLabel}</p>
                    </div>
                    {genResult.totalGenerated > 0 && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                        {genResult.totalGenerated} fees created
                      </Badge>
                    )}
                  </div>

                  {/* Summary stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total Generated</p>
                      <p className="text-2xl font-black text-blue-700 mt-1">{genResult.totalGenerated}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-100">
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Tuition Fees</p>
                      <p className="text-2xl font-black text-indigo-700 mt-1">{genResult.tuitionGenerated}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Transport Fees</p>
                      <p className="text-2xl font-black text-amber-700 mt-1">{genResult.transportGenerated}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Skipped</p>
                      <p className="text-2xl font-black text-gray-600 mt-1">{genResult.totalSkipped}</p>
                    </div>
                  </div>

                  {/* Metrics */}
                  {genResult.metrics && (
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Time Taken</p>
                        <p className="text-sm font-black text-gray-700 mt-1">
                          {(genResult.metrics.generationTimeMs / 1000).toFixed(1)}s
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Students Processed</p>
                        <p className="text-sm font-black text-gray-700 mt-1">{genResult.metrics.studentsProcessed}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Speed</p>
                        <p className="text-sm font-black text-gray-700 mt-0.5">{genResult.metrics.feesPerSec} fees/sec</p>
                      </div>
                    </div>
                  )}

                  {/* Per-structure breakdown */}
                  {genResult.details.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Fee Structures Generated</p>
                      <div className="max-h-60 overflow-y-auto space-y-1.5">
                        {genResult.details.map((detail, i) => (
                          <div key={i} className="flex items-center gap-2.5 text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                            {detail.startsWith('Tuition') ? (
                              <GraduationCap className="w-4 h-4 text-indigo-500 shrink-0" />
                            ) : detail.startsWith('Transport') ? (
                              <Bus className="w-4 h-4 text-amber-500 shrink-0" />
                            ) : (
                              <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                            )}
                            <span className="text-gray-700 font-medium flex-1">{detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {genResult.totalGenerated === 0 && (
                    <div className="flex items-center gap-3 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <p className="text-sm font-medium text-emerald-700">
                        All eligible students already have their <strong>{currentMonthLabel}</strong> fees. Nothing to generate — you're all caught up!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Generation History ── */}
              {genLogs.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-black text-gray-900">Generation History</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {genLogs.map((log: any) => (
                      <div key={log.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${log.status === 'completed' ? 'bg-emerald-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800">
                            {log.month} · {log.fee_type === 'both' ? 'Tuition + Transport' : log.fee_type === 'tuition' ? 'Tuition' : 'Transport'}
                            <span className="ml-2 text-gray-400 font-medium">
                              {log.triggered_by === 'cron' ? 'Auto' : 'Admin'}
                            </span>
                          </p>
                          <p className="text-[10px] text-gray-500 font-medium">
                            {log.total_generated} generated · {log.total_skipped} skipped · {log.failed_count} failed
                            {log.generation_time_ms ? ` · ${(log.generation_time_ms / 1000).toFixed(1)}s` : ''}
                            {log.fees_per_sec ? ` · ${log.fees_per_sec}/sec` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium shrink-0">
                          {new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button onClick={handleRun} disabled={running} className={`h-11 px-8 rounded-xl font-bold text-white shadow-lg ${selectedOp.color} w-full sm:w-auto`}>
              {running ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Running...</> : <><selectedOp.icon className="w-4 h-4 mr-2" />{selectedOp.label}</>}
            </Button>
            {result && (
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" /> {result}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Download Due Slips (ZIP) ── */}
      <Card className="border-none shadow-md bg-white">
        <CardHeader className="pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <FolderDown className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-base font-black text-gray-900">Download Fee Due Slips (ZIP)</CardTitle>
              <p className="text-xs text-gray-500 font-medium mt-0.5">Download individual PDF due slips organized by class → section in one ZIP</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">

          {/* ── Download Whole School ── */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <School className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-sm">Download Entire School</p>
                <p className="text-white/60 text-xs font-medium mt-0.5">All classes & sections — organized in folders</p>
                <p className="text-white/40 text-[10px] font-medium mt-1 font-mono">
                  📁 Class_8 / Section_A / Student_Due_Slip.pdf
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                onClick={() => handleDownloadDueSlips('all')}
                disabled={downloading}
                className="h-11 px-6 rounded-xl font-bold bg-white text-slate-800 hover:bg-white/90 shadow-lg shrink-0 w-full sm:w-auto"
              >
                {downloading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                  : <><FolderDown className="w-4 h-4 mr-2" />Download All School PDF</>
                }
              </Button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">or filter by class</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* ── Download Specific Class/Section ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Class *</Label>
              <Select value={dlClassFilter} onValueChange={handleDlClassChange}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select a class...</SelectItem>
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Section (optional)</Label>
              <Select value={dlSectionFilter} onValueChange={setDlSectionFilter} disabled={dlClassFilter === 'all'}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All Sections" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {dlSections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Slip Language</Label>
              <Select value={dlLanguage} onValueChange={(v) => setDlLanguage(v as any)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="hindi">हिन्दी (Hindi)</SelectItem>
                  <SelectItem value="bilingual">Bilingual (हिन्दी + English)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleDownloadDueSlips('selected')}
              disabled={downloading || dlClassFilter === 'all'}
              className="h-11 px-8 rounded-xl font-bold text-white shadow-lg bg-rose-600 hover:bg-rose-700"
            >
              {downloading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                : <><FolderDown className="w-4 h-4 mr-2" />Download Selected PDF</>
              }
            </Button>
            <Button
              onClick={() => handleMergeDueSlips()}
              disabled={downloading}
              className="h-11 px-6 rounded-xl font-bold text-white shadow-lg bg-indigo-600 hover:bg-indigo-700"
            >
              {downloading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Merging...</> : <><FileText className="w-4 h-4 mr-2" />Merge → One PDF</>}
            </Button>
            <Button
              onClick={() => handleExportFeeReport()}
              disabled={downloading || dlClassFilter === 'all'}
              variant="outline"
              className="h-11 px-6 rounded-xl font-bold border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {downloading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Preparing...</> : <><FileText className="w-4 h-4 mr-2" />Export PDF Report</>}
            </Button>
          </div>

          {/* ── Progress Bar ── */}
          {downloading && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-rose-500" />
                  {dlProgress}
                </span>
                {dlProgressTotal > 0 && (
                  <span className="text-xs font-black text-gray-700">{dlProgressCount}/{dlProgressTotal}</span>
                )}
              </div>
              {dlProgressTotal > 0 && (
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-rose-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${dlProgressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-rose-700">
              📁 <strong>ZIP Structure:</strong> Each PDF file is named after the student. When downloading the whole school, they are organized inside <code>Class_8/Section_A/</code> folders for easy browsing.
            </p>
            <p className="text-xs font-medium text-indigo-700">
              🧲 <strong>Merge (One PDF):</strong> Produces a SINGLE file where EVERY student gets their OWN full page — 50 students → 50 pages. Skipped slips (rendering errors) are reported but don't abort the batch.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-amber-50/50 border border-amber-100">
        <CardContent className="p-4">
          <p className="text-xs font-bold text-amber-700">⚠️ Bulk operations affect multiple students at once. All actions are logged in the audit trail and cannot be undone automatically.</p>
        </CardContent>
      </Card>
    </div>
  );
}
