import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

interface EditParentModalProps {
  isOpen: boolean;
  onClose: () => void;
  parent: any;
  onSuccess: () => void;
}

export function EditParentModal({ isOpen, onClose, parent, onSuccess }: EditParentModalProps) {
  const [formData, setFormData] = useState({
    firstName: parent?.user?.first_name || '',
    lastName: parent?.user?.last_name || '',
    email: parent?.user?.email || '',
    phone: parent?.user?.phone || '',
    occupation: parent?.occupation || '',
    address: parent?.address || '',
    city: parent?.city || '',
    state: parent?.state || '',
    pincode: parent?.pincode || ''
  });
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await api.updateParent(parent.id, formData);
      toast.success('Guardian configuration synchronized');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] rounded-3xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900 tracking-tight">Modify Guardian Profile</DialogTitle>
          <p className="text-sm text-gray-500 font-medium mt-1">Synchronize personal data and residential protocols for the family node.</p>
        </DialogHeader>

        <div className="space-y-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">First Name</Label>
              <Input value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Last Name</Label>
              <Input value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Email Protocol</Label>
              <Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Phone Gateway</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
            </div>
          </div>

          <div className="space-y-4">
             <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Residential Address</Label>
                <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
             </div>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">State</Label>
                  <Input value={formData.state} onChange={(e) => setFormData({...formData, state: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Pincode</Label>
                  <Input value={formData.pincode} onChange={(e) => setFormData({...formData, pincode: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
                </div>
             </div>
          </div>

          <div className="space-y-2">
             <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Professional Occupation</Label>
             <Input value={formData.occupation} onChange={(e) => setFormData({...formData, occupation: e.target.value})} className="rounded-xl bg-gray-50 border-gray-100 h-11" />
          </div>
        </div>

        <DialogFooter className="pt-6 border-t border-gray-50">
          <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold text-gray-500">Discard</Button>
          <Button onClick={handleUpdate} loading={loading} className="rounded-xl bg-amber-600 hover:bg-amber-700 font-bold px-8 shadow-xl shadow-amber-600/20 text-white">
            'Synchronize Profile'
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
