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
import { Plus, Percent, Search, Filter } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const DISCOUNT_TYPES = ['scholarship', 'sibling', 'staff_child', 'merit', 'special', 'management', 'custom'];
const RECURRENCE_TYPES = ['one_time', 'monthly', 'quarterly', 'annually'];
const defaultForm = { studentId: '', type: 'custom', recurrence: 'one_time', amount: '', reason: '', feePaymentId: 'none' };

export function FeeDiscountsPage() {
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [modalFilterClass, setModalFilterClass] = useState('all');
  const [modalFilterSection, setModalFilterSection] = useState('all');
  const [filterType, setFilterType] = useState('all');
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
      const [d, s, c] = await Promise.all([
        api.getFeeDiscounts(params),
        // Load ALL active students (not just the default 20) so the
        // class/section filter in the "Apply Discount" modal shows every
        // student in the selected class/section. The backend supports a
        // large `limit` via chunked fetching.
        api.getStudents({ limit: '10000', status: 'active' }),
        api.getClasses(),
      ]);
      setDiscounts(d || []);
      setStudents(Array.isArray(s) ? s : s?.students || []);
      setClasses(c || []);
    } catch { toast.error('Failed to load discounts'); }
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
      toast.error('Student, amount, and reason are required'); return;
    }
    setSaving(true);
    try {
      await api.applyDiscount({
        studentId: form.studentId,
        type: form.type,
        recurrence: form.recurrence,
        amount: parseFloat(form.amount),
        reason: form.reason,
        feePaymentId: (form.feePaymentId && form.feePaymentId !== 'none') ? form.feePaymentId : undefined,
      });
      toast.success('Discount applied and fee amount updated!');
      setIsOpen(false);
      setForm({ ...defaultForm });
      fetchAll();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const totalDiscount = discounts.reduce((s, d) => s + Number(d.amount), 0);

  const filtered = discounts.filter(d => {
    const name = `${d.student?.user?.first_name} ${d.student?.user?.last_name}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || d.type?.includes(search.toLowerCase());
    const matchType = filterType === 'all' || d.type === filterType;
    return matchSearch && matchType;
  });

  const typeColor: Record<string, string> = {
    scholarship: 'bg-blue-100 text-blue-700', sibling: 'bg-purple-100 text-purple-700',
    staff_child: 'bg-teal-100 text-teal-700', merit: 'bg-amber-100 text-amber-700',
    special: 'bg-pink-100 text-pink-700', management: 'bg-indigo-100 text-indigo-700',
    monthly: 'bg-emerald-100 text-emerald-700', quarterly: 'bg-orange-100 text-orange-700',
    annually: 'bg-rose-100 text-rose-700', custom: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Discounts</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Apply and manage fee discounts for students</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsOpen(true)} className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4 mr-2" /> Apply Discount
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Discounts', value: discounts.length, color: 'text-gray-900' },
          { label: 'Total Amount', value: `₹${totalDiscount.toLocaleString('en-IN')}`, color: 'text-emerald-600' },
          { label: 'This Month', value: discounts.filter(d => new Date(d.created_at) > new Date(new Date().setDate(1))).length, color: 'text-blue-600' },
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
          <Input placeholder="Search student or type..." className="pl-10 h-10 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
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
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-10 rounded-xl w-36 text-xs font-bold capitalize">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DISCOUNT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
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
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Class / Section</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Type</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Recurrence</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Reason</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden lg:table-cell">Linked Payment</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-6 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <Percent className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-bold text-sm">No discounts found</p>
                  </td></tr>
                ) : filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{d.student?.user?.first_name} {d.student?.user?.last_name}</p>
                      <p className="text-xs text-gray-400 font-medium">{d.student?.admission_number}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-gray-700">{d.student?.section?.class?.name || '—'}</p>
                      <p className="text-xs text-blue-600 font-bold">{d.student?.section?.name || ''}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={`text-[9px] font-black uppercase border-none capitalize ${typeColor[d.type] || typeColor.custom}`}>{d.type?.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={`text-[9px] font-black uppercase border-none capitalize ${d.recurrence === 'one_time' ? 'bg-gray-100 text-gray-600' : d.recurrence === 'monthly' ? 'bg-emerald-100 text-emerald-700' : d.recurrence === 'quarterly' ? 'bg-orange-100 text-orange-700' : d.recurrence === 'annually' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>
                        {d.recurrence?.replace('_', ' ') || 'one time'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <p className="font-black text-emerald-600">-₹{Number(d.amount).toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-gray-600 text-xs">{d.reason || '—'}</p>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      {d.fee_payment_id
                        ? <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg">✓ Linked</span>
                        : d.recurrence === 'one_time'
                          ? <span className="text-xs text-gray-400">Not linked</span>
                          : <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg">✓ Applied to current fee</span>}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-gray-400 text-xs">{new Date(d.created_at).toLocaleDateString('en-IN')}</p>
                    </td>
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
            <DialogTitle className="font-black text-xl">Apply Discount</DialogTitle>
            <DialogDescription className="text-gray-500 text-sm">
              Discount will auto-link to student's latest pending fee and reduce their dues.
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

            {/* Link to specific fee payment (optional) — shown for ALL recurrence types */}
            {studentPayments.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                  {form.recurrence === 'one_time' ? 'Link to Fee Payment (Optional)' : 'Apply to Current Fee (Optional)'}
                </Label>
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
                <p className="text-[10px] text-gray-400">
                  {form.recurrence === 'one_time'
                    ? 'If not selected, discount will auto-link to the latest pending fee.'
                    : 'If not selected, discount will auto-apply to the latest pending fee. The recurring discount will also apply to future months automatically.'}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Discount Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Recurrence *</Label>
              <Select value={form.recurrence} onValueChange={v => setForm(f => ({ ...f, recurrence: v, feePaymentId: v !== 'one_time' ? 'none' : f.feePaymentId }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.recurrence !== 'one_time' && (
                <p className="text-[10px] text-emerald-600 font-bold bg-emerald-50 p-2 rounded-lg mt-1">
                  Recurring discounts are automatically deducted every time a new {form.recurrence} fee is generated for this student.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount (₹) *</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Reason *</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Merit scholarship" className="h-11 rounded-xl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold" onClick={handleSave} loading={saving}>
                {saving ? 'Applying...' : 'Apply Discount'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
