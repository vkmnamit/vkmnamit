import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Bus, MapPin, Users, Plus, Edit, Trash2, IndianRupee, ArrowRight,
  UserPlus, UserMinus, Search, CheckSquare, Square, Navigation,
  Radio, ChevronRight, TrendingUp, RefreshCw, X, Filter, Loader2, Download, Upload
} from 'lucide-react';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Skeleton } from '../../components/ui/skeleton';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const EMPTY_ROUTE = {
  name: '',
  description: '',
  monthly_fee: '',
  pickup_points: '',
  is_active: true,
};

export function TransportRoutesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  // Modal states
  const [routeModal, setRouteModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [routeForm, setRouteForm] = useState({ ...EMPTY_ROUTE });
  const [savingRoute, setSavingRoute] = useState(false);

  // Student assignment panel
  const [assignPanel, setAssignPanel] = useState<{ open: boolean; route: any | null }>({ open: false, route: null });
  const [routeStudents, setRouteStudents] = useState<any[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<any[]>([]);
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [searchUnassigned, setSearchUnassigned] = useState('');
  const [selectedUnassigned, setSelectedUnassigned] = useState<string[]>([]);
  const [selectedAssigned, setSelectedAssigned] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [assigningStudents, setAssigningStudents] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importGenerateFees, setImportGenerateFees] = useState(true);
  const [importSendNotif, setImportSendNotif] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const todayDay = new Date().getDate();

  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; route: any | null }>({ open: false, route: null });

  // Fee push confirmation dialog (shown when day > 5 and student is being assigned)
  const [feeConfirm, setFeeConfirm] = useState<{ open: boolean; pendingStudentIds: string[]; routeId: string; monthLabel: string }>({ open: false, pendingStudentIds: [], routeId: '', monthLabel: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [routesData, classesData] = await Promise.all([
        api.getTransportRoutes(),
        api.getClasses(),
      ]);
      setRoutes(routesData || []);
      setClasses(classesData || []);
    } catch {
      toast.error('Failed to load transport data');
    } finally {
      setLoading(false);
    }
  };

  const openCreateRoute = () => {
    setRouteForm({ ...EMPTY_ROUTE });
    setRouteModal({ open: true, editing: null });
  };

  const openEditRoute = (route: any) => {
    setRouteForm({
      name: route.name || '',
      description: route.description || '',
      monthly_fee: (route.monthly_fee || route.fee_amount || '').toString(),
      pickup_points: route.pickup_points || '',
      is_active: route.is_active !== false,
    });
    setRouteModal({ open: true, editing: route });
  };

  const createTransportTemplateWorkbook = () => {
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
    return wb;
  };

  const handleTransportTemplateDownload = () => {
    const wb = createTransportTemplateWorkbook();
    XLSX.writeFile(wb, 'transport_bulk_template.xlsx');
    toast.success('Transport bulk upload template downloaded!');
  };

  const handleTransportZipDownload = async () => {
    try {
      const wb = createTransportTemplateWorkbook();
      const workbookBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const zip = new JSZip();
      zip.file('transport_bulk_template.xlsx', workbookBytes);
      zip.file(
        'README.txt',
        'All-in-one transport upload package.\n\n1. Open transport_bulk_template.xlsx\n2. Fill all student rows in one sheet\n3. Upload the file back on the Transport Route Management page\n4. Use the Students button on a route row if you want to assign students one by one\n'
      );
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      saveAs(zipBlob, 'transport_all_in_one_upload.zip');
      toast.success('All-in-one transport ZIP downloaded!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create ZIP download');
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const normalize = (value: string) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
        const fuzzyMatch = (raw: string, candidates: string[]): string | null => {
          if (!raw) return null;
          const rawNorm = normalize(raw);
          const exact = candidates.find(c => normalize(c) === rawNorm);
          if (exact) return exact;
          const contains = candidates.find(c => normalize(c).includes(rawNorm) || rawNorm.includes(normalize(c)));
          if (contains) return contains;
          const rawDigits = rawNorm.replace(/\D/g, '');
          if (rawDigits) {
            const digitMatch = candidates.find(c => normalize(c).replace(/\D/g, '') === rawDigits);
            if (digitMatch) return digitMatch;
          }
          return null;
        };

        const mappedData = rawData.map((row: any) => {
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
            transportRouteName: String(nRow.transportroute || nRow.routename || nRow.route || '').trim(),
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

        const today = new Date().getDate();
        const defaultGenerateFees = today <= 5;
        const allClasses = classes;

        const preview = mappedData.map((student: any, idx: number) => {
          const rawClass = String(student.className || '').trim();
          const rawSection = String(student.sectionName || '').trim();
          const classNames = allClasses.map((c: any) => c.name);
          const matchedClassName = fuzzyMatch(rawClass, classNames) || rawClass;
          const matchedClassObj = allClasses.find((c: any) => c.name === matchedClassName);
          const sectionNames = (matchedClassObj?.sections || []).map((s: any) => s.name);
          const matchedSectionName = fuzzyMatch(rawSection, sectionNames) || rawSection;
          const validationErrors: string[] = [];

          if (!rawClass) validationErrors.push('Missing class');
          if (!rawSection) validationErrors.push('Missing section');
          if (!matchedClassObj) validationErrors.push(`Class not found: ${rawClass || 'N/A'}`);
          if (matchedClassObj && !sectionNames.includes(matchedSectionName)) {
            validationErrors.push(`Section not found in ${matchedClassName}: ${rawSection || 'N/A'}`);
          }

          // Validate transport fee amount — must be a positive integer if provided.
          const rawFee = String(student.transportFeeAmount || '').trim();
          if (rawFee) {
            const feeNum = Number(rawFee);
            if (isNaN(feeNum) || feeNum <= 0 || !Number.isInteger(feeNum)) {
              validationErrors.push(`Invalid transport fee: "${rawFee}" — must be a positive whole number`);
            }
          }

          return {
            ...student,
            rowIndex: idx,
            rawClass,
            rawSection,
            className: matchedClassName,
            sectionName: matchedSectionName,
            isClassMatched: !!matchedClassObj,
            isSectionMatched: sectionNames.includes(matchedSectionName),
            canImport: validationErrors.length === 0,
            validationErrors,
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
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    const validRows = importPreview.filter((row) => row.canImport !== false);
    const invalidRows = importPreview.filter((row) => row.canImport === false);

    if (validRows.length === 0) {
      const examples = invalidRows.slice(0, 3).map((row) => row.validationErrors?.[0]).filter(Boolean);
      toast.error(examples.length ? `No valid rows to import. ${examples.join(' | ')}` : 'No valid rows to import.');
      return;
    }

    if (invalidRows.length > 0) {
      const examples = invalidRows.slice(0, 3).map((row) => row.validationErrors?.[0]).filter(Boolean);
      toast.warning(`Skipping ${invalidRows.length} invalid row(s). ${examples.join(' | ')}`);
    }

    setImportLoading(true);
    const toastId = toast.loading(`Importing ${validRows.length} valid student(s)...`);
    try {
      const response = await api.bulkCreateStudents(validRows, importGenerateFees, importSendNotif);
      if (response && response.results) {
        const successCount = response.results.filter((r: any) => r.success === true).length;
        // Rows with status 'updated' are already-enrolled students whose
        // transport route was transferred — count them as success too.
        const updatedCount = response.results.filter((r: any) => r.status === 'updated').length;
        const failedRows = response.results.filter((r: any) => r.success !== true);
        const failCount = failedRows.length;
        if (failCount > 0) {
          const errorPreview = failedRows.slice(0, 3).map((r: any) => r.error).filter(Boolean).join(' | ') || 'Check console for details.';
          toast.error(`${successCount} imported, ${updatedCount} route-updated, ${failCount} failed. ${errorPreview}`, { id: toastId, duration: 12000 });
        } else if (updatedCount > 0) {
          toast.success(`✅ ${successCount} imported, ${updatedCount} already-enrolled students moved to the new route!`, { id: toastId });
        } else {
          toast.success(`✅ ${successCount} students imported successfully!`, { id: toastId });
        }
      } else {
        toast.success('Students imported successfully!', { id: toastId });
      }
      setImportPreviewOpen(false);
      setImportPreview([]);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message || 'Import failed', { id: toastId });
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleSaveRoute = async () => {
    if (!routeForm.name.trim()) { toast.error('Route name is required'); return; }
    setSavingRoute(true);
    try {
      const payload = {
        name: routeForm.name.trim(),
        description: routeForm.description.trim(),
        monthly_fee: parseFloat(routeForm.monthly_fee) || 0,
        fee_amount: parseFloat(routeForm.monthly_fee) || 0,
        pickup_points: routeForm.pickup_points.trim(),
        is_active: routeForm.is_active,
      };
      if (routeModal.editing) {
        await api.updateTransportRoute(routeModal.editing.id, payload);
        toast.success('Route updated!');
      } else {
        await api.createTransportRoute(payload);
        toast.success('Route created!');
      }
      setRouteModal({ open: false, editing: null });
      fetchAll();
    } catch (err: any) {
      // Show server's specific duplicate-name message if it's a 409 conflict
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to save route';
      toast.error(errorMessage);
    } finally {
      setSavingRoute(false);
    }
  };

  const handleDeleteRoute = (route: any) => {
    setDeleteConfirm({ open: true, route });
  };

  const confirmDelete = async () => {
    const route = deleteConfirm.route;
    setDeleteConfirm({ open: false, route: null });
    if (!route) return;
    try {
      await api.deleteTransportRoute(route.id);
      toast.success(`Route "${route.name}" deleted`);
      fetchAll();
    } catch { toast.error('Failed to delete route'); }
  };

  const openAssignPanel = async (route: any) => {
    setAssignPanel({ open: true, route });
    setSelectedUnassigned([]);
    setSelectedAssigned([]);
    setFilterClass('');
    setFilterSection('');
    setSearchUnassigned('');
    await loadStudents(route.id, '', '');
  };

  const loadStudents = useCallback(async (routeId: string, classId: string, sectionId: string) => {
    setLoadingStudents(true);
    try {
      const [assigned, unassigned] = await Promise.all([
        api.getRouteStudents(routeId),
        api.getUnassignedStudents(
          classId ? { class_id: classId, ...(sectionId ? { section_id: sectionId } : {}) } : undefined
        ),
      ]);
      setRouteStudents(assigned || []);
      setUnassignedStudents(unassigned || []);
    } catch {
      toast.error('Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const onClassChange = (cls: string) => {
    setFilterClass(cls);
    setFilterSection('');
    setSelectedUnassigned([]);
    const cls_obj = classes.find(c => c.id === cls);
    setSections(cls_obj?.sections || []);
    if (assignPanel.route) loadStudents(assignPanel.route.id, cls, '');
  };

  const onSectionChange = (sec: string) => {
    setFilterSection(sec);
    setSelectedUnassigned([]);
    if (assignPanel.route) loadStudents(assignPanel.route.id, filterClass, sec);
  };

  // Called when admin clicks "Assign to Route"
  const handleAssignClick = () => {
    if (!selectedUnassigned.length || !assignPanel.route) return;
    // If today is after the 5th, show fee-push confirmation dialog
    if (todayDay > 5) {
      const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      setFeeConfirm({
        open: true,
        pendingStudentIds: [...selectedUnassigned],
        routeId: assignPanel.route.id,
        monthLabel,
      });
    } else {
      // Before 5th — auto push without asking
      doAssign(selectedUnassigned, assignPanel.route.id, true);
    }
  };

  const doAssign = async (studentIds: string[], routeId: string, push: boolean) => {
    setAssigningStudents(true);
    try {
      const res = await api.bulkAssignStudentsToRoute(studentIds, routeId, push);
      if (res?.feesGenerated) {
        toast.success(`${res?.count || studentIds.length} student(s) assigned! ${feeConfirm.monthLabel || ''} transport fee generated.`);
      } else {
        toast.success(`${res?.count || studentIds.length} student(s) assigned. Fees will auto-generate next month.`);
      }
      setSelectedUnassigned([]);
      await loadStudents(routeId, filterClass, filterSection);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign');
    } finally {
      setAssigningStudents(false);
    }
  };

  // Legacy handleAssignSelected kept for compatibility
  const handleAssignSelected = handleAssignClick;

  const handleRemoveSelected = async () => {
    if (!selectedAssigned.length || !assignPanel.route) return;
    setAssigningStudents(true);
    try {
      const res = await api.bulkAssignStudentsToRoute(selectedAssigned, null as any);
      toast.success(`${res?.count || selectedAssigned.length} student(s) removed from route`);
      setSelectedAssigned([]);
      await loadStudents(assignPanel.route.id, filterClass, filterSection);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove');
    } finally {
      setAssigningStudents(false);
    }
  };

  const toggleUnassigned = (id: string) =>
    setSelectedUnassigned(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAssigned = (id: string) =>
    setSelectedAssigned(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAllUnassigned = () => setSelectedUnassigned(filteredUnassigned.map(s => s.id));
  const selectAllAssigned = () => setSelectedAssigned(routeStudents.map(s => s.id));

  const filteredUnassigned = unassignedStudents.filter(s => {
    if (!searchUnassigned) return true;
    const name = `${s.user?.first_name} ${s.user?.last_name}`.toLowerCase();
    return name.includes(searchUnassigned.toLowerCase()) || s.admission_number?.includes(searchUnassigned);
  });

  const fmtFee = (n: any) => n && Number(n) > 0 ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
  const totalStudents = routes.reduce((sum, r) => sum + (r.student_count || 0), 0);
  const routesWithFee = routes.filter(r => Number(r.monthly_fee || r.fee_amount) > 0);
  const avgMonthlyFee = routesWithFee.length
    ? Math.round(routesWithFee.reduce((s, r) => s + Number(r.monthly_fee || r.fee_amount || 0), 0) / routesWithFee.length)
    : 0;

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Transport Route Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage bus routes, monthly fees and student assignments</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => navigate('/transport/driver')} className="rounded-xl font-bold text-xs h-9 border-gray-200 justify-center">
            <Radio className="w-3.5 h-3.5 mr-1.5" /> Driver Console
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/transport/live')} className="rounded-xl font-bold text-xs h-9 border-blue-200 text-blue-700 hover:bg-blue-50 justify-center">
            <Navigation className="w-3.5 h-3.5 mr-1.5" /> Live Tracking
          </Button>
          <Button size="sm" onClick={openCreateRoute} className="h-9 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 rounded-xl font-bold text-xs px-5 justify-center">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Route
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all-in-one" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="all-in-one" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">All in One</TabsTrigger>
          <TabsTrigger value="one-by-one" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">One by One</TabsTrigger>
        </TabsList>

        <TabsContent value="all-in-one" className="mt-4">
          <Card className="border-blue-100 bg-blue-50/60 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-black text-blue-900 uppercase tracking-widest">All-in-One Upload</p>
                  <p className="text-sm text-blue-800">Download one ZIP package, fill the Excel sheet with all students, then upload it here.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    ref={importFileRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleBulkImport}
                  />
                  <Button variant="outline" onClick={handleTransportZipDownload} className="rounded-xl font-bold border-blue-200 text-blue-700 hover:bg-blue-50 justify-center">
                    <Download className="w-4 h-4 mr-2" /> Download ZIP
                  </Button>
                  <Button onClick={() => importFileRef.current?.click()} className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 justify-center">
                    <Upload className="w-4 h-4 mr-2" /> Upload Excel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="one-by-one" className="mt-4">
          <Card className="border-violet-100 bg-violet-50/60 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-black text-violet-900 uppercase tracking-widest">One-by-One Assignment</p>
                  <p className="text-sm text-violet-800">Use the Students button in any route row below to assign or remove students manually.</p>
                </div>
                <Button variant="outline" onClick={() => document.querySelector('table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-xl font-bold border-violet-200 text-violet-700 hover:bg-violet-50 justify-center">
                  <ArrowRight className="w-4 h-4 mr-2" /> Go to Routes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Routes', value: routes.length, icon: Bus, color: 'blue' },
          { label: 'Active Routes', value: routes.filter(r => r.is_active !== false).length, icon: TrendingUp, color: 'green' },
          { label: 'Students on Bus', value: totalStudents, icon: Users, color: 'violet' },
          { label: 'Avg Monthly Fee', value: avgMonthlyFee ? `₹${avgMonthlyFee.toLocaleString('en-IN')}` : '₹0', icon: IndianRupee, color: 'amber' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 bg-${color}-50 rounded-xl flex items-center justify-center border border-${color}-100`}>
                  <Icon className={`w-5 h-5 text-${color}-600`} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                  <p className="text-2xl font-black text-gray-900">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Routes table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-gray-800">Routes</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchAll} className="h-8 w-8 p-0 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {routes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Bus className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No routes yet</p>
              <p className="text-sm">Click "New Route" to create your first transport route</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60">
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-gray-500 pl-6">Route Name</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-gray-500">Students</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-gray-500">Monthly Fee</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-gray-500">Status</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-gray-500 pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map(route => (
                    <TableRow key={route.id} className="hover:bg-gray-50/60 transition-colors">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-600/10">
                            <Bus className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{route.name}</p>
                            {route.description && <p className="text-[11px] text-gray-400">{route.description}</p>}
                            {route.pickup_points && (
                              <p className="text-[10px] text-gray-400 mt-0.5 max-w-[200px] truncate">
                                <MapPin className="w-3 h-3 inline mr-0.5" />{route.pickup_points}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-bold text-gray-700">{route.student_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-blue-700 text-sm">{fmtFee(route.monthly_fee || route.fee_amount)}</span>
                        <span className="text-[10px] text-gray-400 ml-1">/ month</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={route.is_active !== false ? 'default' : 'secondary'} className={`text-[10px] font-black rounded-lg ${route.is_active !== false ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500'}`}>
                          {route.is_active !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openAssignPanel(route)} className="h-8 text-[11px] font-bold px-3 rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50">
                            <UserPlus className="w-3 h-3 mr-1" /> Students
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEditRoute(route)} className="h-8 w-8 p-0 rounded-lg hover:bg-blue-50 text-blue-600">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteRoute(route)} className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ──── Create/Edit Route Modal ──── */}
      <Dialog open={routeModal.open} onOpenChange={v => !savingRoute && setRouteModal({ open: v, editing: null })}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="font-black text-lg">
              {routeModal.editing ? 'Edit Transport Route' : 'Create Transport Route'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid gap-2">
                <Label>Route Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Route A — North Campus"
                  value={routeForm.name}
                  onChange={e => setRouteForm({ ...routeForm, name: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="col-span-2 grid gap-2">
                <Label>Description</Label>
                <Input
                  placeholder="Short route description (optional)"
                  value={routeForm.description}
                  onChange={e => setRouteForm({ ...routeForm, description: e.target.value })}
                  className="h-10"
                />
              </div>
            </div>

            {/* Fee section - Monthly only */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-3">Monthly Transport Fee</p>
              <div className="grid gap-1.5">
                <Label className="text-sm font-semibold text-gray-700">Fee Amount per Student (₹/month)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={routeForm.monthly_fee}
                  onChange={e => setRouteForm({ ...routeForm, monthly_fee: e.target.value })}
                  className="h-10 text-lg font-bold"
                />
                <p className="text-[11px] text-blue-600">This amount will be automatically charged to assigned students every month.</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Pickup Points (comma separated)</Label>
              <Input
                placeholder="e.g. Station Gate, Sector 15, Main Market"
                value={routeForm.pickup_points}
                onChange={e => setRouteForm({ ...routeForm, pickup_points: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="routeActive"
                checked={routeForm.is_active}
                onChange={e => setRouteForm({ ...routeForm, is_active: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="routeActive" className="text-sm font-medium cursor-pointer select-none">Route is Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteModal({ open: false, editing: null })} disabled={savingRoute}>Cancel</Button>
            <Button onClick={handleSaveRoute} disabled={savingRoute} className="bg-blue-600 hover:bg-blue-700">
              {savingRoute && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {routeModal.editing ? 'Update Route' : 'Create Route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importPreviewOpen} onOpenChange={(open) => { if (!importLoading) setImportPreviewOpen(open); }}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-black text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" /> Transport Bulk Import Preview
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-1">Review the rows before importing students and their transport details.</p>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border p-3 bg-white"><div className="text-gray-400 uppercase tracking-widest font-black text-[10px]">Rows</div><div className="text-2xl font-black text-gray-900">{importPreview.length}</div></div>
            <div className="rounded-xl border p-3 bg-green-50"><div className="text-green-700 uppercase tracking-widest font-black text-[10px]">Matched Class</div><div className="text-2xl font-black text-green-900">{importPreview.filter(r => r.isClassMatched).length}</div></div>
            <div className="rounded-xl border p-3 bg-blue-50"><div className="text-blue-700 uppercase tracking-widest font-black text-[10px]">Matched Section</div><div className="text-2xl font-black text-blue-900">{importPreview.filter(r => r.isSectionMatched).length}</div></div>
            <div className="rounded-xl border p-3 bg-amber-50"><div className="text-amber-700 uppercase tracking-widest font-black text-[10px]">Need Attention</div><div className="text-2xl font-black text-amber-900">{importPreview.filter(r => !r.isClassMatched || !r.isSectionMatched).length}</div></div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Rows with unmatched class or section are skipped before import. Students already enrolled (matched by name+section+father, phone, email, guardian phone/email, or admission number) are <strong>NOT duplicated</strong> — their transport route is simply updated.
          </div>

          <div className="flex-1 overflow-auto border rounded-xl">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-black text-[10px] uppercase tracking-widest">Name</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest">Class</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest">Section</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest">Transport Route</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest">Fee</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importPreview.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-semibold">{`${row.firstName || ''} ${row.lastName || ''}`.trim() || 'Unnamed'}</TableCell>
                    <TableCell>{row.className || '—'}</TableCell>
                    <TableCell>{row.sectionName || '—'}</TableCell>
                    <TableCell>{row.transportRouteName || '—'}</TableCell>
                    <TableCell>{row.transportFeeAmount || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={row.canImport ? 'default' : 'secondary'} className={row.canImport ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
                        {row.canImport ? 'Ready' : 'Skip'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="flex-shrink-0 flex-wrap gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setImportPreviewOpen(false)} disabled={importLoading} className="rounded-xl font-bold">
              Cancel
            </Button>
            <Button onClick={handleConfirmImport} disabled={importLoading} className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700">
              {importLoading ? 'Importing...' : `Confirm & Import ${importPreview.length} Students`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Student Assignment Panel (full modal) ──── */}
      <Dialog open={assignPanel.open} onOpenChange={v => { if (!assigningStudents) setAssignPanel({ open: v, route: null }); }}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-black text-lg flex items-center gap-2">
              <Bus className="w-5 h-5 text-blue-600" />
              Student Assignment — {assignPanel.route?.name}
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-1">
              Assign or remove students from this transport route.
            </p>
          </DialogHeader>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0 py-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <Select value={filterClass || 'all'} onValueChange={v => onClassChange(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-40 text-xs rounded-lg">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {filterClass && sections.length > 0 && (
              <Select value={filterSection || 'all'} onValueChange={v => onSectionChange(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 w-36 text-xs rounded-lg">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {sections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                className="h-8 pl-7 text-xs rounded-lg"
                placeholder="Search unassigned..."
                value={searchUnassigned}
                onChange={e => setSearchUnassigned(e.target.value)}
              />
            </div>
            {loadingStudents && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          </div>

          {/* Two-panel layout */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-y-auto md:overflow-hidden">
            {/* Left: Unassigned students */}
            <div className="flex flex-col min-h-0 border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between border-b flex-shrink-0">
                <div>
                  <p className="text-xs font-black text-gray-600 uppercase tracking-wider">Unassigned Students</p>
                  <p className="text-[10px] text-gray-400">{filteredUnassigned.length} available</p>
                </div>
                {filteredUnassigned.length > 0 && (
                  <button onClick={selectAllUnassigned} className="text-[10px] font-bold text-blue-600 hover:underline">
                    Select All
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredUnassigned.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    {loadingStudents ? 'Loading...' : 'No unassigned students'}
                  </div>
                ) : (
                  filteredUnassigned.map(student => {
                    const name = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim() || 'Unknown';
                    const cls = student.section?.class?.name;
                    const sec = student.section?.name;
                    const selected = selectedUnassigned.includes(student.id);
                    return (
                      <div
                        key={student.id}
                        onClick={() => toggleUnassigned(student.id)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        {selected ? <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" /> : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                          <p className="text-[10px] text-gray-400">{student.admission_number} {cls && `• ${cls}${sec ? ` - ${sec}` : ''}`}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Center action buttons */}
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex-col gap-2 hidden md:flex z-10">
              {/* These are visually placed via absolute positioning inside the modal grid */}
            </div>

            {/* Right: Assigned students */}
            <div className="flex flex-col min-h-0 border rounded-xl overflow-hidden">
              <div className="bg-violet-50 px-4 py-2.5 flex items-center justify-between border-b flex-shrink-0">
                <div>
                  <p className="text-xs font-black text-violet-700 uppercase tracking-wider">On This Route</p>
                  <p className="text-[10px] text-violet-400">{routeStudents.length} assigned</p>
                </div>
                {routeStudents.length > 0 && (
                  <button onClick={selectAllAssigned} className="text-[10px] font-bold text-violet-700 hover:underline">
                    Select All
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {routeStudents.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    {loadingStudents ? 'Loading...' : 'No students assigned yet'}
                  </div>
                ) : (
                  routeStudents.map(student => {
                    const name = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim() || 'Unknown';
                    const cls = student.section?.class?.name;
                    const sec = student.section?.name;
                    const selected = selectedAssigned.includes(student.id);
                    return (
                      <div
                        key={student.id}
                        onClick={() => toggleAssigned(student.id)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${selected ? 'bg-violet-50' : 'hover:bg-gray-50'}`}
                      >
                        {selected ? <CheckSquare className="w-4 h-4 text-violet-600 flex-shrink-0" /> : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                          <p className="text-[10px] text-gray-400">{student.admission_number} {cls && `• ${cls}${sec ? ` - ${sec}` : ''}`}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Action footer */}
          <DialogFooter className="flex-shrink-0 flex-col gap-3 pt-3 border-t">
            <div className="flex items-center gap-2 flex-wrap justify-between w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-bold rounded-xl"
                  onClick={handleAssignSelected}
                  disabled={selectedUnassigned.length === 0 || assigningStudents}
                >
                  {assigningStudents ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1.5" />}
                  Assign {selectedUnassigned.length > 0 ? `(${selectedUnassigned.length})` : ''} to Route
                </Button>
                {selectedAssigned.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs font-bold rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    onClick={handleRemoveSelected}
                    disabled={assigningStudents}
                  >
                    {assigningStudents ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5 mr-1.5" />}
                    Remove from Route ({selectedAssigned.length})
                  </Button>
                )}
              </div>
              <Button variant="outline" size="sm" className="h-9 rounded-xl font-bold text-xs" onClick={() => setAssignPanel({ open: false, route: null })}>
                <X className="w-3.5 h-3.5 mr-1" /> Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ──── Delete Confirmation Dialog ──── */}
      <Dialog open={deleteConfirm.open} onOpenChange={v => !v && setDeleteConfirm({ open: false, route: null })}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-black text-red-700 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Delete Route
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete route <strong className="text-gray-900">"{deleteConfirm.route?.name}"</strong>?
            </p>
            {deleteConfirm.route?.student_count > 0 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <span className="text-lg leading-none">⚠️</span>
                <p>
                  <strong>{deleteConfirm.route.student_count} student{deleteConfirm.route.student_count !== 1 ? 's' : ''}</strong> are currently assigned to this route.
                  Deleting it will remove them from the route. Their past fee records will not be affected.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, route: null })} className="rounded-xl font-bold">Cancel</Button>
            <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 rounded-xl font-bold">
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Fee Push Confirmation Dialog (date > 5) ──── */}
      <Dialog open={feeConfirm.open} onOpenChange={v => !v && setFeeConfirm(prev => ({ ...prev, open: false }))}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-black text-gray-900 flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-amber-600" /> Generate Transport Fee?
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-gray-700">
              You are assigning <strong>{feeConfirm.pendingStudentIds.length} student{feeConfirm.pendingStudentIds.length !== 1 ? 's' : ''}</strong> to this route.
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-bold">Today is the {todayDay}th of the month.</p>
              <p>Should the current month's transport fee (<strong>{feeConfirm.monthLabel}</strong>) be generated immediately for these students?</p>
              <p className="text-amber-600 mt-1">If you click <strong>"No, Next Month"</strong>, fees will only start from next month's auto-run on the 1st.</p>
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-xl font-bold border-gray-200"
              onClick={() => {
                setFeeConfirm(prev => ({ ...prev, open: false }));
                doAssign(feeConfirm.pendingStudentIds, feeConfirm.routeId, false);
              }}
              disabled={assigningStudents}
            >
              No, Next Month Only
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
              onClick={() => {
                setFeeConfirm(prev => ({ ...prev, open: false }));
                doAssign(feeConfirm.pendingStudentIds, feeConfirm.routeId, true);
              }}
              disabled={assigningStudents}
            >
              {assigningStudents ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <IndianRupee className="w-4 h-4 mr-1.5" />}
              Yes, Generate {feeConfirm.monthLabel} Fee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
