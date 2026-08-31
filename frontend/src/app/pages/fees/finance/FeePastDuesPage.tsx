import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { toast } from 'sonner';
import { Users, Save, FileSpreadsheet, Loader2, Download, FolderDown, CheckCircle2, Clock, AlertTriangle, Pencil, Trash2, ListChecks } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../context/AuthContext';
import { downloadBlob, generateDueSlipBlob } from '../../../../lib/pdf';
import JSZip from 'jszip';
import { StudentSortFilter, sortStudentsArray } from '../../../components/StudentSortFilter';

const API_PAGE_SIZE = 500;
const SAVE_CHUNK_SIZE = 500;
const REGISTER_PAGE_SIZE = 100;

const getAllPages = async (fetchPage: (page: number) => Promise<any>, collectionKey: 'students' | 'payments') => {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const response = await fetchPage(page);
    const rows: any[] = response?.[collectionKey] ?? (Array.isArray(response) ? response : []);
    all.push(...rows);
    const total = Number(response?.total ?? rows.length);
    if (rows.length < API_PAGE_SIZE || all.length >= total) break;
    page += 1;
  }
  return all;
};

const cleanCell = (value: unknown) => String(value ?? '').trim();

const normalizeColumnName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const getExcelCell = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedRow: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    normalizedRow[normalizeColumnName(key)] = value;
  });
  for (const alias of aliases) {
    const value = normalizedRow[normalizeColumnName(alias)];
    if (value !== undefined && value !== null && cleanCell(value) !== '') return value;
  }
  return '';
};

const buildDynamicFeeTitle = (row: Record<string, unknown>) => {
  const explicitTitle = cleanCell(getExcelCell(row, ['Title', 'Fee Title', 'Description']));
  if (explicitTitle) return explicitTitle;

  const description = cleanCell(getExcelCell(row, ['Fee Description', 'Fee Name', 'Fee Type']));
  const month = cleanCell(getExcelCell(row, ['Due Month', 'Month', 'Fee Month']));
  const className = cleanCell(getExcelCell(row, ['Class', 'Class Name']));
  const sectionName = cleanCell(getExcelCell(row, ['Section', 'Section Name']));
  const classLabel = className ? (sectionName ? `${className} - ${sectionName}` : className) : (sectionName || '');

  if (description && month) return `${description} - ${month}`;
  if (description) return description;
  if (month) return `Monthly Fee - ${month}`;
  if (classLabel) return `Past Dues (${classLabel})`;
  return 'Past Dues (Arrears)';
};

export function FeePastDuesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [admissionSearch, setAdmissionSearch] = useState('');
  const [studentSort, setStudentSort] = useState('roll_asc');
  const [feesByStudent, setFeesByStudent] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [slipLanguage, setSlipLanguage] = useState<'english' | 'hindi' | 'bilingual'>('english');
  const [registerPage, setRegisterPage] = useState(1);

  // Past dues upload state
  const [duesState, setDuesState] = useState<Record<string, { amount: string, title: string }>>({});

  // Whole-school bulk past dues
  const [bulkScope, setBulkScope] = useState<'class' | 'all'>('all');
  const [globalAmount, setGlobalAmount] = useState('');
  const [globalTitle, setGlobalTitle] = useState('Past Dues (Arrears)');

  // ── Admin fee management (edit/delete individual fee) ──
  const [manageStudent, setManageStudent] = useState<any>(null);
  const [editingFee, setEditingFee] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: '', amount: '', dueDate: '', status: '' });
  const [deletingFeeId, setDeletingFeeId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const openManageFees = (student: any) => {
    setManageStudent(student);
    setEditingFee(null);
  };

  const refreshFees = async () => {
    if (!classFilter || !sectionFilter) {
      console.warn('[FeePastDues] Cannot refresh fees: class/section not selected');
      return;
    }
    const feeParams: any = { page: '1', limit: String(API_PAGE_SIZE) };
    if (sectionFilter !== 'all') feeParams.section_id = sectionFilter;
    if (classFilter !== 'all') feeParams.class_id = classFilter;

    try {
      const allFees = await getAllPages(
        page => api.getFees({ ...feeParams, page: String(page), limit: String(API_PAGE_SIZE) }),
        'payments',
      );

      const grouped: Record<string, any[]> = {};
      allFees.forEach((f: any) => {
        if (!f.student_id) return;
        if (!grouped[f.student_id]) grouped[f.student_id] = [];
        grouped[f.student_id].push(f);
      });
      setFeesByStudent(grouped);
      console.log(`[FeePastDues] Refreshed ${allFees.length} fee records`);
    } catch (err: any) {
      console.error('[FeePastDues] Failed to refresh fees:', err);
      toast.error(err?.message || 'Failed to refresh fees');
    }
  };

  const openEditFee = (fee: any) => {
    setEditingFee(fee);
    setEditForm({
      title: fee.title || '',
      amount: String(fee.amount || ''),
      dueDate: fee.due_date || '',
      status: fee.status || 'pending',
    });
  };

  const handleUpdateFee = async () => {
    if (!editingFee) return;
    setSaving(true);
    try {
      await api.updateFeePayment(editingFee.id, {
        title: editForm.title,
        amount: Number(editForm.amount),
        dueDate: editForm.dueDate,
        status: editForm.status,
      });
      toast.success('Fee updated successfully');
      setEditingFee(null);
      await refreshFees();
      api.invalidateStudentCache();
    } catch (e: any) {
      console.error('[FeePastDues] Failed to update fee:', e);
      toast.error(e?.message || 'Failed to update fee');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFee = async (feeId: string) => {
    setDeletingFeeId(feeId);
    try {
      await api.deleteFeePayment(feeId);
      toast.success('Fee deleted');
      if (editingFee?.id === feeId) setEditingFee(null);
      await refreshFees();
      api.invalidateStudentCache();
    } catch (e: any) {
      console.error('[FeePastDues] Failed to delete fee:', e);
      toast.error(e?.message || 'Failed to delete fee');
    } finally {
      setDeletingFeeId(null);
    }
  };

  // Bulk delete all pending fees for the currently filtered class/section
  const handleBulkDeleteAllFees = async () => {
    if (!window.confirm('Are you sure you want to DELETE all pending and overdue fees for the selected scope? This cannot be undone.')) return;
    setBulkDeleting(true);
    try {
      const feeParams: any = { page: '1', limit: String(API_PAGE_SIZE) };
      if (sectionFilter !== 'all') feeParams.section_id = sectionFilter;
      if (classFilter !== 'all') feeParams.class_id = classFilter;

      const allFees = await getAllPages(
        page => api.getFees({ ...feeParams, page: String(page), limit: String(API_PAGE_SIZE) }),
        'payments',
      );
      const pendingIds = allFees
        .filter((f: any) => f.status === 'pending' || f.status === 'overdue')
        .map((f: any) => f.id);

      if (pendingIds.length === 0) {
        toast.info('No pending fees found to delete');
        return;
      }
      const r = await api.bulkDeleteFeePayments(pendingIds);
      toast.success(r?.message || `Deleted ${pendingIds.length} fee records`);
      await refreshFees();
    } catch (e: any) {
      toast.error(e.message || 'Failed to bulk delete fees');
    } finally {
      setBulkDeleting(false);
    }
  };

  useEffect(() => {
    api.getClasses().then(setClasses).catch(() => { });
  }, []);

  const handleClassChange = (val: string) => {
    setClassFilter(val);
    setSectionFilter(val === 'all' ? 'all' : '');
    setStudents([]);
    setFeesByStudent({});
    setRegisterPage(1);
    const cls = classes.find(c => c.id === val);
    if (val === 'all') {
      // For whole school, mark all sections available
      setSections([]);
    } else {
      setSections(cls?.sections || []);
    }
  };

  const fetchStudents = async () => {
    // Validate filters - allow 'all' as valid value
    if (!classFilter && classFilter !== 'all') {
      toast.error('Please select a class or choose "All Classes"');
      return;
    }
    if (!sectionFilter && sectionFilter !== 'all') {
      toast.error('Please select a section or choose "All Sections"');
      return;
    }

    setLoading(true);
    setStudents([]);
    setFeesByStudent({});
    setDuesState({});

    try {
      // Build params - if 'all' selected, omit the filter to fetch whole school
      const studentParams: any = { page: '1', limit: String(API_PAGE_SIZE) };
      if (classFilter !== 'all') studentParams.class_id = classFilter;
      if (sectionFilter !== 'all') studentParams.section_id = sectionFilter;

      console.log('[FeePastDues] Fetching students with params:', studentParams);

      // Fetch students (whole school if no filters)
      const studentsList = await getAllPages(
        page => api.getStudents({ ...studentParams, page: String(page), limit: String(API_PAGE_SIZE) }),
        'students',
      );

      if (!studentsList || studentsList.length === 0) {
        console.warn('[FeePastDues] No students found for filters:', studentParams);
        toast.info('No students found for the selected filters');
        setStudents([]);
        setFeesByStudent({});
        setDuesState({});
        return;
      }

      console.log(`[FeePastDues] Fetched ${studentsList.length} students`);
      setStudents(studentsList);
      setRegisterPage(1);

      // Fetch pending fees for these students (whole school if no filters)
      const feeParams: any = { page: '1', limit: String(API_PAGE_SIZE) };
      if (sectionFilter !== 'all') feeParams.section_id = sectionFilter;
      if (classFilter !== 'all') feeParams.class_id = classFilter;

      console.log('[FeePastDues] Fetching fees with params:', feeParams);

      const allFees = await getAllPages(
        page => api.getFees({ ...feeParams, page: String(page), limit: String(API_PAGE_SIZE) }),
        'payments',
      );

      console.log(`[FeePastDues] Fetched ${allFees.length} fee records`);

      // Group by student_id
      const grouped: Record<string, any[]> = {};
      allFees.forEach((f: any) => {
        if (!f.student_id) {
          console.warn('[FeePastDues] Fee without student_id:', f.id);
          return;
        }
        if (!grouped[f.student_id]) grouped[f.student_id] = [];
        grouped[f.student_id].push(f);
      });
      setFeesByStudent(grouped);

      // Init past dues state
      const init: Record<string, { amount: string, title: string }> = {};
      studentsList.forEach(s => { init[s.id] = { amount: '', title: 'Past Dues (Arrears)' }; });
      setDuesState(init);

      toast.success(`Loaded ${studentsList.length} students with ${allFees.length} fee records`);
    } catch (err: any) {
      console.error('[FeePastDues] Failed to load data:', err);
      const errorMessage = err?.message || err?.error || 'Failed to load students and fees';
      toast.error(errorMessage);
      setStudents([]);
      setFeesByStudent({});
      setDuesState({});
    } finally {
      setLoading(false);
    }
  };

  const handleResetDraft = () => {
    setDuesState(prev => {
      const next: Record<string, { amount: string; title: string }> = {};
      Object.keys(prev).forEach((studentId) => {
        next[studentId] = { amount: '', title: 'Past Dues (Arrears)' };
      });
      return next;
    });
  };

  const handleSaveDues = async () => {
    const payload = students
      .filter(s => { const a = duesState[s.id]?.amount; return a && !isNaN(Number(a)) && Number(a) > 0; })
      .map(s => ({ studentId: s.id, amount: Number(duesState[s.id].amount), title: duesState[s.id].title, remarks: 'Bulk uploaded past dues' }));

    if (!payload.length) {
      toast.error('No valid amounts to save. Please enter amounts for students first.');
      return;
    }

    if (!confirm(`Save past dues for ${payload.length} student(s)? This will create fee records.`)) {
      return;
    }

    setSaving(true);
    try {
      let saved = 0;
      let skipped = 0;
      let errors = 0;

      for (let start = 0; start < payload.length; start += SAVE_CHUNK_SIZE) {
        const chunk = payload.slice(start, start + SAVE_CHUNK_SIZE);
        try {
          const r = await api.bulkAddFeeDues({ dues: chunk });
          saved += Number(r?.insertedCount ?? chunk.length);
          skipped += Number(r?.skippedDuplicate ?? 0);
        } catch (chunkErr: any) {
          console.error('[FeePastDues] Chunk save error:', chunkErr);
          errors++;
        }
      }

      if (saved > 0 && errors === 0) {
        toast.success(`✅ Successfully saved ${saved} past due record${saved === 1 ? '' : 's'}`);
      } else if (saved > 0 && skipped > 0) {
        toast.success(`✅ Saved ${saved} record${saved === 1 ? '' : 's'} — ${skipped} skipped (already exist)`);
      } else if (saved === 0 && skipped > 0) {
        toast.warning(`⚠️ No new records — ${skipped} already exist with same title & amount. Delete existing fees first to update.`);
      } else if (errors > 0) {
        toast.error(`Failed to save dues. ${errors} chunk(s) failed. Check console for details.`);
      } else {
        toast.error('No records were saved. Please check that amounts are filled correctly.');
      }

      // Refresh after save
      await refreshFees();
      setDuesState(prev => {
        const n = { ...prev };
        Object.keys(n).forEach(k => { n[k] = { ...n[k], amount: '' }; });
        return n;
      });
    } catch (e: any) {
      console.error('[FeePastDues] Failed to save dues:', e);
      toast.error(e?.message || 'Failed to save dues');
    } finally {
      setSaving(false);
    }
  };

  // Save a flat amount + title to every student in the school (whole-school) OR
  // just the currently selected class/section. Both scopes page the students
  // API and save each page in 500-row chunks, so 5,000+ student schools are safe.
  const handleSaveBulkDues = async () => {
    const amt = Number(globalAmount);
    if (!globalAmount || isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const title = globalTitle.trim() || 'Past Dues (Arrears)';
    const isWholeSchool = bulkScope === 'all';
    if (!isWholeSchool && (!classFilter || !sectionFilter)) {
      toast.error('Select both Class and Section above');
      return;
    }
    const scopeLabel = isWholeSchool ? 'whole school' : `${classes.find(c => c.id === classFilter)?.name || ''} ${sections.find(s => s.id === sectionFilter)?.name || ''}`;
    setSaving(true);
    try {
      let saved = 0;
      let page = 1;
      while (true) {
        const params: any = { page: String(page), limit: String(API_PAGE_SIZE) };
        if (!isWholeSchool) {
          params.section_id = sectionFilter;
          if (classFilter) params.class_id = classFilter;
        }
        const res = await api.getStudents(params);
        const studentsList: any[] = res?.students ?? (Array.isArray(res) ? res : []);
        const total = Number(res?.total ?? studentsList.length);
        const payload = studentsList
          .filter((s: any) => s.id)
          .map((s: any) => ({ studentId: s.id, amount: amt, title, remarks: `Bulk uploaded past dues (${scopeLabel})` }));

        // Save this page in 500-row chunks to stay under the backend's per-request cap
        for (let start = 0; start < payload.length; start += SAVE_CHUNK_SIZE) {
          const chunk = payload.slice(start, start + SAVE_CHUNK_SIZE);
          const r = await api.bulkAddFeeDues({ dues: chunk });
          saved += Number(r?.insertedCount ?? chunk.length);
        }

        if (studentsList.length < API_PAGE_SIZE || page * API_PAGE_SIZE >= total) break;
        page += 1;
      }
      toast.success(`Successfully saved ${saved} past due record${saved === 1 ? '' : 's'} (${scopeLabel})`);
      setGlobalAmount('');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  // Excel upload for past dues
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        // defval preserves intentionally empty cells so blank documents/rows can be
        // identified and skipped instead of accidentally becoming zero-value dues.
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[];

        // Fetch ALL students in the school (paginated) so we can match every
        // row in the Excel file — even if the currently selected section only
        // has a subset of students loaded in the register.
        const allStudents = await getAllPages(
          page => api.getStudents({ page: String(page), limit: String(API_PAGE_SIZE) }),
          'students',
        );

        // Also fetch all parents so we can match against linked parent names,
        // not just `father_name` on the student record. This makes matching
        // more robust: Name + Class + Parent-name all must align.
        const parentsRaw = await api.getParents().catch(() => []);
        const parentsList = (Array.isArray(parentsRaw) ? parentsRaw : []) as any[];
        // Map parent_id -> names for quick lookup
        const parentUsersMap = new Map<string, string>();
        parentsList.forEach((parent: any) => {
          const pUser = parent?.user;
          if (pUser?.id) {
            parentUsersMap.set(pUser.id, `${pUser.first_name || ''} ${pUser.last_name || ''}`.trim().toLowerCase());
          }
        });
        // Build student_id -> parent-name list (from parent_students links when available)
        // The parents API returns `children` as parent_students joins with { student_id, student: {...} }
        const studentParentNames: Record<string, string[]> = {};
        parentsList.forEach((parent: any) => {
          const pUser = parent?.user;
          if (!pUser?.id) return;
          const parentName = parentUsersMap.get(pUser.id) || '';
          if (!parentName) return;
          const children = parent.children || parent.students || [];
          children.forEach((child: any) => {
            const sid = child?.student_id || child?.id || child?.student?.id;
            if (sid) {
              if (!studentParentNames[sid]) studentParentNames[sid] = [];
              studentParentNames[sid].push(parentName);
            }
          });
        });

        const newState = { ...duesState };
        const newStudents = [...students];
        let matched = 0;
        let added = 0;
        let skippedInvalid = 0;
        let skippedUnmatched = 0;
        const invalidSamples: string[] = [];
        const unmatchedSamples: string[] = [];

        data.forEach((row) => {
          const nameCell = cleanCell(getExcelCell(row, ['Name', 'Student Name']));
          const fatherCell = cleanCell(getExcelCell(row, ['Father Name', 'Father', 'Parent Name']));
          const classCell = cleanCell(getExcelCell(row, ['Class', 'Class Name']));
          const sectionCell = cleanCell(getExcelCell(row, ['Section', 'Section Name']));
          const addressCell = cleanCell(getExcelCell(row, ['Address', 'Address Line']));
          const rawName = nameCell.toLowerCase();
          const rawFather = fatherCell.toLowerCase();
          const rawClass = classCell.toLowerCase();
          const rawSection = sectionCell.toLowerCase();
          const rawAddress = addressCell.toLowerCase();
          const rawAmt = cleanCell(getExcelCell(row, ['Amount', 'Fee', 'Fee Due', 'Due', 'Past Due', 'Past Due Amount']));
          const title = buildDynamicFeeTitle(row);
          const displayName = nameCell || fatherCell;

          // Ignore completely empty or zero rows.
          if (!rawName || !rawAmt) return;

          // Validate amount must be a positive integer. Skip non-numeric,
          // negative, zero, or decimal values and report them so the user
          // can fix the sheet instead of silently creating bad records.
          const amtNum = Number(rawAmt);
          if (isNaN(amtNum) || amtNum <= 0 || !Number.isInteger(amtNum)) {
            skippedInvalid++;
            if (invalidSamples.length < 8) invalidSamples.push(`${displayName || rawName} (₹${rawAmt})`);
            return;
          }
          const amt = String(amtNum);

          // STRICT MATCHING: class + name + father name MUST all match together.
          // This prevents mis-matching students with the same name in different
          // classes or different father names (the root cause of duplicate fees
          // assigned to the wrong child).
          const s = allStudents.find(st => {
            const sName = `${st.user?.first_name || ''} ${st.user?.last_name || ''}`.trim().toLowerCase();
            const sFather = String(st.father_name || '').trim().toLowerCase();
            const sMother = String(st.mother_name || '').trim().toLowerCase();
            const sClass = String(st.section?.class?.name || '').trim().toLowerCase();
            const sSection = String(st.section?.name || '').trim().toLowerCase();

            const nameMatch = sName.includes(rawName) || rawName.includes(sName);
            const fatherMatch = !!(rawFather && sFather && (sFather.includes(rawFather) || rawFather.includes(sFather)));
            const motherMatch = !!(rawFather && sMother && (sMother.includes(rawFather) || rawFather.includes(sMother)));
            const classMatch = !rawClass || sClass.includes(rawClass) || rawClass.includes(sClass);
            const sectionMatch = !rawSection || sSection.includes(rawSection) || rawSection.includes(sSection);

            // Also check linked parent names (from parent_students links) —
            // this catches cases where the sheet has a parent/mother/guardian
            // name instead of only the father_name field on the student.
            const linkedParentMatches = (studentParentNames[st.id] || []).some(pn =>
              pn.includes(rawFather) || rawFather.includes(pn)
            );

            // ALL THREE (class + name + parent) must align:
            // - Name must match
            // - Class must match if provided
            // - Parent (father OR mother OR linked parent) must match if provided
            const parentOk = !rawFather || fatherMatch || motherMatch || linkedParentMatches;
            const coreCriteriaOk = nameMatch && parentOk && (!rawClass || classMatch);
            return coreCriteriaOk && (!rawSection || sectionMatch);
          });
          if (s) {
            newState[s.id] = { amount: amt, title };
            matched++;
            // If this student isn't already in the visible register, add them
            // so ALL Excel-matched students appear in the table (e.g. Excel has
            // 500 students but the selected section only had 50 loaded).
            if (!newStudents.some(st => st.id === s.id)) {
              newStudents.push(s);
              added++;
            }
          } else {
            // No existing student matched — SKIP this row. We do NOT create
            // a new student profile to avoid duplicate student records.
            // The user can add the student manually and re-upload the sheet.
            skippedUnmatched++;
            if (unmatchedSamples.length < 8) unmatchedSamples.push(displayName || rawName);
          }
        });

        setDuesState(newState);
        setStudents(newStudents);
        setRegisterPage(1);

        let msg = `Matched ${matched} students from Excel`;
        if (added) msg += ` (${added} added to register)`;
        if (skippedUnmatched) msg += `. Skipped ${skippedUnmatched} row${skippedUnmatched === 1 ? '' : 's'} — student not found in system${unmatchedSamples.length ? ` (${unmatchedSamples.join(', ')})` : ''}`;
        if (skippedInvalid) msg += `. Skipped ${skippedInvalid} row${skippedInvalid === 1 ? '' : 's'} with invalid amount${skippedInvalid === 1 ? '' : 's'}${invalidSamples.length ? ` (${invalidSamples.join(', ')})` : ''}`;
        if (matched > 0) msg += `. Review the amounts below and click "Save All Past Dues" to create the records.`;
        if (skippedInvalid || skippedUnmatched) {
          toast.warning(msg);
        } else {
          toast.success(msg);
        }
      } catch { toast.error('Failed to parse Excel'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleTemplateDownload = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'Name': 'Rahul Kumar', 'Parent Name': 'Suresh Kumar', 'Class': 'Class 10', 'Section': 'A', 'Fee': '5000', 'Address': 'Delhi' },
      { 'Name': 'Priya Singh', 'Parent Name': 'Amit Singh', 'Class': 'LKG', 'Section': 'B', 'Fee': '2000', 'Address': 'Mumbai' },
    ]);
    const instructions = XLSX.utils.json_to_sheet([
      { 'Column': 'Name', 'Required': 'Yes', 'Description': 'Student full name' },
      { 'Column': 'Parent Name', 'Required': 'Yes', 'Description': 'Parent / guardian name' },
      { 'Column': 'Class', 'Required': 'Yes', 'Description': 'e.g. Class 10, LKG, UKG' },
      { 'Column': 'Section', 'Required': 'Yes', 'Description': 'e.g. A, B, C' },
      { 'Column': 'Fee', 'Required': 'Yes', 'Description': 'Past due amount (positive whole number)' },
      { 'Column': 'Address', 'Required': 'No', 'Description': 'Student address (optional)' },
      { 'Column': '', 'Required': '', 'Description': '' },
      { 'Column': 'Note', 'Required': '', 'Description': 'Columns can be in any order. Header spacing/case is ignored.' },
      { 'Column': 'Note', 'Required': '', 'Description': 'Students are matched by Name + Class + Father Name. Unmatched students are SKIPPED (no duplicate profiles created).' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Dues Template');
    XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
    XLSX.writeFile(wb, 'fee_dues_template.xlsx');
    toast.success('Template downloaded!');
  };

  // Download ALL students' fee data as an Excel file
  // Columns: student info + one column per unique fee title + total due
  const handleDownloadAllFeesExcel = async () => {
    setDownloading(true);
    try {
      // Fetch ALL students in the school (paginated)
      const allStudents = await getAllPages(
        page => api.getStudents({ page: String(page), limit: String(API_PAGE_SIZE) }),
        'students',
      );

      if (!allStudents.length) {
        toast.info('No students found');
        return;
      }

      // Fetch ALL fees for the school (paginated)
      const allFees = await getAllPages(
        page => api.getFees({ page: String(page), limit: String(API_PAGE_SIZE) }),
        'payments',
      );

      // Group fees by student_id
      const feesByStudentId: Record<string, any[]> = {};
      allFees.forEach((f: any) => {
        if (!feesByStudentId[f.student_id]) feesByStudentId[f.student_id] = [];
        feesByStudentId[f.student_id].push(f);
      });

      // Collect all unique fee titles (sorted alphabetically)
      const feeTitles = [...new Set(allFees.map((f: any) => f.title || f.remarks || 'Fee').filter(Boolean))].sort();

      // Build Excel rows
      const rows = allStudents.map((student: any) => {
        const sUser = student.user || {};
        const sSection = student.section || {};
        const sClass = sSection.class || {};
        const studentFees = feesByStudentId[student.id] || [];

        const row: Record<string, any> = {
          'Roll No': student.roll_number || '',
          'Admission No': student.admission_number || '',
          'Student Name': `${sUser.first_name || ''} ${sUser.last_name || ''}`.trim(),
          'Class': sClass.name || '',
          'Section': sSection.name || '',
          'Father Name': student.father_name || '',
          'Mother Name': student.mother_name || '',
          'Phone': student.guardian_phone || sUser.phone || '',
          'Address': [student.address, student.city, student.state, student.pincode].filter(Boolean).join(', '),
        };

        // One column per fee title with the amount
        let totalDue = 0;
        feeTitles.forEach(title => {
          const fee = studentFees.find((f: any) => (f.title || f.remarks || 'Fee') === title);
          if (fee) {
            const due = Math.max(0, Number(fee.amount || 0) + Number(fee.late_fee || 0) - Number(fee.paid_amount || 0) - Number(fee.discount_amount || 0));
            row[title] = due;
            totalDue += due;
          } else {
            row[title] = '';
          }
        });

        row['Total Due (₹)'] = totalDue;
        return row;
      });

      // Sort by roll number
      rows.sort((a: any, b: any) => {
        const rollA = Number(a['Roll No']) || Number.MAX_SAFE_INTEGER;
        const rollB = Number(b['Roll No']) || Number.MAX_SAFE_INTEGER;
        return rollA - rollB;
      });

      // Create Excel workbook
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths for readability
      ws['!cols'] = [
        { wch: 8 }, { wch: 14 }, { wch: 25 }, { wch: 10 }, { wch: 8 },
        { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 30 },
        ...feeTitles.map(() => ({ wch: 20 })),
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Students Fees');

      const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      const fileName = `All_Students_Fee_Register_${today}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Downloaded fee register for ${allStudents.length} students (${feeTitles.length} fee types)`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to download fee register');
    } finally {
      setDownloading(false);
    }
  };

  // Download section due slips
  const handleDownloadSlips = async () => {
    if (!students.length) { toast.error('Fetch students first'); return; }
    setDownloading(true);
    try {
      const zip = new JSZip();
      const schoolName = (user as any)?.school || 'School';
      const schoolAddress = (user as any)?.schoolAddress || '';
      const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      let count = 0;

      for (const student of students) {
        const name = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim();

        // Fetch ALL fees for this student directly to ensure past due fees
        // are included even if they weren't in the first 500 fetched earlier.
        const studentFeesParams: any = { student_id: student.id, limit: '500' };
        const studentFeesRes = await api.getFees(studentFeesParams);
        const studentFees: any[] = studentFeesRes?.payments ?? (Array.isArray(studentFeesRes) ? studentFeesRes : []);

        const fees = studentFees.length > 0 ? studentFees : (feesByStudent[student.id] || []);
        const pendingFees = fees.filter(f => f.status === 'pending' || f.status === 'overdue');
        if (!pendingFees.length) continue;

        const feeItems = pendingFees.map(f => ({
          title: f.title || 'Fee',
          amount: Math.max(0, parseFloat(f.amount || 0) - parseFloat(f.paid_amount || 0)),
        })).filter(i => i.amount > 0);

        if (!feeItems.length) continue;
        const totalDue = feeItems.reduce((s, i) => s + i.amount, 0);
        const latestDue = pendingFees.reduce((l: string, f: any) => (f.due_date > l ? f.due_date : l), '');
        const dueMonthLabel = latestDue
          ? new Date(latestDue).toLocaleString('default', { month: 'long', year: 'numeric' })
          : new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

        // Use student's own class/section info so whole-school downloads work
        const studentSection = student.section || {};
        const studentClass = studentSection.class || {};

        const blob = await generateDueSlipBlob({
          schoolName: (user as any)?.school || 'School',
          schoolAddress: (user as any)?.schoolAddress || '',
          schoolPhone: (user as any)?.schoolPhone || '',
          schoolEmail: (user as any)?.schoolEmail || '',
          schoolWebsite: (user as any)?.schoolWebsite || '',
          studentName: name,
          admissionNumber: student.admission_number || 'N/A',
          className: studentClass.name || '',
          sectionName: studentSection.name || '',
          parentName: student.father_name || undefined,
          address: [student.address, student.city, student.state, student.pincode].filter(Boolean).join(', ') || undefined,
          dueMonth: dueMonthLabel,
          totalDue,
          dueDate: latestDue || 'N/A',
          feeItems,
          language: slipLanguage,
        });

        zip.file(`${name.replace(/[^a-zA-Z0-9]/g, '_')}_Due_Slip.pdf`, blob);
        count++;
      }

      if (!count) { toast.info('No pending dues found for this scope'); setDownloading(false); return; }
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const cls = classFilter !== 'all' ? classes.find(c => c.id === classFilter) : null;
      const sec = sectionFilter !== 'all' ? sections.find(s => s.id === sectionFilter) : null;
      const zipName = classFilter === 'all'
        ? `Whole_School_Due_Slips_${today}.zip`
        : `${cls?.name || 'Class'}_${sec?.name || 'All'}_Due_Slips_${today}.zip`;
      downloadBlob(zipBlob, zipName);
      toast.success(`Downloaded ${count} due slips`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate slips');
    } finally {
      setDownloading(false);
    }
  };

  const getTotalDue = (studentId: string) => {
    const fees = feesByStudent[studentId] || [];
    return fees.filter(f => f.status === 'pending' || f.status === 'overdue' || f.status === 'partial').reduce((s, f) => s + Math.max(0, parseFloat(f.amount || 0) + parseFloat(f.late_fee || 0) - parseFloat(f.paid_amount || 0) - parseFloat(f.discount_amount || 0)), 0);
  };

  const getGrossTotal = (studentId: string) => {
    const fees = feesByStudent[studentId] || [];
    return fees.reduce((s, f) => s + Math.max(0, parseFloat(f.amount || 0) + parseFloat(f.late_fee || 0) - parseFloat(f.discount_amount || 0)), 0);
  };

  const getPaidTotal = (studentId: string) => {
    const fees = feesByStudent[studentId] || [];
    return fees.reduce((s, f) => s + Math.max(0, parseFloat(f.paid_amount || 0)), 0);
  };

  const getStatus = (studentId: string) => {
    const fees = feesByStudent[studentId] || [];
    if (!fees.length) return 'no-fee';
    if (fees.some(f => f.status === 'overdue')) return 'overdue';
    if (fees.some(f => f.status === 'partial')) return 'partial';
    if (fees.some(f => f.status === 'pending')) return 'pending';
    return 'paid';
  };

  // Client-side pagination so 1,000–5,000+ students render in pages of 100
  // instead of all at once (keeps the DOM light and the UI responsive).
  // Filter by admission number if search is active
  const filteredStudents = admissionSearch
    ? students.filter(s =>
      s.admission_number?.toLowerCase().includes(admissionSearch.toLowerCase()) ||
      s.id === admissionSearch
    )
    : students;
  const sortedAllStudents = sortStudentsArray(filteredStudents, studentSort);
  const totalPages = Math.max(1, Math.ceil(sortedAllStudents.length / REGISTER_PAGE_SIZE));
  const safePage = Math.min(registerPage, totalPages);
  const paginatedStudents = sortedAllStudents.slice((safePage - 1) * REGISTER_PAGE_SIZE, safePage * REGISTER_PAGE_SIZE);
  const pageStart = (safePage - 1) * REGISTER_PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * REGISTER_PAGE_SIZE, sortedAllStudents.length);
  const globalGrossTotal = students.reduce((sum, s) => sum + getGrossTotal(s.id), 0);
  const globalPaidTotal = students.reduce((sum, s) => sum + getPaidTotal(s.id), 0);
  const globalTotalDue = students.reduce((sum, s) => sum + getTotalDue(s.id), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fee Register</h1>
        <p className="text-gray-500 text-sm mt-1">View fee status per student, collect dues, upload past dues, and download demand slips</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 min-w-[180px]">
              <Label>Class</Label>
              <Select value={classFilter} onValueChange={handleClassChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label>Section</Label>
              <Select value={sectionFilter} onValueChange={setSectionFilter} disabled={!classFilter}>
                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label>Search by Admission No</Label>
              <Input
                value={admissionSearch}
                onChange={(e) => setAdmissionSearch(e.target.value)}
                placeholder="e.g. ADM-2026-001"
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            {students.length > 0 && (
              <StudentSortFilter value={studentSort} onChange={setStudentSort} />
            )}
            <Button onClick={fetchStudents} disabled={!classFilter || !sectionFilter || loading} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 h-11">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
              {classFilter === 'all' ? 'Fetch Whole School' : 'Fetch Register'}
            </Button>
            {students.length > 0 && (
              <>
                <Select value={slipLanguage} onValueChange={(v) => setSlipLanguage(v as any)}>
                  <SelectTrigger className="h-9 w-44 rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="hindi">हिन्दी (Hindi)</SelectItem>
                    <SelectItem value="bilingual">Bilingual</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleDownloadSlips} disabled={downloading} variant="outline" className="w-full sm:w-auto border-rose-300 text-rose-700 hover:bg-rose-50">
                  {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderDown className="w-4 h-4 mr-2" />}
                  Download Slips
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        {students.length > 0 && (
          <CardContent className="p-0">
            {/* Summary strip */}
            <div className="px-6 py-4 bg-gray-50 border-b flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-4 items-center">
                <span className="text-gray-600">Total Students: <strong>{students.length}</strong></span>
                <span className="text-red-600">Overdue: <strong>{students.filter(s => getStatus(s.id) === 'overdue').length}</strong></span>
                <span className="text-amber-600">Pending: <strong>{students.filter(s => getStatus(s.id) === 'pending').length}</strong></span>
                <span className="text-emerald-600">Paid: <strong>{students.filter(s => getStatus(s.id) === 'paid').length}</strong></span>
                <div className="ml-auto flex gap-2">
                  <Button
                    onClick={handleBulkDeleteAllFees}
                    disabled={bulkDeleting}
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs border-red-300 text-red-600 hover:bg-red-50"
                  >
                    {bulkDeleting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                    Delete All Pending Fees in Scope
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-6 items-center pt-3 border-t border-gray-200">
                <span className="text-gray-600 font-medium">Register Financials:</span>
                <span className="text-gray-800">Global Gross Due: <strong className="font-mono text-base ml-1">₹{globalGrossTotal.toLocaleString('en-IN')}</strong></span>
                <span className="text-emerald-600">Global Paid: <strong className="font-mono text-base ml-1">₹{globalPaidTotal.toLocaleString('en-IN')}</strong></span>
                <span className="text-red-600">Global Balance Remaining: <strong className="font-mono text-base ml-1">₹{globalTotalDue.toLocaleString('en-IN')}</strong></span>
              </div>
            </div>

            {/* Student fee register table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 bg-gray-50 border-b uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold w-10">#</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Father</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Gross Fee (₹)</th>
                    <th className="px-4 py-3 font-semibold text-right">Paid (₹)</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Due (₹)</th>
                    <th className="px-4 py-3 font-semibold min-w-[220px]">All Fees</th>
                    <th className="px-4 py-3 font-semibold min-w-[160px]">Past Due Title</th>
                    <th className="px-4 py-3 font-semibold min-w-[130px]">Past Due Amount (₹)</th>
                    <th className="px-4 py-3 font-semibold w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedStudents.map((student, idx) => {
                    const name = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim();
                    const status = getStatus(student.id);
                    const grossTotal = getGrossTotal(student.id);
                    const paidTotal = getPaidTotal(student.id);
                    const totalDue = getTotalDue(student.id);
                    const studentFees = feesByStudent[student.id] || [];
                    const dues = duesState[student.id] || { amount: '', title: 'Past Dues (Arrears)' };
                    return (
                      <tr key={student.id} className={`transition-colors hover:bg-gray-50 ${status === 'overdue' ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3 text-gray-400">{pageStart + idx}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{name}</div>
                          <div className="text-xs text-gray-400 font-mono">{student.admission_number}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{student.father_name || '—'}</td>
                        <td className="px-4 py-3">
                          {status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>}
                          {status === 'partial' && <Badge className="bg-orange-100 text-orange-700 border-0"><Clock className="w-3 h-3 mr-1" />Partial</Badge>}
                          {status === 'pending' && <Badge className="bg-amber-100 text-amber-700 border-0"><Clock className="w-3 h-3 mr-1" />Pending</Badge>}
                          {status === 'overdue' && <Badge className="bg-red-100 text-red-700 border-0"><AlertTriangle className="w-3 h-3 mr-1" />Overdue</Badge>}
                          {status === 'no-fee' && <Badge className="bg-gray-100 text-gray-500 border-0">No Fees</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">
                          {grossTotal > 0 ? `₹${grossTotal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">
                          {paidTotal > 0 ? `₹${paidTotal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">
                          {totalDue > 0 ? `₹${totalDue.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {studentFees.length > 0 ? (
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {studentFees.map((fee: any) => {
                                const feeDue = Math.max(0, Number(fee.amount || 0) + Number(fee.late_fee || 0) - Number(fee.paid_amount || 0) - Number(fee.discount_amount || 0));
                                return (
                                  <div key={fee.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-2 py-1">
                                    <span className="font-medium text-gray-700 truncate">{fee.title || fee.remarks || 'Fee'}</span>
                                    <span className={`font-mono font-bold shrink-0 ${feeDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                      ₹{feeDue.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No fees</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            value={dues.title}
                            onChange={e => setDuesState(p => ({ ...p, [student.id]: { ...p[student.id], title: e.target.value } }))}
                            className="h-8 text-xs shadow-none border-gray-200 w-full"
                          />
                        </td>
                        <td className="px-4 py-3 min-w-[160px]">
                          <Input
                            type="number" min="0" placeholder="0"
                            value={dues.amount}
                            onWheel={e => e.currentTarget.blur()}
                            onChange={e => setDuesState(p => ({ ...p, [student.id]: { ...p[student.id], amount: e.target.value } }))}
                            className={`h-9 font-mono text-sm w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tracking-wider ${dues.amount && Number(dues.amount) > 0 ? 'border-amber-400 bg-amber-50/30 font-bold' : 'border-gray-200 shadow-none'}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openManageFees(student)}
                              className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                              title="Manage fees"
                            >
                              <ListChecks className="w-4 h-4" />
                            </Button>
                            {(feesByStudent[student.id] || []).length > 0 && (
                              <div className="relative inline-block group">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-amber-500 hover:text-amber-600"
                                  title="Edit a fee"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {/* Inline popover showing quick edit/delete actions */}
                                <div className="absolute right-0 top-full z-50 hidden group-hover:block w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-2">
                                  {(feesByStudent[student.id] || []).slice(0, 5).map(fee => (
                                    <div key={fee.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{fee.title || fee.remarks || 'Fee'}</p>
                                        <p className="text-[10px] text-gray-400">₹{fee.amount} · {fee.status || 'pending'}</p>
                                      </div>
                                      <div className="flex gap-0.5 shrink-0">
                                        <button
                                          onClick={() => openEditFee(fee)}
                                          className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50"
                                          title="Edit fee"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (window.confirm(`Delete fee "${fee.title || 'Fee'}" for ${name}?`)) handleDeleteFee(fee.id);
                                          }}
                                          className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                                          title="Delete fee"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {(feesByStudent[student.id] || []).length > 5 && (
                                    <p className="text-[10px] text-gray-400 px-2 py-1">+{(feesByStudent[student.id] || []).length - 5} more — click ⚙️ to see all</p>
                                  )}
                                </div>
                              </div>
                            )}
                            {(feesByStudent[student.id] || []).length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                title="Delete ALL fees for this student"
                                onClick={() => {
                                  if (window.confirm(`Delete ALL ${(feesByStudent[student.id] || []).length} fees for ${name}? This cannot be undone.`)) {
                                    api.bulkDeleteFeePayments((feesByStudent[student.id] || []).map(f => f.id)).then(r => {
                                      toast.success(r?.message || 'Fees deleted');
                                      refreshFees();
                                    }).catch(e => toast.error(e.message || 'Failed'));
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="px-6 py-3 bg-gray-50 border-t flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-gray-500">
                  Showing <strong>{pageStart}–{pageEnd}</strong> of <strong>{students.length}</strong> students
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setRegisterPage(p => Math.max(1, p - 1))}
                    className="h-8 px-3 text-xs"
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-gray-600 px-2">
                    Page {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setRegisterPage(p => Math.min(totalPages, p + 1))}
                    className="h-8 px-3 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Past dues upload section — ALWAYS visible so admin can upload Excel even before fetching students */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-bold text-gray-800">Upload Past Dues via Excel</CardTitle>
          <p className="text-xs text-gray-500 mt-1">Upload an Excel with Name, Parent Name, Class, Section, Fee, and Address (any column order) — matched students are filled into the register below, then click <strong>Save All Past Dues</strong> to create the records</p>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" onClick={handleTemplateDownload} className="border-gray-300 text-gray-700">
              <Download className="w-4 h-4 mr-2" />
              Download Fee Backlog Template
            </Button>
            <Button
              onClick={handleDownloadAllFeesExcel}
              disabled={downloading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
              Download All Fees Excel
            </Button>
            <Button variant="outline" onClick={handleResetDraft} className="border-gray-300 text-gray-700" disabled={students.length === 0}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              Clear Draft
            </Button>
            <div className="relative">
              <input type="file" accept=".xlsx,.csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Button variant="outline" className="border-blue-300 text-blue-700 pointer-events-none">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                Fill from Excel
              </Button>
            </div>
            <Button
              onClick={handleSaveDues}
              disabled={saving || students.length === 0 || !Object.values(duesState).some(d => d.amount && Number(d.amount) > 0)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All Past Dues {Object.values(duesState).filter(d => d.amount && Number(d.amount) > 0).length > 0 ? `(${Object.values(duesState).filter(d => d.amount && Number(d.amount) > 0).length} students)` : ''}
            </Button>
            <Button
              onClick={handleBulkDeleteAllFees}
              disabled={bulkDeleting || students.length === 0}
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              {bulkDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete All Fees in Scope
            </Button>
          </div>
          {students.length === 0 && (
            <p className="text-xs text-amber-700 font-medium mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ First fetch students using the filter above, OR upload an Excel file — matched students will be auto-loaded.
            </p>
          )}
          <p className="text-xs text-amber-700 font-medium mt-3">
            How it works: upload your sheet and valid students are matched and filled into the register below. Review the amounts, then click <strong>&quot;Save All Past Dues&quot;</strong> to create the records.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            📋 Supported columns: <strong>Name, Parent Name, Class, Section, Fee, Address</strong> — in <strong>any order</strong>. Header spacing and capitalization are ignored. Students are matched by <strong>Name + Class + Parent Name (Father or Mother)</strong>. Unmatched students are <strong>SKIPPED</strong> (no duplicate profiles created). Empty rows and invalid/zero fees are skipped.
          </p>
          <p className="text-xs text-blue-600 font-medium mt-2">
            🔒 <strong>Matching rule:</strong> Students are matched only when <strong>Name + Class + Parent Name</strong> all match together to prevent duplicate/wrong fee assignment. The parent name is checked against <strong>both Father Name and Mother Name</strong> on the student record. If a student is not found, the row is skipped and reported — no new student profile is created.
          </p>
        </CardContent>
      </Card>

      {/* ── Manage Student Fees Dialog ── */}
      <Dialog open={!!manageStudent} onOpenChange={(open) => { if (!open) { setManageStudent(null); setEditingFee(null); } }}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">
              Fee Management — {`${manageStudent?.user?.first_name || ''} ${manageStudent?.user?.last_name || ''}`.trim()}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {manageStudent?.admission_number} · {manageStudent?.section?.class?.name || ''} {manageStudent?.section?.name || ''} · Father: {manageStudent?.father_name || '—'}
            </DialogDescription>
          </DialogHeader>

          {!editingFee ? (
            <div className="space-y-3">
              {/* Fee list */}
              {(feesByStudent[manageStudent?.id] || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No fee records found for this student.</p>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="text-xs bg-gray-50 text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Title</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Due</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(feesByStudent[manageStudent?.id] || []).map(fee => (
                        <tr key={fee.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-medium text-gray-800">{fee.title || fee.remarks || 'Fee'}</td>
                          <td className="px-3 py-2.5 text-right font-mono">₹{Number(fee.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{fee.due_date || '—'}</td>
                          <td className="px-3 py-2.5">
                            <Badge className={
                              fee.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-0'
                                : fee.status === 'overdue' ? 'bg-red-100 text-red-700 border-0'
                                  : fee.status === 'pending' ? 'bg-amber-100 text-amber-700 border-0'
                                    : 'bg-gray-100 text-gray-500 border-0'
                            }>
                              {fee.status || 'pending'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-500" onClick={() => openEditFee(fee)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500"
                                disabled={deletingFeeId === fee.id}
                                onClick={() => {
                                  if (window.confirm(`Delete fee "${fee.title || 'Fee'}" for this student?`)) handleDeleteFee(fee.id);
                                }}
                              >
                                {deletingFeeId === fee.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Fee Title</Label>
                  <Input
                    value={editForm.title}
                    onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Amount (₹)</Label>
                  <Input
                    type="number" min="0"
                    value={editForm.amount}
                    onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
                    className="h-10 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Due Date</Label>
                  <Input
                    type="date"
                    value={editForm.dueDate}
                    onChange={e => setEditForm(p => ({ ...p, dueDate: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingFee(null)} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateFee}
                  disabled={saving}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
