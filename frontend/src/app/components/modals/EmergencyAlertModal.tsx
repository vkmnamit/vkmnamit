import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { AlertTriangle, Mail, MessageSquare, Phone , Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

interface EmergencyAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
}

export function EmergencyAlertModal({ isOpen, onClose, studentId, studentName }: EmergencyAlertModalProps) {
  const [message, setMessage] = useState(`Emergency alert triggered for ${studentName}. Please contact the school office immediately.`);
  const [channels, setChannels] = useState({
    email: true,
    whatsapp: true
  });
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const selectedChannels = Object.entries(channels)
      .filter(([_, enabled]) => enabled)
      .map(([channel]) => channel);

    if (selectedChannels.length === 0) {
      toast.error('Please select at least one communication channel');
      return;
    }

    setLoading(true);
    try {
      const tId = toast.loading('Dispatching emergency broadcast...');
      await api.sendEmergencyAlert({
        studentId,
        message,
        channels: selectedChannels
      });
      toast.success('Emergency alert delivered to all synchronized nodes', { id: tId });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch emergency alert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-4 border border-red-100">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900 tracking-tight">Emergency Broadcast</DialogTitle>
          <p className="text-sm text-gray-500 font-medium mt-1">This will send an immediate high-priority alert for <strong>{studentName}</strong>.</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Emergency Message</Label>
            <Textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the emergency context..."
              className="min-h-[120px] rounded-2xl bg-gray-50 border-gray-100 focus:ring-red-500/20 focus:border-red-500 resize-none"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Dispatch Channels</Label>
            <div className="grid grid-cols-1 gap-2">
              <div 
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${channels.email ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 hover:border-gray-200'}`}
                onClick={() => setChannels(prev => ({ ...prev, email: !prev.email }))}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${channels.email ? 'bg-blue-600 text-white' : 'bg-white text-gray-400'}`}>
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className={`font-bold text-sm ${channels.email ? 'text-blue-900' : 'text-gray-600'}`}>Email Protocol</span>
                </div>
                <Checkbox checked={channels.email} onCheckedChange={() => {}} className="rounded-full border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
              </div>

              <div 
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${channels.whatsapp ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100 hover:border-gray-200'}`}
                onClick={() => setChannels(prev => ({ ...prev, whatsapp: !prev.whatsapp }))}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${channels.whatsapp ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400'}`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <span className={`font-bold text-sm ${channels.whatsapp ? 'text-emerald-900' : 'text-gray-600'}`}>WhatsApp Direct</span>
                </div>
                <Checkbox checked={channels.whatsapp} onCheckedChange={() => {}} className="rounded-full border-gray-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
              </div>


            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-gray-50">
          <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold text-gray-500">Cancel</Button>
          <Button 
            onClick={handleSend} 
            loading={loading}
            className="rounded-xl bg-red-600 hover:bg-red-700 font-bold px-8 shadow-xl shadow-red-600/20"
          >
            {loading ? 'Dispatching...' : 'Confirm & Broadcast'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
