import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../../lib/api';
import { toast } from 'sonner';

interface CompetitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  competition?: any;
}

export function CompetitionModal({ isOpen, onClose, onSuccess, competition }: CompetitionModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: 'Sports',
    date: '',
    status: 'upcoming',
    participants: 0,
    prize: ''
  });

  useEffect(() => {
    if (competition) {
      setFormData({
        title: competition.title || competition.name || '',
        category: competition.category || competition.type || 'Sports',
        date: competition.date ? (competition.date.includes(' ') ? competition.date : competition.date.split('T')[0]) : '',
        status: competition.status || 'upcoming',
        participants: competition.participants || 0,
        prize: competition.prize || ''
      });
    } else {
      setFormData({
        title: '',
        category: 'Sports',
        date: '',
        status: 'upcoming',
        participants: 0,
        prize: ''
      });
    }
  }, [competition, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.upsertCompetition({
        ...(competition?.id ? { id: competition.id } : {}),
        ...formData
      });
      toast.success(competition ? 'Competition updated' : 'Competition created');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save competition');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{competition ? 'Edit Competition' : 'New Competition'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Competition Name</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Inter-School Cricket Tournament"
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {['Sports', 'Arts', 'IT', 'Music', 'Academic', 'Other'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  {['upcoming', 'registration', 'active', 'completed'].map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Participants</Label>
              <Input
                type="number"
                value={formData.participants}
                onChange={(e) => setFormData({ ...formData, participants: parseInt(e.target.value) || 0 })}
                className="rounded-xl h-11"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Prize / Reward</Label>
              <Input
                value={formData.prize}
                onChange={(e) => setFormData({ ...formData, prize: e.target.value })}
                placeholder="e.g. Trophy & Gold Medals"
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl h-11">Cancel</Button>
            <Button type="submit" loading={loading} className="bg-blue-600 hover:bg-blue-700 rounded-xl h-11 px-8 font-bold">
              competition ? 'Update Competition' : 'Create Competition'
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
