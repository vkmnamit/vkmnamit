import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { CalendarDays, MapPin, Users, Clock, Plus, Search, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EventModal } from '../../components/modals/EventModal';

export function EventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    try {
      const data = await api.getEvents();
      setEvents(data?.events || data || []);
    } catch {
      setEvents([]);
      toast.error('Failed to sync events');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEvent(id);
      toast.success('Event deleted');
      fetchEvents();
    } catch {
      toast.error('Failed to delete event');
    }
  };

  const handleEdit = (event: any) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const filtered = events.filter(e => e.title?.toLowerCase().includes(search.toLowerCase()));
  const upcoming = filtered.filter(e => e.status === 'upcoming');
  const past = filtered.filter(e => e.status === 'completed');

  const categoryColors: Record<string, string> = {
    Sports: 'bg-blue-50 text-blue-700',
    Academic: 'bg-purple-50 text-purple-700',
    Cultural: 'bg-amber-50 text-amber-700',
    Administrative: 'bg-gray-50 text-gray-700',
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-full">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const EventCard = ({ event }: { event: any }) => (
    <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none ${categoryColors[event.category] || 'bg-gray-50 text-gray-700'}`}>
            {event.category}
          </Badge>
          <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none ${
            event.status === 'upcoming' ? 'bg-blue-50 text-blue-700' :
            event.status === 'ongoing' ? 'bg-emerald-50 text-emerald-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            {event.status}
          </Badge>
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors leading-tight">{event.title}</h3>
        <p className="text-xs font-medium text-gray-500 mb-4 line-clamp-2">{event.description}</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
            {event.date ? new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'TBD'}
          </div>
          {event.venue && (
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              {event.venue}
            </div>
          )}
          {event.participants && (
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              {event.participants} participants
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-50 flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 h-8 rounded-lg font-bold text-xs border-gray-100 gap-1.5"
            onClick={() => handleEdit(event)}
          >
            <Edit className="w-3 h-3" /> Edit
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0 rounded-lg border-gray-100 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => handleDelete(event.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Events</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">School events calendar and management</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search events..." className="pl-12 h-10 w-52 rounded-xl border-gray-200 text-sm font-medium" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 h-10 px-5 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-xs"
            onClick={() => { setSelectedEvent(null); setIsModalOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-2" /> New Event
          </Button>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" /> Upcoming Events ({upcoming.length})
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {upcoming.map(e => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Past Events ({past.length})</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {past.map(e => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <CalendarDays className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400">No events found.</p>
        </div>
      )}

      <EventModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchEvents}
        event={selectedEvent}
      />
    </div>
  );
}
