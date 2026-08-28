import { useState, useEffect } from 'react';
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
import { Plus, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const defaultForm = { studentId: '', amount: '', reason: '', referenceNumber: '' };

export function FeeRefundsPage() {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [r, s] = await Promise.all([api.getFeeRefunds(), api.getStudents()]);
      setRefunds(r);
      setStudents(Array.isArray(s) ? s : s?.students || []);
    } catch { toast.error('Failed to load refunds'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.studentId || !form.amount || !form.reason) { toast.error('Student, amount, and reason required'); return; }
    setSaving(true);
    try {
      await api.createRefund({ studentId: form.studentId, amount: parseFloat(form.amount), reason: form.reason, referenceNumber: form.referenceNumber || undefined });
      toast.success('Refund created');
      setIsOpen(false); setForm({ ...defaultForm }); fetchAll();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const totalRefunded = refunds.reduce((s, r) => s + Number(r.amount), 0);
  const filtered = refunds.filter(r => {
    const name = `${r.student?.user?.first_name} ${r.student?.user?.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase()) || r.reason?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Refunds</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Process and track fee refunds</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsOpen(true)} className="h-10 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 font-bold text-sm shadow-lg shadow-purple-600/20">
            <Plus className="w-4 h-4 mr-2" /> Create Refund
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Refunds', value: refunds.length, color: 'text-gray-900' },
          { label: 'Total Amount', value: `₹${totalRefunded.toLocaleString('en-IN')}`, color: 'text-purple-600' },
          { label: 'This Month', value: refunds.filter(r => new Date(r.created_at) > new Date(new Date().setDate(1))).length, color: 'text-blue-600' },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-4 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Search by student or reason..." className="pl-12 h-10 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Student</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Reason</th>
                  <th className="text-right px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Reference</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden lg:table-cell">Approved By</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-6 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-16 text-center">
                    <RefreshCw className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-bold text-sm">No refunds processed yet</p>
                  </td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{r.student?.user?.first_name} {r.student?.user?.last_name}</p>
                      <p className="text-xs text-gray-400">{r.student?.admission_number}</p>
                    </td>
                    <td className="px-4 py-4"><p className="text-gray-700 font-medium">{r.reason}</p></td>
                    <td className="px-4 py-4 text-right">
                      <p className="font-black text-purple-600">₹{Number(r.amount).toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-gray-500 text-xs font-mono">{r.reference_number || '—'}</p>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <p className="text-gray-600 text-xs font-medium">{r.approver ? `${r.approver.first_name} ${r.approver.last_name}` : '—'}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString('en-IN')}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">Create Refund</DialogTitle>
            <DialogDescription className="text-gray-500 text-sm">Process a fee refund for a student</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Student *</Label>
              <Select value={form.studentId} onValueChange={v => setForm(f => ({ ...f, studentId: v }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {students.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.user?.first_name} {s.user?.last_name} ({s.admission_number})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount (₹) *</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Reason *</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Duplicate payment" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Reference Number</Label>
              <Input value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} placeholder="Bank/UPI reference" className="h-11 rounded-xl font-mono" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button className="flex-1 h-11 rounded-xl bg-purple-600 hover:bg-purple-700 font-bold" onClick={handleSave} loading={saving}>
                {saving ? 'Processing...' : 'Create Refund'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
