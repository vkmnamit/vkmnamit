import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../../lib/api';
import { toast } from 'sonner';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  event?: any;
}

export function EventModal({ isOpen, onClose, onSuccess, event }: EventModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    type: 'Academic',
    date: '',
    location: '',
    description: '',
    attendees: 0,
    status: 'upcoming'
  });

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title || '',
        type: event.type || event.category || 'Academic',
        date: event.date ? event.date.split('T')[0] : '',
        location: event.location || event.venue || '',
        description: event.description || '',
        attendees: event.attendees || event.participants || 0,
        status: event.status || 'upcoming'
      });
    } else {
      setFormData({
        title: '',
        type: 'Academic',
        date: '',
        location: '',
        description: '',
        attendees: 0,
        status: 'upcoming'
      });
    }
  }, [event, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.upsertEvent({
        ...(event?.id ? { id: event.id } : {}),
        ...formData
      });
      toast.success(event ? 'Event updated' : 'Event created');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{event ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Event Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Annual Sports Day"
                required
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Category</Label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {['Academic', 'Sports', 'Cultural', 'Administrative', 'Other'].map(c => (
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
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Venue / Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. School Auditorium"
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
                  {['upcoming', 'ongoing', 'completed', 'cancelled'].map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Attendees</Label>
              <Input
                type="number"
                value={formData.attendees}
                onChange={(e) => setFormData({ ...formData, attendees: parseInt(e.target.value) || 0 })}
                className="rounded-xl h-11"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase text-gray-500">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Tell us about the event..."
                className="rounded-xl min-h-[100px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl h-11">Cancel</Button>
            <Button type="submit" loading={loading} className="bg-blue-600 hover:bg-blue-700 rounded-xl h-11 px-8 font-bold">
              event ? 'Update Event' : 'Create Event'
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
