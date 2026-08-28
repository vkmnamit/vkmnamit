import { useState } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Mail, Phone } from 'lucide-react';

interface MarkPaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  fee: any; // fee_payment record
  studentName: string;
  onSuccess?: () => void;
}

export function MarkPaidModal({ isOpen, onClose, fee, studentName, onSuccess }: MarkPaidModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    paymentMethod: 'cash',
    referenceNumber: '',
    paidDate: new Date().toISOString().split('T')[0],
    remarks: '',
    notifyEmail: true,
    notifyWhatsapp: false,
    discountAmount: 0,
    lateFee: 0,
  });

  const baseAmount = fee ? Number(fee.amount) : 0;
  const existingLateFee = fee ? Number(fee.late_fee || 0) : 0;
  const existingDiscount = fee ? Number(fee.discount_amount || 0) : 0;
  
  const totalExpected = Math.max(0, baseAmount + existingLateFee + Number(formData.lateFee || 0) - existingDiscount - Number(formData.discountAmount || 0));
  const expectedFee = Math.max(0, totalExpected - Number(fee?.paid_amount || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.paymentMethod) { toast.error('Select a payment method'); return; }

    setLoading(true);
    try {
      await api.collectFee({
        paymentId: fee.id,
        amount: expectedFee > 0 ? expectedFee : 0, // ensure we don't send negative amounts if discount > fee
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber || undefined,
        paidDate: formData.paidDate,
        remarks: formData.remarks || `Manual payment by admin — ${formData.paymentMethod.toUpperCase()}`,
        notifyEmail: formData.notifyEmail,
        notifyWhatsapp: formData.notifyWhatsapp,
        discountAmount: formData.discountAmount,
        lateFee: formData.lateFee,
      });
      toast.success(`Payment recorded — receipt generated for ${studentName}`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  if (!fee) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-black text-gray-900">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            Mark as Paid
          </DialogTitle>
        </DialogHeader>

        {/* Fee Summary */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Fee Details</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">{fee.title || fee.remarks || 'Fee Payment'}</p>
              <p className="text-xs text-gray-500 font-medium">{studentName}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-gray-900">₹{expectedFee.toLocaleString()}</p>
              <Badge className="bg-amber-50 text-amber-700 border-none text-[10px] font-bold uppercase mt-1">
                {fee.status}
              </Badge>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Adjustments */}
          <div className="grid grid-cols-2 gap-4 bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Late Fee (+)</Label>
              <Input 
                type="number" 
                min="0"
                className="h-10 rounded-lg bg-rose-50/50 border-rose-100 focus-visible:ring-rose-500"
                value={formData.lateFee || ''}
                onChange={(e) => setFormData({ ...formData, lateFee: Number(e.target.value) })} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Discount (-)</Label>
              <Input 
                type="number" 
                min="0"
                className="h-10 rounded-lg bg-emerald-50/50 border-emerald-100 focus-visible:ring-emerald-500"
                value={formData.discountAmount || ''}
                onChange={(e) => setFormData({ ...formData, discountAmount: Number(e.target.value) })} 
              />
            </div>
          </div>
          {/* Payment Method */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Payment Method *</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI' },
                { value: 'card', label: 'Card' },
                { value: 'cheque', label: 'Cheque' },
                { value: 'bank_transfer', label: 'Bank Transfer' },
                { value: 'other', label: 'Other' },
              ].map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: method.value })}
                  className={`h-10 rounded-xl text-xs font-bold border transition-all ${
                    formData.paymentMethod === method.value
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Reference / Txn No.</Label>
              <Input placeholder="UPI ID / Cheque No." className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.referenceNumber}
                onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Paid Date *</Label>
              <Input required type="date" className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.paidDate}
                onChange={(e) => setFormData({ ...formData, paidDate: e.target.value })} />
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Remarks</Label>
            <Input placeholder="e.g. Collected at front office" className="h-12 rounded-xl bg-gray-50 border-gray-200"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} />
          </div>

          {/* Notification Options */}
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 space-y-3">
            <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Send Receipt Via</p>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-blue-600"
                  checked={formData.notifyEmail}
                  onChange={(e) => setFormData({ ...formData, notifyEmail: e.target.checked })} />
                <Mail className="w-4 h-4 text-blue-500" /> Email
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-green-600"
                  checked={formData.notifyWhatsapp}
                  onChange={(e) => setFormData({ ...formData, notifyWhatsapp: e.target.checked })} />
                <Phone className="w-4 h-4 text-green-500" /> WhatsApp / SMS
              </label>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-3 flex-col sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl font-bold h-12 w-full sm:w-auto">Cancel</Button>
            <Button type="submit" loading={loading} className="h-12 px-8 rounded-xl bg-gray-900 hover:bg-black text-white font-bold w-full sm:w-auto">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirm & Generate Receipt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
