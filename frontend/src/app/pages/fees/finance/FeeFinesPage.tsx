import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Search, CheckCircle2, Filter } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const defaultForm = { studentId: '', reason: '', amount: '', dueDate: '', remarks: '', feePaymentId: 'none' };

export function FeeFinesPage() {
  const [fines, setFines] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [modalFilterClass, setModalFilterClass] = useState('all');
  const [modalFilterSection, setModalFilterSection] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [studentPayments, setStudentPayments] = useState<any[]>([]);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const availableSections = filterClass !== 'all'
    ? classes.find((c: any) => c.id === filterClass)?.sections || []
    : [];

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filterClass !== 'all') params.classId = filterClass;
      if (filterSection !== 'all') params.sectionId = filterSection;
      const [f, s, c] = await Promise.all([
        api.getFeeFines(params),
        api.getStudents(),
        api.getClasses(),
      ]);
      setFines(f || []);
      setStudents(Array.isArray(s) ? s : s?.students || []);
      setClasses(c || []);
    } catch { toast.error('Failed to load fines'); }
    finally { setLoading(false); }
  }, [filterClass, filterSection]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Load pending payments when student is selected
  useEffect(() => {
    if (!form.studentId) { setStudentPayments([]); return; }
    api.getStudentFeePayments(form.studentId)
      .then((p: any) => setStudentPayments(p || []))
      .catch(() => setStudentPayments([]));
  }, [form.studentId]);

  const handleSave = async () => {
    if (!form.studentId || !form.amount || !form.reason) {
      toast.error('Student, amount, and reason required'); return;
    }
    setSaving(true);
    try {
      await api.addFine({
        studentId: form.studentId,
        reason: form.reason,
        amount: parseFloat(form.amount),
        dueDate: form.dueDate || undefined,
        remarks: form.remarks || undefined,
        feePaymentId: (form.feePaymentId && form.feePaymentId !== 'none') ? form.feePaymentId : undefined,
      });
      toast.success('Fine added — fee amount updated and parent notified!');
      setIsOpen(false);
      setForm({ ...defaultForm });
      fetchAll();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleWaive = async (id: string) => {
    if (!confirm('Waive this fine? This will also reduce the student\'s outstanding amount.')) return;
    try {
      await api.waiveFine(id);
      toast.success('Fine waived and fee amount adjusted!');
      fetchAll();
    } catch { toast.error('Failed to waive fine'); }
  };

  const filtered = fines.filter(f => {
    const name = `${f.student?.user?.first_name} ${f.student?.user?.last_name}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || f.reason?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || (statusFilter === 'pending' && !f.is_paid) || (statusFilter === 'paid' && f.is_paid);
    return matchSearch && matchStatus;
  });

  const totalFines = fines.reduce((s, f) => s + Number(f.amount), 0);
  const pendingFines = fines.filter(f => !f.is_paid);
  const pendingAmt = pendingFines.reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Fee Fines</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Manage late payment and other fines</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsOpen(true)} className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-700 font-bold text-sm shadow-lg shadow-red-600/20">
            <Plus className="w-4 h-4 mr-2" /> Add Fine
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Fines', value: fines.length, color: 'text-gray-900' },
          { label: 'Pending', value: `₹${pendingAmt.toLocaleString('en-IN')}`, color: 'text-red-600' },
          { label: 'Collected', value: `₹${(totalFines - pendingAmt).toLocaleString('en-IN')}`, color: 'text-emerald-600' },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-4 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search student or reason..." className="pl-10 h-10 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <Select value={filterClass} onValueChange={v => { setFilterClass(v); setFilterSection('all'); }}>
            <SelectTrigger className="h-10 rounded-xl w-36 text-xs font-bold">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {availableSections.length > 0 && (
            <Select value={filterSection} onValueChange={setFilterSection}>
              <SelectTrigger className="h-10 rounded-xl w-36 text-xs font-bold">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {availableSections.map((s: any) => <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 rounded-xl w-36 font-bold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid / Waived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Student</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Class / Section</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Reason</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount</th>
                  <th className="text-center px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Due Date</th>
                  <th className="text-center px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden lg:table-cell">Linked</th>
                  <th className="text-center px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</th>
                  {isAdmin && <th className="px-4 py-4 text-center text-[10px] font-black uppercase text-gray-400 tracking-widest">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-6 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <AlertTriangle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-bold text-sm">No fines found</p>
                  </td></tr>
                ) : filtered.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{f.student?.user?.first_name} {f.student?.user?.last_name}</p>
                      <p className="text-xs text-gray-400 font-medium">{f.student?.admission_number}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-sm font-bold text-gray-700">{f.student?.section?.class?.name || '—'}</p>
                      <p className="text-xs text-blue-600 font-bold">{f.student?.section?.name || ''}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-700 font-medium">{f.reason}</p>
                      {f.remarks && <p className="text-xs text-gray-400">{f.remarks}</p>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <p className="font-black text-red-600">+₹{Number(f.amount).toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-4 py-4 text-center hidden md:table-cell">
                      <p className="text-gray-500 text-xs font-medium">{f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN') : '—'}</p>
                    </td>
                    <td className="px-4 py-4 text-center hidden lg:table-cell">
                      {f.fee_payment_id
                        ? <span className="text-xs text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-lg">✓ Linked</span>
                        : <span className="text-xs text-gray-400">Not linked</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge className={`text-[9px] font-black uppercase border-none ${f.is_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {f.is_paid ? 'Paid/Waived' : 'Pending'}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-4 text-center">
                        {!f.is_paid && (
                          <button onClick={() => handleWaive(f.id)} className="flex items-center gap-1 mx-auto px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase transition-all">
                            <CheckCircle2 className="w-3 h-3" /> Waive
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={open => { setIsOpen(open); if (!open) { setForm({ ...defaultForm }); setStudentPayments([]); } }}>
        <DialogContent className="max-w-md bg-white rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">Add Fine</DialogTitle>
            <DialogDescription className="text-gray-500 text-sm">
              Fine will auto-link to student's latest pending fee and increase their dues. Parent will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            
            <div className="flex gap-2">
              <Select value={modalFilterClass} onValueChange={v => { setModalFilterClass(v); setModalFilterSection('all'); setForm(f => ({ ...f, studentId: '', feePaymentId: 'none' })); }}>
                <SelectTrigger className="h-10 rounded-xl text-xs flex-1">
                  <SelectValue placeholder="Filter Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {modalFilterClass !== 'all' && (
                <Select value={modalFilterSection} onValueChange={v => { setModalFilterSection(v); setForm(f => ({ ...f, studentId: '', feePaymentId: 'none' })); }}>
                  <SelectTrigger className="h-10 rounded-xl text-xs flex-1">
                    <SelectValue placeholder="Filter Section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {classes.find((c: any) => c.id === modalFilterClass)?.sections?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Student *</Label>
              <Select value={form.studentId} onValueChange={v => setForm(f => ({ ...f, studentId: v, feePaymentId: 'none' }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {students.filter(s => {
                    if (modalFilterClass !== 'all' && s.section?.class?.id !== modalFilterClass && s.section?.class_id !== modalFilterClass) return false;
                    if (modalFilterSection !== 'all' && s.section?.id !== modalFilterSection && s.section_id !== modalFilterSection) return false;
                    return true;
                  }).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.first_name} {s.user?.last_name} — {s.section?.class?.name || ''} {s.section?.name || ''} ({s.admission_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Link to specific fee payment (optional) */}
            {studentPayments.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Link to Fee Payment (Optional)</Label>
                <Select value={form.feePaymentId} onValueChange={v => setForm(f => ({ ...f, feePaymentId: v }))}>
                  <SelectTrigger className="h-11 rounded-xl text-xs">
                    <SelectValue placeholder="Auto-select latest pending" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Auto-select latest pending</SelectItem>
                    {studentPayments.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fee_structure?.name || p.title || 'Fee'} — ₹{Number(p.amount).toLocaleString('en-IN')} ({p.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400">If not selected, fine will auto-link to the latest pending fee.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Reason *</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Late payment fee" className="h-11 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount (₹) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="h-11 rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Remarks</Label>
              <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional remarks" className="h-11 rounded-xl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 font-bold" onClick={handleSave} loading={saving}>
                {saving ? 'Adding...' : 'Add Fine'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
