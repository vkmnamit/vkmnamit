import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../../lib/api';
import { toast } from 'sonner';

interface SportsTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  team?: any;
}

export function SportsTeamModal({ isOpen, onClose, onSuccess, team }: SportsTeamModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sport_type: '',
    category: 'Under-15',
    description: '',
    coach_id: ''
  });

  useEffect(() => {
    if (team) {
      setFormData({
        name: team.name || '',
        sport_type: team.sport_type || '',
        category: team.category || 'Under-15',
        description: team.description || '',
        coach_id: team.coach_id || ''
      });
    } else {
      setFormData({
        name: '',
        sport_type: '',
        category: 'Under-15',
        description: '',
        coach_id: ''
      });
    }
  }, [team, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.upsertSportsTeam({
        ...(team?.id ? { id: team.id } : {}),
        ...formData
      });
      toast.success(team ? 'Team updated' : 'Team created');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{team ? 'Edit Team' : 'Create New Team'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Team Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Kautix Tigers, Senior Football Team"
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Sport Type</Label>
              <Input
                value={formData.sport_type}
                onChange={(e) => setFormData({ ...formData, sport_type: e.target.value })}
                placeholder="e.g. Football, Cricket"
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
                  {['Under-12', 'Under-15', 'Under-18', 'Senior', 'Mixed'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
             <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief team overview..."
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl h-11">Cancel</Button>
            <Button type="submit" loading={loading} className="bg-blue-600 hover:bg-blue-700 rounded-xl h-11 px-8 font-bold">
              team ? 'Update Team' : 'Create Team'
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
