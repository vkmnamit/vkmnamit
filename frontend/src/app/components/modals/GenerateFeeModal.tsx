import { useState } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, Receipt, Mail, Phone, Bell, MessageSquare } from 'lucide-react';

interface GenerateFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  onSuccess?: () => void;
}

const FEE_TYPES = [
  'Admission Fee',
  'Tuition Fee',
  'Transport Fee',
  'Exam Fee',
  'Activity Fee',
  'Late Fee',
  'Other Fee',
];

export function GenerateFeeModal({ isOpen, onClose, studentId, studentName, onSuccess }: GenerateFeeModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    feeType: '',
    title: '',
    amount: '',
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    lateFee: '',
    remarks: '',
    notifyEmail: true,
    notifyWhatsapp: false,
    notifySms: false,
  });

  const isCustom = formData.feeType === 'Other Fee';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.feeType) { toast.error('Please select a fee type'); return; }
    if (!formData.amount || isNaN(Number(formData.amount))) { toast.error('Please enter a valid amount'); return; }

    setLoading(true);
    try {
      await api.addExtraFee({
        studentId,
        title: isCustom ? formData.title : formData.feeType,
        amount: Number(formData.amount),
        dueDate: formData.dueDate,
        lateFee: formData.lateFee ? Number(formData.lateFee) : 0,
        remarks: formData.remarks || formData.feeType,
        notifyEmail: formData.notifyEmail,
        notifyWhatsapp: formData.notifyWhatsapp,
      });
      toast.success(`Fee generated for ${studentName}`);
      onSuccess?.();
      onClose();
      setFormData({
        feeType: '', title: '', amount: '',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        lateFee: '', remarks: '', notifyEmail: true, notifyWhatsapp: false, notifySms: false,
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate fee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] overflow-y-auto max-h-[90vh] bg-white rounded-2xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-black text-gray-900">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
              <Receipt className="w-5 h-5" />
            </div>
            Generate Fee — {studentName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Fee Type */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Fee Type *</Label>
            <Select value={formData.feeType} onValueChange={(v) => setFormData({ ...formData, feeType: v, title: v === 'Other Fee' ? '' : v })}>
              <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select fee category" />
              </SelectTrigger>
              <SelectContent>
                {FEE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Title */}
          {isCustom && (
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Custom Title *</Label>
              <Input required placeholder="e.g. Annual Sports Day Fee" className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
            </div>
          )}

          {/* Amount & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount (₹) *</Label>
              <Input required type="number" min="0" placeholder="e.g. 5000" className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Due Date *</Label>
              <Input required type="date" className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
            </div>
          </div>

          {/* Late Fee & Remarks */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Late Fee (₹/day)</Label>
              <Input type="number" min="0" placeholder="0" className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.lateFee} onChange={(e) => setFormData({ ...formData, lateFee: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Remarks</Label>
              <Input placeholder="Optional notes" className="h-12 rounded-xl bg-gray-50 border-gray-200"
                value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} />
            </div>
          </div>

          {/* Notification Options */}
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 space-y-3">
            <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Multi-Channel Notification</p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-6">
              <label className="flex items-center gap-2 text-sm font-medium cursor-not-allowed opacity-70">
                <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked disabled />
                <Bell className="w-4 h-4 text-blue-500" /> In-App (Auto)
              </label>
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
                <Phone className="w-4 h-4 text-green-500" /> WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-purple-600"
                  checked={formData.notifySms}
                  onChange={(e) => setFormData({ ...formData, notifySms: e.target.checked })} />
                <MessageSquare className="w-4 h-4 text-purple-500" /> SMS
              </label>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-3 flex-col sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl font-bold h-12 w-full sm:w-auto">Cancel</Button>
            <Button type="submit" loading={loading} className="h-12 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full sm:w-auto">
              <Receipt className="w-4 h-4 mr-2" />
              Generate Fee
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
