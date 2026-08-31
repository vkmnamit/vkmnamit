import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import {
  Wallet, Plus, Receipt, CheckCircle2, Clock, AlertCircle,
  RefreshCw, IndianRupee, User, FileText, Calendar
} from 'lucide-react';

const CATEGORIES = [
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'academic', label: 'Academic Supplies' },
  { value: 'inventory', label: 'Inventory / Stock' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'rent', label: 'Rent/Lease' },
  { value: 'salaries', label: 'Staff / Salaries' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
];

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
];

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const emptyForm = {
  payee: '',
  reason: '',
  amount: '',
  category: 'other',
  paymentMethod: 'cash',
  status: 'pending',
  date: new Date().toISOString().split('T')[0],
};

export function FeeBillsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    try {
      const data = await api.getExpenses();
      setBills(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const totalAmount = bills.reduce((s, b) => s + Number(b.amount || 0), 0);
  const paidAmount = bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.amount || 0), 0);
  const pendingAmount = totalAmount - paidAmount;

  const handleCreateBill = async () => {
    if (!form.payee.trim()) { toast.error('Please enter who the bill is to (payee / vendor)'); return; }
    if (!form.reason.trim()) { toast.error('Please enter the reason for the bill'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Please enter a valid amount'); return; }

    try {
      setSaving(true);
      await api.createExpense({
        payee: form.payee.trim(),
        reason: form.reason.trim(),
        title: form.reason.trim(),
        amount: Number(form.amount),
        category: form.category,
        paymentMethod: form.paymentMethod,
        status: form.status,
        date: form.date,
      });
      toast.success(`Bill created${form.status === 'paid' ? ' & marked paid' : ''}`);
      setIsDialogOpen(false);
      setForm({ ...emptyForm });
      fetchBills();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create bill');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (bill: any, method = 'cash') => {
    try {
      setUpdatingId(bill.id);
      await api.updateExpenseBill(bill.id, { status: 'paid', paymentMethod: method });
      toast.success(`Bill ${bill.bill_number || ''} marked as paid`);
      fetchBills();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update bill');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bills & School Payments</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Create a bill for any school expense — inventory, vendors, services, anyone — and it lands in the payment section.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsDialogOpen(true)} className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-xs">
            <Plus className="w-4 h-4 mr-2" />
            Create Bill
          </Button>
        )}
</div>
{/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm bg-white rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-gray-400">Total Billed</p>
                <p className="text-2xl font-black text-gray-900 mt-1">{fmtMoney(totalAmount)}</p>
                <p className="text-[11px] text-gray-400 font-medium mt-1">{bills.length} bill{bills.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-gray-400">Paid</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{fmtMoney(paidAmount)}</p>
                <p className="text-[11px] text-gray-400 font-medium mt-1">{bills.filter(b => b.status === 'paid').length} cleared</p>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-gray-400">Pending</p>
                <p className="text-2xl font-black text-rose-600 mt-1">{fmtMoney(pendingAmount)}</p>
                <p className="text-[11px] text-gray-400 font-medium mt-1">{bills.filter(b => b.status !== 'paid').length} awaiting</p>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-rose-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
{/* Bills ledger */}
      <Card className="border-none shadow-sm bg-white overflow-hidden rounded-2xl">
        <CardHeader className="py-6 px-6 sm:px-8 border-b border-gray-50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Payment Section — School Bills</CardTitle>
            <p className="text-xs text-gray-400 font-medium">Every created bill appears here with its bill number</p>
          </div>
          <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-bold" onClick={fetchBills}>
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400">Bill No & Date</TableHead>
                <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400">To Whom</TableHead>
                <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400">Reason</TableHead>
                <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400">Method</TableHead>
                <TableHead className="py-4 px-6 font-bold text-[10px] uppercase text-gray-400 text-right">Amount</TableHead>
                <TableHead className="py-4 px-8 font-bold text-[10px] uppercase text-gray-400 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill: any) => {
                const isPaid = bill.status === 'paid';
                return (
                  <TableRow key={bill.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell className="py-4 px-8">
                      <p className="text-sm font-bold flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-gray-300" />
                        {bill.bill_number || '—'}
                      </p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {bill.date ? new Date(bill.date).toLocaleDateString() : '—'}
                      </p>
                    </TableCell>
                    <TableCell className="py-4 px-6">
                      <p className="text-sm font-bold flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-300" />
                        {bill.payee || '—'}
                      </p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">{bill.category || ''}</p>
                    </TableCell>
                    <TableCell className="py-4 px-6">
                      <p className="text-sm font-medium text-gray-700 flex items-center gap-2 max-w-[260px]">
                        <FileText className="w-4 h-4 text-gray-300 shrink-0" />
                        <span className="truncate">{bill.reason || bill.title || '—'}</span>
                      </p>
                    </TableCell>
                    <TableCell className="py-4 px-6">
                      <Badge variant="secondary" className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                        {bill.payment_method || 'cash'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right font-black text-gray-900">
                      {fmtMoney(Number(bill.amount || 0))}
                    </TableCell>
                    <TableCell className="py-4 px-8 text-right">
                      {isPaid ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                          Paid
                        </Badge>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] rounded-lg border-gray-200 text-emerald-600 hover:bg-emerald-50"
                              disabled={updatingId === bill.id}
                              onClick={() => handleMarkPaid(bill, bill.payment_method || 'cash')}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-20 text-center text-gray-400 font-bold">
                    <div className="flex flex-col items-center gap-3">
                      <IndianRupee className="w-8 h-8 text-gray-300" />
                      No bills yet. Click "Create Bill" to make one for any school expense.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
</Card>
{/* Create Bill modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create a Bill</DialogTitle>
            <DialogDescription>
              School expense bill — fill amount, reason and who it is being paid to. It gets a bill number and appears in the payment section.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-gray-600">To Whom (payee / vendor) *</Label>
              <Input
                value={form.payee}
                onChange={e => setForm({ ...form, payee: e.target.value })}
                placeholder="e.g. Stationery Mart, Ramesh Electricals, Krishna Traders"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-gray-600">Reason *</Label>
              <Input
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. 20 notebooks for Class 4, lab equipment repair, diesel for van"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-bold text-gray-600">Amount (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold text-gray-600">Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-bold text-gray-600">Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold text-gray-600">Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm({ ...form, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-gray-600">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending — bill issued, not paid yet</SelectItem>
                  <SelectItem value="paid">Paid — payment already made</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBill} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? 'Creating…' : 'Create Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}