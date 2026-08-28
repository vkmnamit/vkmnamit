import { useState, useEffect, Fragment } from 'react';
import { Link, useLocation, Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Search, Download, CreditCard, DollarSign, Clock, CheckCircle, AlertCircle, FileText, Plus, Users, ArrowUpRight, Shield, ShieldAlert, BadgeInfo, MoreVertical, X, Calendar, Edit, Loader2, Zap, Bell, Sparkles, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { openRazorpayCheckout } from '../../../lib/razorpay';
import { PaymentSuccessOverlay } from '../../components/payment/PaymentSuccessOverlay';
import { generateProfessionalReceipt, formatPaymentMethod } from '../../../lib/pdf';
import { ClassSectionFilter } from '../../components/ClassSectionFilter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { StudentSortFilter } from '../../components/StudentSortFilter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Label } from '../../components/ui/label';

export function FeesPage() {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.role === 'parent') {
    return <Navigate to="/dashboard/parent" replace />;
  }
  if (user?.role === 'student') {
    return <Navigate to="/dashboard/student" replace />;
  }

  const currentTab = location.pathname.includes('structures') ? 'structures' :
    location.pathname.includes('payments') ? 'history' : 'ledgers';

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [transportRoutes, setTransportRoutes] = useState<any[]>([]);
  const searchParams = new URLSearchParams(location.search);
  const initialStatus = searchParams.get('status') || 'all';

  const [sections, setSections] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState(initialStatus);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [filterAcademicYear, setFilterAcademicYear] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [stats, setStats] = useState<any>(null);
  const [globalTransactions, setGlobalTransactions] = useState<any[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Transaction Filters (for Payments tab)
  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [txClass, setTxClass] = useState('all');
  const [txSection, setTxSection] = useState('all');
  const [txPaymentMethod, setTxPaymentMethod] = useState('all');

  // Payment Success State
  const [successData, setSuccessData] = useState<{
    isOpen: boolean;
    amount: number;
    receiptNumber: string;
    studentName?: string;
    admissionNumber?: string;
    rollNumber?: string;
    classSection?: string;
    feeTitle?: string;
    balanceRemaining?: number;
    paymentMethod?: string;
    items?: { title: string; dueAmount: number; paidAmount: number; balance: number }[];
    globalBalance?: number;
    grandTotalDue?: number;
    grandTotalPaid?: number;
    grandBalance?: number;
  }>({
    isOpen: false,
    amount: 0,
    receiptNumber: ''
  });

  // Offline Payment State
  const [isClassFilterOpen, setIsClassFilterOpen] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState<string[]>([]);

  const toggleExpand = (studentId: string) => {
    setExpandedStudents(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const fmtShort = (n: number) => {
    if (!n) return '0';
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n}`;
  };

  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineMethod, setOfflineMethod] = useState('bank_transfer');
  const [offlineRemarks, setOfflineRemarks] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  const [bulkCollectModalOpen, setBulkCollectModalOpen] = useState(false);
  const [selectedBulkGroup, setSelectedBulkGroup] = useState<any>(null);
  const [bulkAmount, setBulkAmount] = useState('');

  // Fee Structure State
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [newStructure, setNewStructure] = useState({
    name: '',
    amount: '',
    frequency: 'monthly',
    appliesTo: 'all',
    classId: '',
    transportRouteId: '',
    dueDay: '10',
    isMandatory: true,
    pushImmediately: false
  });

  // Extra Fee State
  const [extraFeeModalOpen, setExtraFeeModalOpen] = useState(false);
  const [extraFeeData, setExtraFeeData] = useState<any>({
    studentId: '',
    title: '',
    amount: '',
    remarks: '',
    applyToSection: false,
    classId: '',
    sectionId: '',
  });
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedForHistory, setSelectedForHistory] = useState<any>(null);

  // Edit Fee Modal State (replaces window.prompt)
  const [editFeeModalOpen, setEditFeeModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [editFeeForm, setEditFeeForm] = useState({ title: '', amount: '', dueDate: '', status: '' });
  // Cumulative back-year dues keyed by student id: { total, breakdown:[{year, items, total}] }
  const [cumBackDues, setCumBackDues] = useState<Record<string, any>>({});
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [studentSort, setStudentSort] = useState('roll_asc');
  const [reminderScope, setReminderScope] = useState<'school' | 'class' | 'section'>('school');
  const [triggeringFeeGen, setTriggeringFeeGen] = useState(false);
  const [monthlyGenerationDialog, setMonthlyGenerationDialog] = useState<{
    open: boolean;
    mode: 'late' | 'already_generated';
    monthLabel: string;
    generatedCount?: number;
  }>({ open: false, mode: 'late', monthLabel: '' });

  const runMonthlyFeeGeneration = async () => {
    setTriggeringFeeGen(true);
    const t = toast.loading('Generating this month\'s fee records for all students...');
    try {
      const res = await api.triggerAutomation('fee_gen');
      toast.success(res?.message || 'Monthly fees generated & notifications dispatched to all students and parents!', { id: t, duration: 6000 });
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate fees', { id: t });
    } finally {
      setTriggeringFeeGen(false);
    }
  };

  const handleGenerateThisMonthFees = async () => {
    try {
      const status = await api.getMonthlyFeeGenerationStatus();
      if (status?.alreadyGenerated) {
        toast.info(`Already Generated: ${status.generatedCount || 0} fee records for ${status.monthLabel} already exist. No duplicate fees will be created.`);
        setMonthlyGenerationDialog({
          open: true,
          mode: 'already_generated',
          monthLabel: status.monthLabel || new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          generatedCount: status.generatedCount || 0,
        });
        return;
      }

      if (new Date().getDate() >= 5) {
        setMonthlyGenerationDialog({
          open: true,
          mode: 'late',
          monthLabel: status?.monthLabel || new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
        });
        return;
      }

      await runMonthlyFeeGeneration();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to check this month\'s fee status');
    }
  };

  const handleDownloadReceipt = async (txn: any, studentData?: any) => {
    const payment = txn.fee_payment || {};
    const student = studentData || txn.fee_payment?.student || {};
    const studentId = student?.id || payment?.student_id || txn.fee_payment?.student?.id;

    // Fetch ALL fees for the complete financial statement
    let allFeeItems: { title: string; dueAmount: number; paidAmount: number; balance: number; status: string }[] = [];
    let grandTotalDue = 0;
    let grandTotalPaid = 0;
    let grandBalance = 0;
    if (studentId) {
      try {
        const allFees = await api.getFees({ student_id: studentId, limit: 200 });
        const feeList = allFees.payments || allFees || [];
        const allMapped = (Array.isArray(feeList) ? feeList : []).map((f: any) => {
          const due = Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0);
          const paid = Number(f.paid_amount || 0);
          return {
            title: f.title || f.fee_structure?.name || 'Fee',
            dueAmount: due,
            paidAmount: paid,
            balance: Math.max(0, due - paid),
            status: f.status || 'pending',
            receiptNumber: f.receipt_number,
          };
        });

        // Breakdown table: only show unpaid/partial fees or fees from the current receipt
        allFeeItems = allMapped.filter((item: any) =>
          item.balance > 0 || (txn.receipt_number && item.receiptNumber === txn.receipt_number)
        );

        // Grand totals from filtered fees (for the summary box in the PDF)
        grandTotalDue  = allFeeItems.reduce((s, i) => s + i.dueAmount, 0);
        grandTotalPaid = allFeeItems.reduce((s, i) => s + i.paidAmount, 0);
        grandBalance   = allFeeItems.reduce((s, i) => s + i.balance, 0);
      } catch (_) {
        allFeeItems = txn.sub_items || [];
      }
    } else {
      allFeeItems = txn.sub_items || [];
    }

    generateProfessionalReceipt({
      schoolName: user?.school || 'School Management System',
      schoolAddress: user?.schoolAddress || 'School Address not set',
      schoolPhone: user?.schoolPhone || '',
      schoolEmail: user?.schoolEmail || '',
      receiptNumber: txn.receipt_number || `RCPT-${txn.id?.substring(0, 8).toUpperCase()}`,
      date: new Date(txn.created_at).toLocaleDateString(),
      studentName: student?.user ? `${student.user.first_name} ${student.user.last_name}` : 'Student',
      parentName: student?.father_name || student?.mother_name || 'N/A',
      admissionNumber: student?.admission_number || 'N/A',
      rollNumber: student?.roll_number || undefined,
      classSection: student?.section?.class?.name ? `${student.section.class.name} - ${student.section.name}` : 'N/A',
      feeTitle: payment.title || 'Fee Payment',
      amount: txn.amount,
      grandTotalDue,
      grandTotalPaid,
      grandBalance,
      items: allFeeItems,
      paymentMethod: txn.payment_method,
      transactionId: txn.receipt_number || txn.id?.substring(0, 10),
    });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchHistory = async (paymentId: string) => {
    try {
      const data = await api.getFeeTransactions(paymentId);
      setHistoryData(data || []);
      setHistoryModalOpen(true);
    } catch {
      toast.error('Failed to retrieve transaction history');
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterStatus, filterAcademicYear, filterClass, filterSection, debouncedSearch, txStartDate, txEndDate, txClass, txSection, txPaymentMethod]);

  // Fetch all students once for the extra fee modal dropdown
  useEffect(() => {
    if (user?.role === 'admin') {
      api.getStudents().then((res: any) => {
        setAllStudents(res.students || res || []);
      }).catch(() => { });
    }
  }, []);

  const autoSetYear = { done: false };
  const fetchData = async () => {
    try {
      // Only show loading skeleton on initial load, not on filter changes
      if (isInitialLoad) {
        setLoading(true);
      }

      const params: any = {};
      // CRITICAL FIX: Don't filter fees by status at API level
      // Instead, fetch ALL fees for the scope and filter client-side
      // This ensures we see all fees for each student
      if (filterAcademicYear !== 'all') params.academic_year_id = filterAcademicYear;

      // Re-enable class/section filtering with proper academic year handling
      if (filterClass !== 'all') params.class_id = filterClass;
      if (filterSection !== 'all') params.section_id = filterSection;

      if (debouncedSearch) params.search = debouncedSearch;
      params.limit = '1000'; // Always fetch more records

      // Debug logging
      console.log('Fetching fees with params:', params);

      // Stats params: exclude status filter to get accurate totals
      const statsParams: any = { ...params };
      delete statsParams.limit;
      delete statsParams.search;
      if (statsParams.search) delete statsParams.search;

      // Build student params matching the same filters (for enrolled students overlay)
      const studentParams: any = { limit: '9999', status: 'active' };
      if (filterAcademicYear !== 'all') studentParams.academic_year_id = filterAcademicYear;
      if (filterClass !== 'all') studentParams.class_id = filterClass;
      if (filterSection !== 'all') studentParams.section_id = filterSection;
      if (debouncedSearch) studentParams.search = debouncedSearch;

      const [paymentsData, statsData, structuresData, classesData, globalTxData, academicYearsData, routesData, enrolledData] = await Promise.all([
        api.getFees(params),
        api.getFeeStats(statsParams),
        user?.role === 'admin' ? api.getFeeStructures(filterAcademicYear !== 'all' ? { academic_year_id: filterAcademicYear } : undefined) : Promise.resolve([]),
        user?.role === 'admin' ? api.getClasses() : Promise.resolve([]),
        user?.role === 'admin' ? api.getAllFeeTransactions({
          start_date: txStartDate,
          end_date: txEndDate,
          class_id: txClass,
          section_id: txSection,
          payment_method: txPaymentMethod,
          academic_year_id: filterAcademicYear
        }) : Promise.resolve([]),
        user?.role === 'admin' ? api.getAcademicYears() : Promise.resolve([]),
        user?.role === 'admin' ? api.getTransportRoutes() : Promise.resolve([]),
        user?.role === 'admin' ? api.getStudents(studentParams) : Promise.resolve({ students: [] }),
      ]);

      // CRITICAL FIX: Fetch ALL pages of fee data to ensure no students are missing
      // The API returns paginated results, so we need to fetch all pages
      const allPayments: any[] = [];
      if (paymentsData.payments && paymentsData.payments.length > 0) {
        allPayments.push(...paymentsData.payments);

        // Get total count from API response
        const totalCount = paymentsData.total || 0;
        const fetchedCount = paymentsData.payments.length;
        const requestLimit = 1000; // Same as params.limit

        // If we fetched exactly the limit, there might be more pages
        if (fetchedCount >= requestLimit && allPayments.length < totalCount) {
          console.log(`[FeesPage] Fetching additional pages. Got ${allPayments.length} of ${totalCount} total`);

          // Fetch remaining pages in parallel (batch of 3 at a time for speed)
          let page = 2;
          const maxPages = Math.ceil(totalCount / requestLimit);

          while (page <= maxPages && allPayments.length < totalCount) {
            // Fetch up to 3 pages in parallel for better performance
            const pagePromises = [];
            for (let i = 0; i < 3 && page <= maxPages; i++) {
              pagePromises.push(api.getFees({ ...params, page: String(page) }));
              page++;
            }

            const pageResults = await Promise.all(pagePromises);
            let hasMore = false;

            pageResults.forEach((result: any) => {
              if (result.payments && result.payments.length > 0) {
                allPayments.push(...result.payments);
                hasMore = true;
              }
            });

            if (!hasMore) break;
          }

          console.log(`[FeesPage] Fetched all ${allPayments.length} payments across ${page - 1} pages`);
        }
      }

      const paymentsList = allPayments.length > 0 ? allPayments : (paymentsData.payments || []);
      setPayments(paymentsList);

      console.log(`[FeesPage] Total payments loaded: ${paymentsList.length}/${paymentsData.total || '?'}, filter: ${filterStatus}`);

      // CRITICAL FIX: When filtering by status (e.g., "paid"), we need to show ALL students
      // in the filtered scope, not just those with matching fee records.
      // The enrolled students list provides the complete student roster.
      const enrolledList = enrolledData?.students || enrolledData || [];
      setEnrolledStudents(enrolledList);

      console.log(`[FeesPage] Loaded ${paymentsList.length} payments, ${enrolledList.length} enrolled students, filter: ${filterStatus}`);
      console.log(`[FeesPage] Student IDs from enrolled:`, enrolledList.map(s => s.id).slice(0, 5));
      console.log(`[FeesPage] Payment student_ids:`, paymentsList.map(p => p.student_id).slice(0, 5));
      setStats(statsData || null);
      setStructures(structuresData || []);
      setClasses(classesData || []);
      setTransportRoutes(routesData || []);
      setGlobalTransactions(globalTxData || []);

      // ── Carry-forward back-dues: for a specific academic year, fetch the
      // cumulative register so the chart shows BOTH current fees and unresolved
      // back-year dues together (Kautix rules). Keyed by student id.
      let backDuesMap: Record<string, any> = {};
      if (user?.role === 'admin' || user?.role === 'teacher') {
        const regYearId = filterAcademicYear && filterAcademicYear !== 'all' ? filterAcademicYear : (academicYearsData || []).find((y: any) => y.is_current)?.id;
        if (regYearId) {
          try {
            const registerRes: any = await api.getFeeRegisterCumulative({
              academic_year_id: regYearId,
              ...(filterClass !== 'all' ? { class_id: filterClass } : {}),
              ...(filterSection !== 'all' ? { section_id: filterSection } : {}),
              ...(debouncedSearch ? { search: debouncedSearch } : {}),
            });
            const map: Record<string, any> = {};
            (registerRes?.students || []).forEach((r: any) => {
              if (r.student?.id) map[r.student.id] = r;
            });
            backDuesMap = map;
          } catch { /* non-fatal: register still renders current fees */ }
        }
      }
      setCumBackDues(backDuesMap);
      setAcademicYears(academicYearsData || []);
      // Only auto-set the academic year once (on first load), not on every subsequent fetch
      if (filterAcademicYear === 'all' && !autoSetYear.done) {
        const currentYear = (academicYearsData || []).find((year: any) => year.is_current || year.isCurrent);
        if (currentYear) {
          autoSetYear.done = true;
          setFilterAcademicYear(currentYear.id);
        }
      }

      // Extract all sections from classes
      const allSections: any[] = [];
      classesData?.forEach((c: any) => {
        c.sections?.forEach((s: any) => {
          allSections.push({ ...s, className: c.name });
        });
      });
      setSections(allSections);

      // Mark initial load as complete
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    } catch (err: any) {
      console.error('Failed to load fees', err);
      toast.error(`Failed to load financial records: ${err?.message || err?.error || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStructure = async () => {
    if (!newStructure.name || !newStructure.amount) {
      toast.error('Fee name and amount are required');
      return;
    }
    if (newStructure.appliesTo === 'class' && !newStructure.classId) {
      toast.error('Select the class this fee applies to');
      return;
    }
    if (newStructure.appliesTo === 'transport_route' && !newStructure.transportRouteId) {
      toast.error('Select the transport route this fee applies to');
      return;
    }
    try {
      const editingId = (window as any).__editingStructureId;
      if (editingId) {
        // Update existing structure
        await api.updateFeeStructure(editingId, {
          name: newStructure.name,
          amount: Number(newStructure.amount),
          frequency: newStructure.frequency,
          dueDay: Number(newStructure.dueDay),
          isMandatory: newStructure.isMandatory,
          classId: newStructure.appliesTo === 'class' ? newStructure.classId : null,
          transportRouteId: newStructure.appliesTo === 'transport_route' ? newStructure.transportRouteId : null,
          appliesTo: newStructure.appliesTo,
        });
        toast.success('Fee structure updated successfully');
        (window as any).__editingStructureId = null;
      } else {
        // Create new structure
        const currentYearId = academicYears.find((year: any) => year.is_current || year.isCurrent)?.id;
        const res = await api.createFeeStructure({
          ...newStructure,
          amount: Number(newStructure.amount),
          dueDay: Number(newStructure.dueDay),
          academicYearId: filterAcademicYear !== 'all' ? filterAcademicYear : currentYearId,
        });
        const count = res?.studentsAssigned || 0;
        toast.success(`Fee structure created & pushed to ${count} student${count !== 1 ? 's' : ''}!`);
      }
      setStructureModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save structure');
    }
  };

  const handleAddExtraFee = async () => {
    if (!extraFeeData.title || !extraFeeData.amount) {
      toast.error('Title and amount are required');
      return;
    }
    try {
      if (extraFeeData.applyToSection) {
        // Use bulkAssignFee to push to class/section
        const payload: any = {
          title: extraFeeData.title,
          amount: parseFloat(extraFeeData.amount),
          remarks: extraFeeData.remarks,
          targetType: extraFeeData.sectionId ? 'section' : (extraFeeData.classId ? 'class' : 'all'),
          targetId: extraFeeData.sectionId || extraFeeData.classId || undefined,
        };
        const res = await api.bulkAssignFee(payload);
        toast.success(res?.message || `Fee pushed to ${res?.count || 0} students!`);
      } else {
        if (!extraFeeData.studentId) { toast.error('Please select a student'); return; }
        await api.addExtraFee(extraFeeData);
        toast.success('Extra fee applied successfully');
      }
      setExtraFeeModalOpen(false);
      setExtraFeeData({ studentId: '', title: '', amount: '', remarks: '', applyToSection: false, classId: '', sectionId: '' });
      fetchData();
      api.invalidateStudentCache();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to apply extra fee');
    }
  };

  const handleExportCSV = () => {
    if (payments.length === 0 && enrolledStudents.length === 0) {
      toast.error('No data to export');
      return;
    }

    // Build grouped map same as the UI
    const groupedMap: Record<string, any> = {};
    payments.forEach(p => {
      if (!p.student_id) return;
      if (!groupedMap[p.student_id]) {
        groupedMap[p.student_id] = { student: p.student, items: [], total_amount: 0, total_paid: 0, total_pending: 0 };
      }
      groupedMap[p.student_id].items.push(p);
      const amount = Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0);
      const paid = Number(p.paid_amount || 0);
      groupedMap[p.student_id].total_amount += amount;
      groupedMap[p.student_id].total_paid += paid;
      groupedMap[p.student_id].total_pending += Math.max(0, amount - paid);
    });
    enrolledStudents.forEach(s => {
      if (!groupedMap[s.id]) {
        groupedMap[s.id] = { student: s, items: [], total_amount: 0, total_paid: 0, total_pending: 0 };
      }
    });

    // Sort: class → section → roll number
    const rows = Object.values(groupedMap).sort((a: any, b: any) => {
      const sa = a.student || {};
      const sb = b.student || {};
      const classA = sa.section?.class?.name || '';
      const classB = sb.section?.class?.name || '';
      if (classA !== classB) return classA.localeCompare(classB);
      const secA = sa.section?.name || '';
      const secB = sb.section?.name || '';
      if (secA !== secB) return secA.localeCompare(secB);
      const rollA = isNaN(Number(sa.roll_number)) ? 9999 : Number(sa.roll_number);
      const rollB = isNaN(Number(sb.roll_number)) ? 9999 : Number(sb.roll_number);
      return rollA - rollB;
    });

    // Build CSV
    const headers = [
      'Roll No', 'Student Name', 'Admission No', 'Class', 'Section',
      'Father Name', 'Mother Name', 'Phone', 'Address',
      'Fee Title', 'Fee Amount (₹)', 'Late Fee (₹)', 'Discount (₹)',
      'Total Due (₹)', 'Paid (₹)', 'Balance (₹)', 'Status', 'Due Date'
    ];

    const csvLines: string[] = [headers.join(',')];

    rows.forEach((group: any) => {
      const s = group.student || {};
      const name = s.user ? `${s.user.first_name || ''} ${s.user.last_name || ''}`.trim() : (s.admission_number || 'Unknown');
      const className = s.section?.class?.name || '';
      const sectionName = s.section?.name || '';
      const rollNo = s.roll_number || '';
      const admNo = s.admission_number || '';
      const fatherName = s.father_name || '';
      const motherName = s.mother_name || '';
      const phone = s.guardian_phone || s.user?.phone || '';
      const address = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ');

      if (group.items.length === 0) {
        // Student with no fees yet
        const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
        csvLines.push([
          esc(rollNo), esc(name), esc(admNo), esc(className), esc(sectionName),
          esc(fatherName), esc(motherName), esc(phone), esc(address),
          esc('—'), '0', '0', '0', '0', '0', '0', esc('No Fees'), esc('—')
        ].join(','));
      } else {
        group.items.forEach((p: any) => {
          const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
          const feeAmt = Number(p.amount || 0);
          const lateFee = Number(p.late_fee || 0);
          const discount = Number(p.discount_amount || 0);
          const totalDue = feeAmt + lateFee - discount;
          const paid = Number(p.paid_amount || 0);
          const balance = Math.max(0, totalDue - paid);
          csvLines.push([
            esc(rollNo), esc(name), esc(admNo), esc(className), esc(sectionName),
            esc(fatherName), esc(motherName), esc(phone), esc(address),
            esc(p.title || ''), String(feeAmt), String(lateFee), String(discount),
            String(totalDue), String(paid), String(balance),
            esc(p.status || ''), esc(p.due_date ? new Date(p.due_date).toLocaleDateString('en-IN') : '')
          ].join(','));
        });
      }
    });

    const csvContent = csvLines.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const yearLabel = academicYears.find((y: any) => y.id === filterAcademicYear)?.name || 'All';
    link.download = `Fee_Collection_${yearLabel}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} student records to CSV!`);
  };

  const handleExportGlobalLedgerCSV = () => {
    if (!globalTransactions || globalTransactions.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    const headers = [
      'Receipt No', 'Payment Date', 'Payment Method', 'Transaction Amount (₹)',
      'Fee Title', 'Total Fee Amount (₹)', 'Paid Amount (₹)', 'Late Fee (₹)', 'Discount (₹)',
      'Roll No', 'Student Name', 'Admission No', 'Class', 'Section',
      'Father Name', 'Mother Name', 'Phone', 'Address'
    ];

    const csvLines = [headers.join(',')];

    globalTransactions.forEach((txn: any) => {
      const p = txn.fee_payment || {};
      const s = p.student || {};

      const receiptNo = txn.receipt_number || txn.id?.substring(0, 8) || '';
      const paymentDate = txn.created_at ? new Date(txn.created_at).toLocaleString('en-IN') : '';
      const paymentMethod = (txn.payment_method || '').toUpperCase();
      const txAmount = txn.amount || 0;

      const feeTitle = p.title || '';
      const totalFeeAmt = p.amount || 0;
      const paidAmt = p.paid_amount || 0;
      const lateFee = p.late_fee || 0;
      const discount = p.discount_amount || 0;

      const name = s.user ? `${s.user.first_name || ''} ${s.user.last_name || ''}`.trim() : (s.admission_number || 'Unknown');
      const className = s.section?.class?.name || '';
      const sectionName = s.section?.name || '';
      const rollNo = s.roll_number || '';
      const admNo = s.admission_number || '';
      const fatherName = s.father_name || '';
      const motherName = s.mother_name || '';
      const phone = s.guardian_phone || s.user?.phone || '';
      const address = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ');

      const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;

      csvLines.push([
        esc(receiptNo), esc(paymentDate), esc(paymentMethod), String(txAmount),
        esc(feeTitle), String(totalFeeAmt), String(paidAmt), String(lateFee), String(discount),
        esc(rollNo), esc(name), esc(admNo), esc(className), esc(sectionName),
        esc(fatherName), esc(motherName), esc(phone), esc(address)
      ].join(','));
    });

    const csvContent = csvLines.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Global_Ledger_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${globalTransactions.length} transactions to CSV!`);
  };

  const handleSendReminders = async () => {
    const payload: any = {};
    if (reminderScope === 'section' && filterSection !== 'all') payload.section_id = filterSection;
    else if (reminderScope === 'class' && filterClass !== 'all') payload.class_id = filterClass;

    const label = reminderScope === 'school' ? 'whole school' : reminderScope === 'class' ? 'selected class' : 'selected section';
    const t = toast.loading(`Sending fee reminders (${label})...`);
    try {
      const res = await api.sendFeeReminders(payload);
      toast.success(res?.message || `Reminders sent to ${res?.sent || 0} families`, { id: t });
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reminders', { id: t });
    }
  };

  const handlePayment = async (payment: any) => {
    toast.info('Online payment integration is currently underway and will be available in the future. Please contact the School Admin to complete this payment.');
  };

  // Edit fee submit handler
  const handleEditFeeSubmit = async () => {
    if (!editingPayment) return;
    setProcessingPayment(true);
    try {
      await api.updateFeePayment(editingPayment.id, {
        title: editFeeForm.title,
        amount: Number(editFeeForm.amount),
        dueDate: editFeeForm.dueDate,
        status: editFeeForm.status,
      });
      toast.success('Fee updated successfully');
      setEditFeeModalOpen(false);
      setEditingPayment(null);
      fetchData();
      api.invalidateStudentCache();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update fee');
    } finally {
      setProcessingPayment(false);
    }
  };

  // Delete fee confirmation modal state (replaces window.confirm)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<any>(null);

  const handleConfirmDelete = async () => {
    if (!deletingPayment) return;
    setProcessingPayment(true);
    try {
      await api.deleteFeePayment(deletingPayment.id);
      toast.success('Fee deleted');
      setDeleteConfirmOpen(false);
      setDeletingPayment(null);
      fetchData();
      api.invalidateStudentCache();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete fee');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCollectOffline = async () => {
    if (!selectedPayment) return;
    setProcessingPayment(true);
    try {
      const res = await api.collectFee({
        paymentId: selectedPayment.id,
        amount: Number(offlineAmount),
        paymentMethod: offlineMethod,
        remarks: offlineRemarks,
      });
      toast.success('Manual payment recorded');
      setCollectModalOpen(false);
      setSuccessData({
        isOpen: true,
        amount: Number(offlineAmount),
        receiptNumber: res.receiptNumber,
        studentName: `${selectedPayment.student?.user?.first_name} ${selectedPayment.student?.user?.last_name}`,
        admissionNumber: selectedPayment.student?.admission_number || 'N/A',
        rollNumber: selectedPayment.student?.roll_number || undefined,
        classSection: selectedPayment.student?.section?.class?.name ? `${selectedPayment.student.section.class.name} - ${selectedPayment.student.section.name}` : 'N/A',
        feeTitle: selectedPayment.fee_structure?.name || selectedPayment.title || 'Fee Payment',
        balanceRemaining: res.globalBalanceRemaining || 0,
        paymentMethod: offlineMethod,
        globalBalance: res.globalBalanceRemaining || 0,
        grandTotalDue: res.grandTotalDue || 0,
        grandTotalPaid: res.grandTotalPaid || 0,
        grandBalance: res.grandBalance || 0,
        items: res.items || [],
      });
      fetchData();
      api.invalidateStudentCache();
    } catch (err: any) {
      toast.error(err.message || 'Failed to collect offline payment');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleBulkCollectOffline = async () => {
    if (!selectedBulkGroup || processingPayment) return;
    try {
      setProcessingPayment(true);

      const pendingItems = selectedBulkGroup.items.filter((p: any) => p.status !== 'paid');
      const paymentIds = pendingItems.map((p: any) => p.id);

      if (paymentIds.length === 0) {
        toast.error("No pending payments to collect.");
        return;
      }

      const res = await api.bulkCollectFee({
        paymentIds,
        amount: Number(bulkAmount),
        paymentMethod: offlineMethod,
        remarks: offlineRemarks,
      });

      toast.success('Bulk payment recorded');
      setBulkCollectModalOpen(false);

      const student = selectedBulkGroup.items[0]?.student;

      setSuccessData({
        isOpen: true,
        amount: Number(res.totalCollected),
        receiptNumber: res.receiptNumber,
        studentName: `${student?.user?.first_name} ${student?.user?.last_name}`,
        admissionNumber: student?.admission_number || 'N/A',
        rollNumber: student?.roll_number || undefined,
        classSection: student?.section?.class?.name ? `${student.section.class.name} - ${student.section.name}` : 'N/A',
        feeTitle: 'Bulk Fee Payment',
        balanceRemaining: res.globalBalanceRemaining || 0,
        paymentMethod: offlineMethod,
        globalBalance: res.globalBalanceRemaining || 0,
        grandTotalDue: res.grandTotalDue || 0,
        grandTotalPaid: res.grandTotalPaid || 0,
        grandBalance: res.grandBalance || 0,
        items: res.items || [],
      });

      fetchData();
      api.invalidateStudentCache();
    } catch (err: any) {
      toast.error(err.message || 'Failed to collect bulk offline payment');
    } finally {
      setProcessingPayment(false);
    }
  };

  if (loading && payments.length === 0) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">
      <PaymentSuccessOverlay
        isOpen={successData.isOpen}
        onClose={() => setSuccessData(prev => ({ ...prev, isOpen: false }))}
        amount={successData.amount}
        receiptNumber={successData.receiptNumber}
        studentName={successData.studentName}
        admissionNumber={successData.admissionNumber}
        rollNumber={successData.rollNumber}
        classSection={successData.classSection}
        feeTitle={successData.feeTitle}
        balanceRemaining={successData.grandBalance ?? successData.balanceRemaining ?? 0}
        schoolName={user?.school || 'School Management System'}
        schoolAddress={user?.schoolAddress || 'School Address not set'}
        schoolPhone={user?.schoolPhone || ''}
        schoolEmail={user?.schoolEmail || ''}
        paymentMethod={successData.paymentMethod}
        items={successData.items}
        globalBalance={successData.globalBalance}
        grandTotalDue={successData.grandTotalDue}
        grandTotalPaid={successData.grandTotalPaid}
        grandBalance={successData.grandBalance}
      />

      {/* Manual Payment Modal */}
      <Dialog open={collectModalOpen} onOpenChange={setCollectModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Manual Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Dues Outstanding</p>
              <p className="text-2xl font-black text-blue-900">₹{(selectedPayment?.amount - (selectedPayment?.paid_amount || 0)).toLocaleString()}</p>
            </div>
            <div className="grid gap-2">
              <Label>Amount to Record (₹)</Label>
              <Input
                type="number"
                value={offlineAmount}
                onChange={(e) => setOfflineAmount(e.target.value)}
                placeholder="Enter amount..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Payment Method</Label>
              <Select value={offlineMethod} onValueChange={setOfflineMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI / QR</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Transaction Notes</Label>
              <Input
                value={offlineRemarks}
                onChange={(e) => setOfflineRemarks(e.target.value)}
                placeholder="UTR No., Receipt ID etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectModalOpen(false)} disabled={processingPayment}>Cancel</Button>
            <Button onClick={handleCollectOffline} loading={processingPayment} className="bg-blue-600 hover:bg-blue-700">
              Submit Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Manual Payment Modal */}
      <Dialog open={bulkCollectModalOpen} onOpenChange={setBulkCollectModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Bulk Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Total Dues Outstanding</p>
              <p className="text-3xl font-black text-emerald-900">₹{(selectedBulkGroup?.total_pending || 0).toLocaleString()}</p>
              <p className="text-[10px] text-emerald-600 font-medium mt-1">
                Paying for {selectedBulkGroup?.items?.filter((p: any) => p.status !== 'paid').length || 0} pending fee items.
              </p>
            </div>

            <div className="grid gap-2 mt-2">
              <Label>Amount to Record (₹)</Label>
              <Input
                type="number"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                placeholder="Enter custom amount..."
              />
            </div>

            <div className="grid gap-2">
              <Label>Payment Method</Label>
              <Select value={offlineMethod} onValueChange={setOfflineMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI / QR</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Transaction Notes</Label>
              <Input
                value={offlineRemarks}
                onChange={(e) => setOfflineRemarks(e.target.value)}
                placeholder="UTR No., Receipt ID etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCollectModalOpen(false)} disabled={processingPayment}>Cancel</Button>
            <Button onClick={handleBulkCollectOffline} loading={processingPayment} className="bg-emerald-600 hover:emerald-700 text-white font-bold">
              Pay All Pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extra Fee Modal — with real student search & section targeting */}
      <Dialog open={extraFeeModalOpen} onOpenChange={setExtraFeeModalOpen}>
        <DialogContent className="sm:max-w-[520px] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Apply One-Off Charge</DialogTitle>
            <p className="text-xs text-gray-500 font-medium mt-1">Push a fee to a single student or an entire class/section</p>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            {/* Target Scope Toggle */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-bold">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  checked={extraFeeData.applyToSection || false}
                  onChange={(e) => setExtraFeeData({ ...extraFeeData, applyToSection: e.target.checked })}
                />
                Apply to entire class/section
              </label>
            </div>

            {extraFeeData.applyToSection ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Class</Label>
                  <Select value={extraFeeData.classId || ''} onValueChange={v => setExtraFeeData({ ...extraFeeData, classId: v, sectionId: '' })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Section (optional)</Label>
                  <Select value={extraFeeData.sectionId || ''} onValueChange={v => setExtraFeeData({ ...extraFeeData, sectionId: v })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All sections" /></SelectTrigger>
                    <SelectContent>
                      {classes.find((c: any) => c.id === extraFeeData.classId)?.sections?.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Target Student</Label>
                <Select value={extraFeeData.studentId} onValueChange={v => setExtraFeeData({ ...extraFeeData, studentId: v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select a student..." /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {allStudents.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.user?.first_name} {s.user?.last_name} — {s.section?.class?.name || ''} {s.section?.name || ''} ({s.admission_number || 'N/A'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Fee Title *</Label>
                <Input value={extraFeeData.title} onChange={e => setExtraFeeData({ ...extraFeeData, title: e.target.value })} placeholder="e.g. Transport, Uniform, Fine" className="h-11 rounded-xl" />
              </div>
              <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount (₹) *</Label>
                <Input type="number" value={extraFeeData.amount} onChange={e => setExtraFeeData({ ...extraFeeData, amount: e.target.value })} placeholder="0.00" className="h-11 rounded-xl" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Remarks</Label>
              <Input value={extraFeeData.remarks || ''} onChange={e => setExtraFeeData({ ...extraFeeData, remarks: e.target.value })} placeholder="Optional notes" className="h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraFeeModalOpen(false)} className="rounded-xl font-bold">Cancel</Button>
            <Button onClick={handleAddExtraFee} className="bg-gray-900 text-white rounded-xl font-bold">Apply Charge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={monthlyGenerationDialog.open}
        onOpenChange={(open) => setMonthlyGenerationDialog(current => ({ ...current, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {monthlyGenerationDialog.mode === 'already_generated' ? 'Monthly Fees Already Generated' : 'Generate Fees After the 5th?'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-slate-600">
            {monthlyGenerationDialog.mode === 'already_generated'
              ? `${monthlyGenerationDialog.generatedCount || 0} fee record${monthlyGenerationDialog.generatedCount === 1 ? '' : 's'} for ${monthlyGenerationDialog.monthLabel} already exist. You can still generate fees for students who are missing them (e.g. newly admitted students). No duplicates will be created.`
              : `Today is the 5th or later. Generate the pending ${monthlyGenerationDialog.monthLabel} fees only if this is an intentional late run.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMonthlyGenerationDialog(current => ({ ...current, open: false }))}>
              {monthlyGenerationDialog.mode === 'already_generated' ? 'Close' : 'Cancel'}
            </Button>
            {(monthlyGenerationDialog.mode === 'late' || monthlyGenerationDialog.mode === 'already_generated') && (
              <Button
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() => {
                  setMonthlyGenerationDialog(current => ({ ...current, open: false }));
                  runMonthlyFeeGeneration();
                }}
              >
                {monthlyGenerationDialog.mode === 'already_generated' ? 'Generate Missing Fees' : 'Generate Fees'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee Structure Modal */}
      <Dialog open={structureModalOpen} onOpenChange={setStructureModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Fee Structure</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Structure Name</Label>
                <Input value={newStructure.name} onChange={e => setNewStructure({ ...newStructure, name: e.target.value })} placeholder="e.g. Tuition Fee" />
              </div>
              <div className="grid gap-2">
                <Label>Amount (₹)</Label>
                <Input type="number" value={newStructure.amount} onChange={e => setNewStructure({ ...newStructure, amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Frequency</Label>
                <Select value={newStructure.frequency} onValueChange={v => setNewStructure({ ...newStructure, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="one_time">One-Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Apply Fee To</Label>
                <Select value={newStructure.appliesTo} onValueChange={v => setNewStructure({ ...newStructure, appliesTo: v, classId: '', transportRouteId: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ALL</span>
                        All Students (School-wide)
                      </div>
                    </SelectItem>
                    <SelectItem value="class">A Class</SelectItem>
                    <SelectItem value="transport_route">A Transport Route</SelectItem>
                  </SelectContent>
                </Select>
                {newStructure.appliesTo === 'all' && (
                  <p className="text-[11px] text-blue-600 font-medium">⚡ This fee will apply to <strong>all students</strong> in the school.</p>
                )}
              </div>
            </div>
            {newStructure.appliesTo === 'class' && (
              <div className="grid gap-2">
                <Label>Applicable Class</Label>
                <Select value={newStructure.classId} onValueChange={v => setNewStructure({ ...newStructure, classId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newStructure.appliesTo === 'transport_route' && (
              <div className="grid gap-2">
                <Label>Transport Route</Label>
                <Select value={newStructure.transportRouteId} onValueChange={v => setNewStructure({ ...newStructure, transportRouteId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a route" /></SelectTrigger>
                  <SelectContent>
                    {transportRoutes.map(route => (
                      <SelectItem key={route.id} value={route.id}>{route.name || route.route_name || `Route ${route.id.slice(0, 6)}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-emerald-700 font-medium">This recurring fee is assigned by the student's transport route, not their class or section.</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Due Day of Month</Label>
              <Input type="number" value={newStructure.dueDay} onChange={e => setNewStructure({ ...newStructure, dueDay: e.target.value })} placeholder="10" />
            </div>
            {new Date().getDate() > 5 && (
              <div className="flex items-center gap-2.5 p-3 bg-amber-50/70 border border-amber-200/50 rounded-xl mt-1">
                <input
                  type="checkbox"
                  id="pushImmediately"
                  checked={newStructure.pushImmediately}
                  onChange={e => setNewStructure({ ...newStructure, pushImmediately: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <Label htmlFor="pushImmediately" className="text-xs text-amber-800 font-bold cursor-pointer select-none leading-tight">
                  Generate current month dues for active students immediately (Late Enrollment)
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStructureModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateStructure} className="bg-blue-600">Save Structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            {['student', 'parent'].includes(user?.role || '') ? 'My Fees' : 'Digital Fee Logbook'}
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            {['student', 'parent'].includes(user?.role || '')
              ? 'Institutional financial ledger and secure payment gateway'
              : 'End-to-end financial oversight and transaction management'}
          </p>
        </div>
        {user?.role === 'admin' && (
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" className="h-11 px-5 rounded-xl font-bold text-xs border-gray-200 w-full sm:w-auto" onClick={() => setExtraFeeModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Apply Extra Charge
            </Button>
            <Button
              variant="outline"
              className="h-11 px-5 rounded-xl font-bold text-xs border-blue-200 text-blue-700 hover:bg-blue-50 w-full sm:w-auto"
              onClick={async () => {
                const t = toast.loading('Synchronizing dues...');
                try {
                  await api.syncFeeDues();
                  toast.success('Fee records synchronized', { id: t });
                  fetchData();
                } catch {
                  toast.error('Sync failed', { id: t });
                }
              }}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Sync All Dues
            </Button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={reminderScope} onValueChange={(v: any) => setReminderScope(v)}>
                <SelectTrigger className="h-11 rounded-xl flex-1 sm:w-36 text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">Whole School</SelectItem>
                  <SelectItem value="class">Current Class</SelectItem>
                  <SelectItem value="section">Current Section</SelectItem>
                </SelectContent>
              </Select>
              <Button className="bg-blue-600 hover:bg-blue-700 h-11 px-5 rounded-xl font-bold text-xs shrink-0" onClick={handleSendReminders}>
                <DollarSign className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Send Reminders</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      <Tabs value={currentTab} className="w-full">
        {/* Internal TabsList hidden because FinanceLayout handles top-level routing */}
        <div className="hidden">
          <TabsList>
            <TabsTrigger value="ledgers">Fee Register</TabsTrigger>
            <TabsTrigger value="history">Global Ledger</TabsTrigger>
            <TabsTrigger value="structures">Rule Configurations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ledgers" className="space-y-8">
          {/* Real-time Filters */}
          {user?.role === 'admin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm w-full">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-gray-400">Academic Year</Label>
                <Select value={filterAcademicYear} onValueChange={(val) => { setFilterAcademicYear(val); }}>
                  <SelectTrigger className="h-12 rounded-xl w-full"><SelectValue placeholder="All academic years" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Academic Years</SelectItem>
                    {academicYears.map((year: any) => (
                      <SelectItem key={year.id} value={year.id}>{year.name} {year.is_current || year.isCurrent ? '(Current)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-gray-400">Class</Label>
                <Select
                  value={filterClass}
                  onValueChange={(val) => {
                    setFilterClass(val);
                    setFilterSection('all');
                  }}
                >
                  <SelectTrigger className="h-12 rounded-xl w-full"><SelectValue placeholder="All Classes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-gray-400">Section</Label>
                <Select
                  value={filterSection}
                  onValueChange={(val) => { setFilterSection(val); }}
                  disabled={filterClass === 'all'}
                >
                  <SelectTrigger className="h-12 rounded-xl w-full"><SelectValue placeholder="All Sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {(classes.find((c: any) => c.id === filterClass)?.sections || []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-gray-400">Payment Status</Label>
                <Select value={filterStatus} onValueChange={(val) => { setFilterStatus(val); }}>
                  <SelectTrigger className="h-12 rounded-xl w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex items-end w-full">
                <StudentSortFilter value={studentSort} onChange={setStudentSort} />
              </div>
            </div>
          )}

          {/* Computed totals from loaded payments as a reliable fallback */}
          {(() => {
            const localTotal = payments.reduce((sum, p) => sum + (Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0)), 0);
            const localCollected = payments.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
            const localPending = Math.max(0, localTotal - localCollected);
            const localDefaulters = payments.filter(p => p.status === 'overdue').length;

            // Use stats from API, fall back to local computation when API returns 0
            const displayTotal = stats?.total || localTotal;
            const displayCollected = stats?.collected || localCollected;
            const displayPending = stats?.pending ?? (displayTotal - displayCollected);
            const displayDefaulters = stats?.defaulters ?? localDefaulters;
            const displayRate = displayTotal > 0 ? Math.round((displayCollected / displayTotal) * 100) : (stats?.rate || 0);

            const isFiltered = filterClass !== 'all' || filterSection !== 'all' || filterStatus !== 'all';

            return (
              <>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                  <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 mb-4">
                        <DollarSign className="w-6 h-6 text-blue-600" />
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Gross Expected</p>
                      <p className="text-2xl font-bold text-gray-900">{fmtShort(displayTotal)}</p>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 mb-4">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Collections</p>
                      <p className="text-2xl font-bold text-gray-900">{fmtShort(displayCollected)}</p>
                      <Badge className="bg-blue-50 text-blue-700 border-none font-bold text-[10px] mt-2">{displayRate}% collected</Badge>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center border border-red-100 mb-4">
                        <AlertCircle className="w-6 h-6 text-red-600" />
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pending Amount</p>
                      <p className="text-2xl font-bold text-gray-900">{fmtShort(displayPending)}</p>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100 mb-4">
                        <Clock className="w-6 h-6 text-purple-600" />
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Overdue Students</p>
                      <p className="text-2xl font-bold text-gray-900">{displayDefaulters}</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}


          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee Register — Student-wise</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-4 rounded-lg text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                  onClick={handleExportCSV}
                  title="Download fee collection as CSV (class-wise, roll number wise)"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV
                </Button>
              </div>
              <div className="overflow-x-auto w-full min-w-0">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Student & ID</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Class Info</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Fee Description</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider text-right">Total Due</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider text-right">Paid</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider text-right">Pending</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 tracking-wider text-right">Back Due</TableHead>
                      <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-center">Status</TableHead>
                      <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const groupedMap: Record<string, any> = {};
                      payments.forEach(p => {
                        if (!p.student_id) return;
                        if (!groupedMap[p.student_id]) {
                          groupedMap[p.student_id] = {
                            student: p.student,
                            items: [],
                            total_amount: 0,
                            total_paid: 0,
                            total_pending: 0,
                          };
                        }
                        groupedMap[p.student_id].items.push(p);
                        const amount = p.amount + Number(p.late_fee || 0) - Number(p.discount_amount || 0);
                        const paid = Number(p.paid_amount || 0);
                        groupedMap[p.student_id].total_amount += amount;
                        groupedMap[p.student_id].total_paid += paid;
                        groupedMap[p.student_id].total_pending += Math.max(0, amount - paid);
                      });

                      // ── Kautix carry-forward fix: ensure every student of the
                      // selected year appears in the register EVEN IF they have
                      // no current-year fee record yet — e.g. promoted students
                      // whose only outstanding money is prior-year dues.
                      // (Roster comes from the cumulative register which lists
                      // the full enrollment of that academic year.)
                      if (user?.role === 'admin' || user?.role === 'teacher') {
                        Object.values(cumBackDues).forEach((reg: any) => {
                          const sid = reg?.student?.id;
                          if (!sid || groupedMap[sid]) return;
                          // Prefer the full enrolled-student object (has user/section)
                          const full = enrolledStudents.find((s: any) => s.id === sid);
                          groupedMap[sid] = {
                            student: full || { ...reg.student },
                            items: [],
                            total_amount: 0,
                            total_paid: 0,
                            total_pending: 0,
                          };
                        });
                      }

                      // CRITICAL FIX: Only show students who have fee records
                      // OR unresolved back dues — students with neither stay out
                      // so the register remains clean and accurate
                      Object.keys(groupedMap).forEach(studentId => {
                        const group = groupedMap[studentId];
                        const backDue = Number(cumBackDues[studentId]?.backDues?.total || 0);
                        if (group.items.length === 0 && !(backDue > 0)) {
                          delete groupedMap[studentId];
                        }
                      });

                      // CRITICAL FIX: Client-side status filtering
                      // When a status filter is applied, filter the items array for each student
                      // and remove students who don't have fees matching the filter
                      if (filterStatus !== 'all') {
                        Object.keys(groupedMap).forEach(studentId => {
                          const group = groupedMap[studentId];

                          // Filter items by status
                          const filteredItems = group.items.filter((p: any) => p.status === filterStatus);

                          // If student has fees matching the filter, show only those
                          // If student has no fees matching filter, remove them from view
                          if (filteredItems.length > 0) {
                            group.items = filteredItems;
                            // Recalculate totals for filtered items
                            group.total_amount = filteredItems.reduce((sum: number, p: any) => sum + (Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0)), 0);
                            group.total_paid = filteredItems.reduce((sum: number, p: any) => sum + Number(p.paid_amount || 0), 0);
                            group.total_pending = filteredItems.reduce((sum: number, p: any) => {
                              const amount = Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0);
                              const paid = Number(p.paid_amount || 0);
                              return sum + Math.max(0, amount - paid);
                            }, 0);
                          } else {
                            // No matching fees - remove student from display,
                            // EXCEPT when filtering "pending" and the student
                            // still owes prior-year (back) dues.
                            const backDue = Number(cumBackDues[studentId]?.backDues?.total || 0);
                            if (!(filterStatus === 'pending' && backDue > 0)) {
                              delete groupedMap[studentId];
                            }
                          }
                        });
                      }

                      // Log for debugging
                      const withFees = Object.keys(groupedMap).filter(k => groupedMap[k].items.length > 0).length;
                      const withoutFees = Object.keys(groupedMap).filter(k => groupedMap[k].items.length === 0).length;
                      console.log(`[FeesPage] Register: ${withFees} students with fees, ${withoutFees} students without fees, total: ${Object.keys(groupedMap).length}, filter: ${filterStatus}`);

                      const groupedPayments = Object.values(groupedMap);
                      groupedPayments.sort((l: any, r: any) => {
                        const left = l.student || {};
                        const right = r.student || {};
                        if (studentSort === 'name_asc') {
                          const leftName = `${left.user?.first_name || ''} ${left.user?.last_name || ''}`.trim();
                          const rightName = `${right.user?.first_name || ''} ${right.user?.last_name || ''}`.trim();
                          return leftName.localeCompare(rightName);
                        }
                        if (studentSort === 'added_newest') {
                          return new Date(right.created_at || right.admission_date || 0).getTime() - new Date(left.created_at || left.admission_date || 0).getTime();
                        }
                        if (studentSort === 'added_oldest') {
                          return new Date(left.created_at || left.admission_date || 0).getTime() - new Date(right.created_at || right.admission_date || 0).getTime();
                        }
                        const leftRoll = left.roll_number != null && left.roll_number !== '' && !isNaN(Number(left.roll_number)) ? Number(left.roll_number) : Number.MAX_SAFE_INTEGER;
                        const rightRoll = right.roll_number != null && right.roll_number !== '' && !isNaN(Number(right.roll_number)) ? Number(right.roll_number) : Number.MAX_SAFE_INTEGER;
                        const rollDifference = leftRoll - rightRoll;
                        return studentSort === 'roll_desc' ? -rollDifference : rollDifference;
                      });

                      if (groupedPayments.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={9} className="py-20 text-center">
                              <p className="text-sm text-gray-400 font-bold">No financial records detected in the logbook.</p>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return groupedPayments.map((group: any) => {
                        const s = group.student;
                        const isExpanded = expandedStudents.includes(s.id);
                        const isFullyPaid = group.total_pending === 0;
                        // Carry-forward back-year dues (from cumulative register)
                        const backTotal = cumBackDues[s.id]?.backDues?.total || 0;
                        const firstBackYear = cumBackDues[s.id]?.backDues?.breakdown?.[0]?.year;

                        return (
                          <Fragment key={s.id}>
                            <TableRow className="hover:bg-gray-50/50 cursor-pointer border-b border-gray-100 transition-colors" onClick={() => toggleExpand(s.id)}>
                              <TableCell className="py-4 px-8">
                                <div className="flex items-center gap-4">
                                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs uppercase">
                                    {s.user?.first_name?.[0] || '?'}{s.user?.last_name?.[0] || '?'}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-gray-900">
                                      {s.user?.first_name && s.user?.last_name
                                        ? `${s.user.first_name} ${s.user.last_name}`
                                        : s.admission_number || 'Unknown Student'}
                                    </p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                      Roll: {s.roll_number ?? 'N/A'} · ID: {s.admission_number || 'N/A'}
                                    </p>
                                    {(s.father_name || s.mother_name) && (
                                      <p className="text-[10px] font-medium text-slate-500">
                                        Parent: <span className="font-bold text-slate-700">{s.father_name || s.mother_name}</span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 px-6">
                                <div>
                                  <p className="text-sm font-bold text-gray-700">{s.section?.class?.name || 'N/A'}</p>
                                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">{s.section?.name || 'N/A'}</p>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 px-6">
                                <Badge className="bg-gray-100 text-gray-600 border-none font-bold">{group.items.length} Pending Fees</Badge>
                              </TableCell>
                              <TableCell className="py-4 px-6 text-right font-bold text-gray-900">₹{group.total_amount.toLocaleString()}</TableCell>
                              <TableCell className="py-4 px-6 text-right font-bold text-emerald-600">₹{group.total_paid.toLocaleString()}</TableCell>
                              <TableCell className="py-4 px-6 text-right font-black text-red-600">₹{group.total_pending.toLocaleString()}</TableCell>
                              <TableCell className="py-4 px-6 text-right font-bold text-orange-600" title={firstBackYear ? `Back year due (${firstBackYear})` : 'Back year due'}>₹{backTotal.toLocaleString()}</TableCell>
                              <TableCell className="py-4 px-6 text-center">
                                <Badge className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${isFullyPaid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                  {isFullyPaid ? 'Paid' : 'Pending'}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4 px-8 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {!isFullyPaid && user?.role === 'admin' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-4 rounded-xl text-xs font-bold bg-gray-900 text-white hover:bg-gray-800 hover:text-white border-0 shadow-md shadow-gray-900/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedBulkGroup(group);
                                        setBulkAmount(String(group.total_pending));
                                        setOfflineMethod('upi');
                                        setOfflineRemarks('');
                                        setBulkCollectModalOpen(true);
                                      }}
                                    >
                                      Pay All
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); toggleExpand(s.id); }}>
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded && group.items.map((p: any) => (
                              <TableRow key={p.id} className="bg-gray-50/40 border-b border-gray-100">
                                <TableCell colSpan={2} className="py-3 px-8 pl-16">
                                  <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-300"></div>
                                    <div>
                                      <p className="font-semibold text-gray-800 text-xs">{p.title || p.fee_structure?.name || 'Manual Fee'}</p>
                                      <p className="text-[10px] text-gray-500 max-w-[200px] truncate" title={p.remarks}>{p.remarks || '-'}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 px-6"></TableCell>
                                <TableCell className="py-3 px-6 text-right font-semibold text-gray-700 text-xs">
                                  ₹{(p.amount + Number(p.late_fee || 0) - Number(p.discount_amount || 0)).toLocaleString()}
                                </TableCell>
                                <TableCell className="py-3 px-6 text-right font-semibold text-emerald-600 text-xs">
                                  ₹{(p.paid_amount || 0).toLocaleString()}
                                </TableCell>
                                <TableCell className="py-3 px-6 text-right font-bold text-red-500 text-xs">
                                  ₹{Math.max(0, ((p.amount + Number(p.late_fee || 0) - Number(p.discount_amount || 0)) - (p.paid_amount || 0))).toLocaleString()}
                                </TableCell>
                                <TableCell className="py-3 px-6"></TableCell>
                                <TableCell className="py-3 px-6 text-center">
                                  <Badge className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm border-none ${p.status === 'paid' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                    {p.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-3 px-8 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {p.status !== 'paid' && user?.role === 'admin' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-3 rounded text-[10px] font-bold bg-white"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPayment(p);
                                          setOfflineAmount(String(p.amount - (p.paid_amount || 0)));
                                          setCollectModalOpen(true);
                                        }}
                                      >
                                        Pay
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 rounded"
                                      title="View Transaction History"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedForHistory(p);
                                        fetchHistory(p.id);
                                      }}
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                    </Button>
                                    {user?.role === 'admin' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600 rounded"
                                        title="Edit fee"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingPayment(p);
                                          setEditFeeForm({
                                            title: p.title || p.fee_structure?.name || 'Fee',
                                            amount: String(p.amount || 0),
                                            dueDate: p.due_date || '',
                                            status: p.status || 'pending',
                                          });
                                          setEditFeeModalOpen(true);
                                        }}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                    {user?.role === 'admin' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600 rounded"
                                        title="Delete fee"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeletingPayment(p);
                                          setDeleteConfirmOpen(true);
                                        }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {isExpanded && (cumBackDues[s.id]?.backDues?.breakdown || []).map((bd: any) =>
                              (bd.items || []).map((bi: any) => (
                                <TableRow key={bi.id} className="bg-orange-50/40 border-b border-orange-100">
                                  <TableCell colSpan={2} className="py-3 px-8 pl-16">
                                    <div className="flex items-center gap-3">
                                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                                      <div>
                                        <p className="font-semibold text-gray-800 text-xs">{bi.title || bi.category}</p>
                                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-tight">Back Due · {bi.academic_year_name}</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3 px-6"></TableCell>
                                  <TableCell className="py-3 px-6 text-right font-semibold text-gray-700 text-xs">₹{bi.amount.toLocaleString()}</TableCell>
                                  <TableCell className="py-3 px-6 text-right font-semibold text-emerald-600 text-xs">₹{bi.paid.toLocaleString()}</TableCell>
                                  <TableCell className="py-3 px-6 text-right font-bold text-orange-600 text-xs">₹{bi.balance.toLocaleString()}</TableCell>
                                  <TableCell className="py-3 px-6"></TableCell>
                                  <TableCell className="py-3 px-6 text-center">
                                    <Badge className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm border-none bg-orange-100 text-orange-700">Back</Badge>
                                  </TableCell>
                                  <TableCell className="py-3 px-8 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {bi.balance > 0 && user?.role === 'admin' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-6 px-3 rounded text-[10px] font-bold bg-white text-orange-600 border-orange-200"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedPayment({ id: bi.id, amount: bi.amount, paid_amount: bi.paid, title: bi.title, status: bi.status, due_date: '' });
                                            setOfflineAmount(String(bi.balance));
                                            setCollectModalOpen(true);
                                          }}
                                        >
                                          Pay
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </Fragment>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Edit Fee Modal */}
          <Dialog open={editFeeModalOpen} onOpenChange={setEditFeeModalOpen}>
            <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-black">Edit Fee</DialogTitle>
                <p className="text-xs text-gray-500 font-medium">
                  {editingPayment?.student?.user?.first_name} {editingPayment?.student?.user?.last_name} — {editingPayment?.title || 'Fee'}
                </p>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Fee Title</Label>
                  <Input value={editFeeForm.title} onChange={(e) => setEditFeeForm(f => ({ ...f, title: e.target.value }))} className="h-11 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount (₹)</Label>
                    <Input type="number" min="0" value={editFeeForm.amount} onChange={(e) => setEditFeeForm(f => ({ ...f, amount: e.target.value }))} className="h-11 rounded-xl font-mono" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</Label>
                    <Select value={editFeeForm.status} onValueChange={(v) => setEditFeeForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Due Date</Label>
                  <Input type="date" value={editFeeForm.dueDate} onChange={(e) => setEditFeeForm(f => ({ ...f, dueDate: e.target.value }))} className="h-11 rounded-xl" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditFeeModalOpen(false)} className="rounded-xl font-bold">Cancel</Button>
                <Button onClick={handleEditFeeSubmit} disabled={processingPayment} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">
                  {processingPayment ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Modal */}
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-black flex items-center gap-2 text-red-600">
                  <Trash2 className="w-5 h-5" /> Delete Fee?
                </DialogTitle>
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete <strong>{deletingPayment?.title || 'this fee'}</strong> for{' '}
                  <strong>{deletingPayment?.student?.user?.first_name || ''} {deletingPayment?.student?.user?.last_name || ''}</strong>?
                  This action cannot be undone.
                </p>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} className="rounded-xl font-bold">Cancel</Button>
                <Button onClick={handleConfirmDelete} disabled={processingPayment} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold">
                  {processingPayment ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</> : 'Delete Fee'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Transaction History Modal */}
          <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
            <DialogContent className="sm:max-w-[550px] rounded-[32px] overflow-hidden p-0 border-none shadow-2xl">
              <div className="bg-emerald-600 p-8 text-white relative">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <FileText className="w-32 h-32 rotate-12" />
                </div>
                <div className="relative z-10">
                  <Badge className="bg-white/20 text-white border-none mb-4 backdrop-blur-md">Digital Ledger v2.0</Badge>
                  <DialogTitle className="text-3xl font-black tracking-tight text-white">Transaction History</DialogTitle>
                  <p className="text-emerald-100 font-medium mt-1">Audit log for {selectedForHistory?.student?.user?.first_name}'s record</p>
                </div>
              </div>

              <div className="p-8 space-y-6 bg-white">
                {historyData.length > 0 ? (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {historyData.map((txn, idx) => (
                      <div key={txn.id} className="p-5 bg-gray-50 rounded-[24px] border border-gray-100 flex items-center justify-between group hover:bg-emerald-50/50 hover:border-emerald-100 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xs font-bold text-emerald-600 border border-gray-100 group-hover:scale-110 transition-transform">
                            #{historyData.length - idx}
                          </div>
                          <div>
                            <p className="text-base font-black text-gray-900">₹{txn.amount.toLocaleString()}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(txn.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <div>
                            <Badge className="bg-emerald-100 text-emerald-700 border-none text-[9px] font-black uppercase px-2 py-0.5 rounded-md mb-1">{formatPaymentMethod(txn.payment_method)}</Badge>
                            <p className="text-[10px] font-bold text-gray-400">ID: {txn.receipt_number}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-lg border-gray-200 text-blue-600 hover:bg-blue-50" onClick={() => handleDownloadReceipt(txn, selectedForHistory?.student)}>
                            <Download className="w-3 h-3 mr-1" /> Receipt
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <AlertCircle className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-bold">No ledger entries found.</p>
                    <p className="text-[10px] text-gray-300 uppercase font-black mt-1 tracking-widest">Awaiting First Transaction</p>
                  </div>
                )}

                <Button onClick={() => setHistoryModalOpen(false)} className="w-full h-12 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold transition-all shadow-xl shadow-gray-900/10">
                  Close Digital Ledger
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="py-6 px-8 border-b border-gray-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Global Institutional Ledger</CardTitle>
                <p className="text-xs text-gray-400 font-medium">Consolidated record of all financial inflows</p>
              </div>
              <Button variant="outline" className="h-9 px-4 rounded-lg text-xs font-bold" onClick={handleExportGlobalLedgerCSV}>
                <Download className="w-3.5 h-3.5 mr-2" />
                Export Ledger
              </Button>
            </CardHeader>

            {/* Filter Toolbar for Payments Tab */}
            {user?.role === 'admin' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-gray-50/50 p-4 border-b border-gray-100 w-full">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-gray-400">Start Date</Label>
                  <Input type="date" value={txStartDate} onChange={e => setTxStartDate(e.target.value)} className="h-10 rounded-xl w-full bg-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-gray-400">End Date</Label>
                  <Input type="date" value={txEndDate} onChange={e => setTxEndDate(e.target.value)} className="h-10 rounded-xl w-full bg-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-gray-400">Payment Method</Label>
                  <Select value={txPaymentMethod} onValueChange={setTxPaymentMethod}>
                    <SelectTrigger className="h-10 rounded-xl w-full bg-white"><SelectValue placeholder="All Methods" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Methods</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-gray-400">Class</Label>
                  <Select value={txClass} onValueChange={(val) => { setTxClass(val); setTxSection('all'); }}>
                    <SelectTrigger className="h-10 rounded-xl w-full bg-white"><SelectValue placeholder="All Classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes.map((cls: any) => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-gray-400">Section</Label>
                  <Select value={txSection} onValueChange={setTxSection} disabled={txClass === 'all'}>
                    <SelectTrigger className="h-10 rounded-xl w-full bg-white"><SelectValue placeholder="All Sections" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {sections.filter((s: any) => s.class_id === txClass).map((sec: any) => (
                        <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400">Date & Receipt</TableHead>
                    <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400">Student</TableHead>
                    <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400">Method</TableHead>
                    <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* We need to fetch this data. I'll add it to the fetchData call */}
                  {(globalTransactions || []).map((txn: any) => (
                    <TableRow key={txn.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="py-4 px-8">
                        <p className="text-sm font-bold">{new Date(txn.created_at).toLocaleDateString()}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">#{txn.receipt_number}</p>
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <p className="text-sm font-bold">{txn.fee_payment?.student?.user?.first_name} {txn.fee_payment?.student?.user?.last_name}</p>
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <Badge variant="secondary" className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                          {formatPaymentMethod(txn.payment_method)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 px-8 text-right font-black text-emerald-600 flex items-center justify-end gap-3">
                        ₹{txn.amount.toLocaleString()}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => handleDownloadReceipt(txn)}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!globalTransactions || globalTransactions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-20 text-center text-gray-400 font-bold">
                        No global ledger entries found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structures">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="py-6 px-8 flex flex-row items-center justify-between border-b border-gray-50">
              <div>
                <CardTitle className="text-lg font-bold">Rule Configurations</CardTitle>
                <p className="text-xs text-gray-400 font-medium">Automatic generation rules for all students</p>
              </div>
              <Button onClick={() => setStructureModalOpen(true)} className="bg-gray-900 text-white h-9 px-4 rounded-lg text-xs font-bold">
                <Plus className="w-3.5 h-3.5 mr-2" />
                New Structure
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/30">
                  <TableRow>
                    <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400">Structure Name</TableHead>
                    <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-center">Frequency</TableHead>
                    <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-center">Amount</TableHead>
                    <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-center">Due Day</TableHead>
                    <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {structures.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="py-4 px-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                            <DollarSign className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-sm">{s.name}</p>
                            <p className="text-[10px] font-bold text-gray-400">
                              {s.class?.name ? `Class: ${s.class.name}` : <span className="text-blue-500">⚡ All Students (School-wide)</span>}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-center font-bold text-blue-600 text-[10px] uppercase">{s.frequency}</TableCell>
                      <TableCell className="py-4 px-6 text-center font-black">₹{s.amount.toLocaleString()}</TableCell>
                      <TableCell className="py-4 px-6 text-center font-medium text-gray-500">{s.due_day}th</TableCell>
                      <TableCell className="py-4 px-8 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600 rounded-lg"
                            title="Edit structure"
                            onClick={() => {
                              setNewStructure({
                                name: s.name || '',
                                amount: String(s.amount || ''),
                                frequency: s.frequency || 'monthly',
                                appliesTo: s.applies_to || 'all',
                                classId: s.class_id || '',
                                transportRouteId: s.transport_route_id || '',
                                dueDay: String(s.due_day || 10),
                                isMandatory: s.is_mandatory !== false,
                                pushImmediately: false,
                              });
                              setStructureModalOpen(true);
                              // Store the editing ID for update
                              (window as any).__editingStructureId = s.id;
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 rounded-lg"
                            title="Delete structure"
                            onClick={async () => {
                              if (window.confirm(`Delete fee structure "${s.name}"? This will also remove all pending/overdue fees linked to it.`)) {
                                try {
                                  await api.deleteFeeStructure(s.id);
                                  toast.success('Fee structure deleted');
                                  fetchData();
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to delete structure');
                                }
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
