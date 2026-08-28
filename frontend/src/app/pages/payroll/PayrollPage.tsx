import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Search, CreditCard, Clock, CheckCircle, AlertCircle, Plus, DollarSign, Edit2, Trash2, Users, IndianRupee, Banknote, UserCheck, Send, BellRing, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Label } from '../../components/ui/label';
import { PaymentSuccessOverlay } from '../../components/payment/PaymentSuccessOverlay';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function PayrollPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [payrollEntries, setPayrollEntries] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modals
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [editStructure, setEditStructure] = useState<any>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [assigningTeacher, setAssigningTeacher] = useState<any>(null);

  // Form state
  const [newStructure, setNewStructure] = useState({ name: '', amount: '', frequency: 'monthly', description: '' });
  const [generateForm, setGenerateForm] = useState({ month: MONTHS[new Date().getMonth()], year: new Date().getFullYear().toString(), structureId: '', teacherIds: [] as string[] });
  const [bonusForm, setBonusForm] = useState({ teacherId: '', amount: '', description: '' });
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [payDetails, setPayDetails] = useState({ accountNumber: '', ifsc: '' });
  const [assignStructureId, setAssignStructureId] = useState('');

  const [successData, setSuccessData] = useState({ isOpen: false, amount: 0, receiptNumber: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [api.getPayrollHistory()];
      if (isAdmin) {
        promises.push(api.getPayrollStructures(), api.getStaffForPayroll());
      }
      const [entries, structs, staffData] = await Promise.all(promises);
      setPayrollEntries(entries || []);
      if (isAdmin) {
        setStructures(structs || []);
        setStaff(staffData || []);
      }
    } catch {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  // ── Stats ──────────────────────────────────────
  const totalPaid = payrollEntries.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);
  const pendingCount = payrollEntries.filter(e => e.status === 'pending').length;
  const outstanding = payrollEntries.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);

  // ── Filtered entries ───────────────────────────
  const filteredEntries = payrollEntries.filter(e => {
    const matchName = `${e.teacher?.first_name} ${e.teacher?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchName && matchStatus;
  });

  // ── Handlers ───────────────────────────────────
  const handleSaveStructure = async () => {
    try {
      if (editStructure) {
        await api.updatePayrollStructure(editStructure.id, { name: newStructure.name, amount: Number(newStructure.amount), frequency: newStructure.frequency });
        toast.success('Structure updated');
      } else {
        await api.createPayrollStructure({ name: newStructure.name, amount: Number(newStructure.amount), frequency: newStructure.frequency });
        toast.success('Structure created');
      }
      setStructureModalOpen(false);
      setEditStructure(null);
      setNewStructure({ name: '', amount: '', frequency: 'monthly', description: '' });
      fetchAll();
    } catch { toast.error('Failed to save structure'); }
  };

  const handleDeleteStructure = async (id: string) => {
    try {
      await api.deletePayrollStructure(id);
      toast.success('Structure deleted');
      fetchAll();
    } catch { toast.error('Failed to delete'); }
  };

  const handleGeneratePayslips = async () => {
    if (!generateForm.month || !generateForm.year) {
      toast.error('Select month and year');
      return;
    }
    const teacherIds = generateForm.teacherIds.length > 0
      ? generateForm.teacherIds
      : staff.map(s => s.user_id);

    if (teacherIds.length === 0) { toast.error('No staff found'); return; }
    try {
      const res = await api.bulkAssignPayroll({
        teacherIds,
        structureId: generateForm.structureId || undefined,
        month: generateForm.month,
        year: generateForm.year
      });
      toast.success(res.message || 'Payslips generated');
      setGenerateModalOpen(false);
      fetchAll();
    } catch (e: any) { toast.error(e?.message || 'Failed to generate payslips'); }
  };

  const handlePay = async () => {
    try {
      const res = await api.payTeacher(selectedEntry.id, payDetails);
      toast.success('Payment processed successfully');
      setPayModalOpen(false);
      setSuccessData({ isOpen: true, amount: selectedEntry.amount, receiptNumber: res.transaction_id || `TXN-${Date.now()}` });
      fetchAll();
    } catch { toast.error('Payment failed'); }
  };

  const handleAssignStructure = async () => {
    if (!assignStructureId) { toast.error('Select a structure'); return; }
    try {
      await api.assignStructureToTeacher({ teacherId: assigningTeacher.user_id, structureId: assignStructureId });
      toast.success(`Salary structure assigned to ${assigningTeacher.user?.first_name}`);
      setAssignModalOpen(false);
      setAssignStructureId('');
      fetchAll();
    } catch { toast.error('Failed to assign structure'); }
  };

  const handleNotifyDue = async () => {
    try {
      const res = await api.notifyMonthlySalaryDue();
      if (res.count > 0) {
        toast.success(res.message);
      } else {
        toast.info(res.message);
      }
    } catch { toast.error('Failed to send notifications'); }
  };

  const handleCreateBonus = async () => {
    if (!bonusForm.teacherId || !bonusForm.amount) {
      toast.error('Teacher and Amount are required for a bonus');
      return;
    }
    try {
      const monthStr = `Bonus - ${bonusForm.description || 'Special'}`;
      await api.createPayrollEntry({
        teacher_id: bonusForm.teacherId,
        amount: Number(bonusForm.amount),
        month: monthStr,
        year: new Date().getFullYear().toString(),
        status: 'pending'
      });
      toast.success('Bonus generated successfully! You can now disburse it.');
      setBonusModalOpen(false);
      setBonusForm({ teacherId: '', amount: '', description: '' });
      fetchAll();
    } catch { toast.error('Failed to create bonus'); }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  // ── Teacher-only view ───────────────────────────────
  if (isTeacher) {
    return (
      <div className="space-y-6 max-w-4xl pb-24">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Payslips</h1>
          <p className="text-sm text-gray-500 mt-1">Your salary disbursement history</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-none shadow-sm bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Received</p>
                <p className="text-xl font-black text-gray-900">₹{totalPaid.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pending</p>
                <p className="text-xl font-black text-gray-900">{pendingCount} payslip{pendingCount !== 1 ? 's' : ''}</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-400 uppercase">Period</TableHead>
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-400 uppercase text-right">Amount</TableHead>
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-400 uppercase text-center">Status</TableHead>
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-400 uppercase text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollEntries.map(e => (
                  <TableRow key={e.id} className="hover:bg-gray-50/50">
                    <TableCell className="py-4 px-6 font-bold text-sm">{e.month} {e.year}</TableCell>
                    <TableCell className="py-4 px-6 text-right font-black text-gray-900">₹{Number(e.amount).toLocaleString()}</TableCell>
                    <TableCell className="py-4 px-6 text-center">
                      <Badge className={`border-none text-[10px] font-black uppercase ${e.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{e.status}</Badge>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right text-xs text-gray-500">{e.paid_at ? new Date(e.paid_at).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {payrollEntries.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-gray-400">No payslips yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Admin view ──────────────────────────────────────────
  return (
    <div className="space-y-6 w-full max-w-full pb-24">
      <PaymentSuccessOverlay
        isOpen={successData.isOpen}
        onClose={() => setSuccessData({ ...successData, isOpen: false })}
        amount={successData.amount}
        receiptNumber={successData.receiptNumber}
      />

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Staff Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">Manage salary structures, assign to staff, and process payouts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="rounded-xl border-gray-200 font-bold text-xs h-9" onClick={handleNotifyDue}>
            <BellRing className="w-4 h-4 mr-1.5" /> Notify Due
          </Button>
          <Button variant="outline" className="rounded-xl border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 font-bold text-xs h-9" onClick={() => setBonusModalOpen(true)}>
            <Gift className="w-4 h-4 mr-1.5 text-amber-600" /> Add Bonus
          </Button>
          <Button variant="outline" className="rounded-xl border-gray-200 font-bold text-xs h-9" onClick={() => setStructureModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Structure
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-xs h-9" onClick={() => setGenerateModalOpen(true)}>
            <Send className="w-4 h-4 mr-1.5" /> Generate Payslips
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Disbursed', value: `₹${totalPaid.toLocaleString()}`, icon: IndianRupee, color: 'bg-emerald-50', text: 'text-emerald-600' },
          { label: 'Pending Payslips', value: `${pendingCount}`, icon: Clock, color: 'bg-amber-50', text: 'text-amber-600' },
          { label: 'Outstanding Amount', value: `₹${outstanding.toLocaleString()}`, icon: AlertCircle, color: 'bg-rose-50', text: 'text-rose-600' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center shrink-0`}>
                <stat.icon className={`w-6 h-6 ${stat.text}`} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-xl font-black text-gray-900">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payslips">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="bg-gray-100/50 p-1 rounded-xl flex w-max min-w-full">
            <TabsTrigger value="payslips" className="rounded-lg font-bold text-xs whitespace-nowrap">
              <Banknote className="w-4 h-4 mr-1.5" /> Payslips & Disbursals
            </TabsTrigger>
            <TabsTrigger value="staff" className="rounded-lg font-bold text-xs whitespace-nowrap">
              <Users className="w-4 h-4 mr-1.5" /> Staff & Salaries
            </TabsTrigger>
            <TabsTrigger value="structures" className="rounded-lg font-bold text-xs whitespace-nowrap">
              <DollarSign className="w-4 h-4 mr-1.5" /> Salary Structures
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab 1: Payslips ── */}
        <TabsContent value="payslips" className="mt-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10"
              />

              <input
                type="text"
                placeholder="Search teacher..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
                className="w-full h-11 rounded-xl border border-gray-200 bg-white shadow-sm pl-12 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[160px] rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Teacher</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">Period</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Amount</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">Status</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map(e => (
                      <TableRow key={e.id} className="hover:bg-gray-50/30 border-gray-50">
                        <TableCell className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-xs shrink-0">
                              {e.teacher?.first_name?.[0]}{e.teacher?.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate">{e.teacher?.first_name} {e.teacher?.last_name}</p>
                              <p className="text-xs text-gray-400 truncate">{e.teacher?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center font-bold text-sm text-gray-700 whitespace-nowrap">{e.month} {e.year}</TableCell>
                        <TableCell className="py-3 px-4 text-right font-black text-gray-900 whitespace-nowrap">₹{Number(e.amount).toLocaleString()}</TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <Badge className={`border-none px-2 py-0.5 text-[10px] font-black uppercase whitespace-nowrap ${e.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{e.status}</Badge>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right">
                          {e.status === 'pending' ? (
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg text-xs whitespace-nowrap" onClick={() => { setSelectedEntry(e); setPayModalOpen(true); }}>
                              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pay Now
                            </Button>
                          ) : (
                            <p className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">Paid {e.paid_at ? new Date(e.paid_at).toLocaleDateString() : ''}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredEntries.length === 0 && <TableRow><TableCell colSpan={5} className="py-12 text-center text-gray-400 text-sm">No payslips found. Generate payslips to begin.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Staff & Salaries ── */}
        <TabsContent value="staff" className="mt-5">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Staff Member</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Designation</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Department</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Salary / Month</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((s: any) => (
                      <TableRow key={s.id} className="hover:bg-gray-50/30 border-gray-50">
                        <TableCell className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center font-black text-xs text-gray-600 shrink-0">
                              {s.user?.first_name?.[0]}{s.user?.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate">{s.user?.first_name} {s.user?.last_name}</p>
                              <p className="text-xs text-gray-400 truncate">{s.user?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-sm text-gray-700 font-medium whitespace-nowrap">{s.designation || '—'}</TableCell>
                        <TableCell className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">{s.department || '—'}</TableCell>
                        <TableCell className="py-3 px-4 text-right whitespace-nowrap">
                          {s.salary ? (
                            <span className="font-black text-gray-900">₹{Number(s.salary).toLocaleString()}</span>
                          ) : (
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">Not Set</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg font-bold text-xs border-indigo-100 text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                            onClick={() => { setAssigningTeacher(s); setAssignStructureId(''); setAssignModalOpen(true); }}
                          >
                            <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Assign Structure
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {staff.length === 0 && <TableRow><TableCell colSpan={5} className="py-12 text-center text-gray-400 text-sm">No staff found.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Salary Structures ── */}
        <TabsContent value="structures" className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {structures.map(s => (
              <Card key={s.id} className="border-none shadow-sm bg-white hover:shadow-md transition-all group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-3">
                      <DollarSign className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg" onClick={() => {
                        setEditStructure(s);
                        setNewStructure({ name: s.name, amount: s.amount, frequency: s.frequency, description: '' });
                        setStructureModalOpen(true);
                      }}>
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg" onClick={() => handleDeleteStructure(s.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="font-black text-gray-900 text-sm">{s.name}</p>
                  <p className="text-2xl font-black text-indigo-600 mt-1">₹{Number(s.amount).toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{s.frequency}</p>
                </CardContent>
              </Card>
            ))}
            <Card
              className="border-2 border-dashed border-gray-200 bg-transparent hover:border-indigo-300 transition-all cursor-pointer group"
              onClick={() => { setEditStructure(null); setNewStructure({ name: '', amount: '', frequency: 'monthly', description: '' }); setStructureModalOpen(true); }}
            >
              <CardContent className="p-5 h-full flex flex-col items-center justify-center min-h-[120px] text-gray-400 group-hover:text-indigo-600 transition-colors">
                <Plus className="w-8 h-8 mb-2" />
                <p className="font-bold text-sm">New Structure</p>
              </CardContent>
            </Card>
          </div>
          {structures.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No salary structures yet. Create one to assign to teachers.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modals ── */}

      {/* Structure Modal */}
      <Dialog open={structureModalOpen} onOpenChange={open => { setStructureModalOpen(open); if (!open) setEditStructure(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editStructure ? 'Edit' : 'New'} Salary Structure</DialogTitle>
            <DialogDescription>Define a salary structure that can be assigned to one or more teachers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Structure Name</Label><Input value={newStructure.name} onChange={e => setNewStructure({ ...newStructure, name: e.target.value })} placeholder="e.g. Senior Teacher" /></div>
            <div className="space-y-2"><Label>Monthly Amount (₹)</Label><Input type="number" value={newStructure.amount} onChange={e => setNewStructure({ ...newStructure, amount: e.target.value })} placeholder="50000" /></div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={newStructure.frequency} onValueChange={v => setNewStructure({ ...newStructure, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStructureModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveStructure} className="bg-indigo-600 hover:bg-indigo-700">{editStructure ? 'Update' : 'Create'} Structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Structure Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Assign Salary Structure</DialogTitle>
            <DialogDescription>
              Assigning a structure will update <strong>{assigningTeacher?.user?.first_name} {assigningTeacher?.user?.last_name}</strong>'s monthly salary.
            </DialogDescription>
          </DialogHeader>
          {assigningTeacher && (
            <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3 my-2">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center font-black text-indigo-700 text-sm">
                {assigningTeacher.user?.first_name?.[0]}{assigningTeacher.user?.last_name?.[0]}
              </div>
              <div>
                <p className="font-bold text-sm">{assigningTeacher.user?.first_name} {assigningTeacher.user?.last_name}</p>
                <p className="text-xs text-gray-500">{assigningTeacher.designation} · {assigningTeacher.department || 'General'}</p>
                <p className="text-xs text-gray-400">Current salary: {assigningTeacher.salary ? `₹${Number(assigningTeacher.salary).toLocaleString()}` : 'Not set'}</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Salary Structure</Label>
            <Select value={assignStructureId} onValueChange={setAssignStructureId}>
              <SelectTrigger><SelectValue placeholder="Choose a structure..." /></SelectTrigger>
              <SelectContent>
                {structures.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — ₹{Number(s.amount).toLocaleString()}/month</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignStructure} className="bg-indigo-600 hover:bg-indigo-700">Assign & Update Salary</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Payslips Modal */}
      <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Generate Monthly Payslips</DialogTitle>
            <DialogDescription>Create payslips for all or selected staff. Each teacher's salary will be used automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={generateForm.month} onValueChange={v => setGenerateForm({ ...generateForm, month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input value={generateForm.year} onChange={e => setGenerateForm({ ...generateForm, year: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Override Structure (Optional)</Label>
              <Select value={generateForm.structureId} onValueChange={v => setGenerateForm({ ...generateForm, structureId: v })}>
                <SelectTrigger><SelectValue placeholder="Use each teacher's assigned salary" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Use each teacher's own salary</SelectItem>
                  {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — ₹{Number(s.amount).toLocaleString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Select Staff (leave empty for all)</Label>
              <Select onValueChange={v => { if (!generateForm.teacherIds.includes(v)) setGenerateForm({ ...generateForm, teacherIds: [...generateForm.teacherIds, v] }); }}>
                <SelectTrigger><SelectValue placeholder="Add specific teachers..." /></SelectTrigger>
                <SelectContent>{staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.user?.first_name} {s.user?.last_name}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2 mt-2">
                {generateForm.teacherIds.map(id => {
                  const t = staff.find(x => x.user_id === id);
                  return (
                    <Badge key={id} variant="secondary" className="cursor-pointer gap-1"
                      onClick={() => setGenerateForm({ ...generateForm, teacherIds: generateForm.teacherIds.filter(x => x !== id) })}>
                      {t?.user?.first_name} {t?.user?.last_name} ×
                    </Badge>
                  );
                })}
              </div>
              {generateForm.teacherIds.length === 0 && <p className="text-xs text-gray-400">All {staff.length} staff will be included</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleGeneratePayslips} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="w-4 h-4 mr-2" /> Generate Payslips
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Modal */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Disburse Salary</DialogTitle>
          </DialogHeader>
          <div className="bg-indigo-50 rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Amount to Pay</p>
            <p className="text-3xl font-black text-indigo-900">₹{Number(selectedEntry?.amount || 0).toLocaleString()}</p>
            <p className="text-sm text-indigo-600 font-medium mt-1">{selectedEntry?.teacher?.first_name} {selectedEntry?.teacher?.last_name} · {selectedEntry?.month} {selectedEntry?.year}</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payDetails.accountNumber} onValueChange={v => setPayDetails({ ...payDetails, accountNumber: v, ifsc: '' })}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer / NEFT</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Debit / Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayModalOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} className="bg-indigo-600 hover:bg-indigo-700">
              <CreditCard className="w-4 h-4 mr-2" /> Process Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bonus Modal */}
      <Dialog open={bonusModalOpen} onOpenChange={setBonusModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Bonus / Special Payout</DialogTitle>
            <DialogDescription>Create a one-off payment for a staff member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Staff Member</Label>
              <Select value={bonusForm.teacherId} onValueChange={v => setBonusForm({ ...bonusForm, teacherId: v })}>
                <SelectTrigger><SelectValue placeholder="Choose staff..." /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.user?.first_name} {s.user?.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bonus Amount (₹)</Label>
              <Input type="number" value={bonusForm.amount} onChange={e => setBonusForm({ ...bonusForm, amount: e.target.value })} placeholder="e.g. 5000" />
            </div>
            <div className="space-y-2">
              <Label>Description / Reason</Label>
              <Input value={bonusForm.description} onChange={e => setBonusForm({ ...bonusForm, description: e.target.value })} placeholder="e.g. Diwali Bonus, Excellent Performance" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBonus} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">Generate Bonus Payslip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
