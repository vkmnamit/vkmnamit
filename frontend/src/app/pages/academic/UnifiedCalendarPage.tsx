import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Calendar as CalendarIcon, BookOpen, FileText, Megaphone, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

export default function UnifiedCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    loadEvents();
  }, [currentDate]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      // Get first and last day of current month
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];

      const [lecturesRes, assessmentsRes, assembliesRes] = await Promise.all([
        api.getLecturePlans({ startDate: firstDay, endDate: lastDay }).catch(() => []),
        api.getAssessments().catch(() => []), // Assuming we filter client side or backend supports date ranges
        api.getAssemblies({ startDate: firstDay, endDate: lastDay }).catch(() => []),
      ]);

      const allEvents: any[] = [];
      
      if (!lecturesRes.error) {
        lecturesRes.forEach((l: any) => {
          allEvents.push({
            id: `lec_${l.id}`,
            date: l.date,
            title: l.title,
            type: 'lecture',
            time: l.start_time,
            obj: l
          });
        });
      }

      if (!assessmentsRes.error) {
        assessmentsRes.forEach((a: any) => {
          if (a.due_date) {
            allEvents.push({
              id: `ass_${a.id}`,
              date: a.due_date,
              title: a.title,
              type: 'assessment',
              time: '23:59:00',
              obj: a
            });
          }
        });
      }

      if (!assembliesRes.error) {
        assembliesRes.forEach((a: any) => {
          allEvents.push({
            id: `asm_${a.id}`,
            date: a.date,
            title: a.title,
            type: 'assembly',
            time: a.start_time,
            obj: a
          });
        });
      }

      setEvents(allEvents);
    } catch (e) {
      toast.error('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const today = () => setCurrentDate(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const getEventsForDay = (day: number) => {
    const dStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === dStr).sort((a, b) => a.time.localeCompare(b.time));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-indigo-600" />
            Unified Academic Calendar
          </h1>
          <p className="text-gray-500 mt-1">View all lectures, assessments, and assemblies</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-md transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <button onClick={today} className="px-3 py-1 text-sm font-medium hover:bg-gray-100 rounded-md transition-colors">Today</button>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-md transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex gap-4 text-xs font-medium">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Lecture</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Assessment</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Assembly</span>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider border-r last:border-r-0 border-gray-200">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 bg-gray-200 gap-px">
          {blanks.map(b => (
            <div key={`blank-${b}`} className="bg-gray-50 min-h-[120px] p-2"></div>
          ))}
          {days.map(day => {
            const dayEvents = getEventsForDay(day);
            const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
            
            return (
              <div 
                key={day} 
                onClick={() => setSelectedDay(day)}
                className={`bg-white min-h-[120px] p-2 hover:bg-gray-50 transition-colors cursor-pointer ${isToday ? 'bg-indigo-50/30' : ''}`}
              >
                <div className={`text-sm font-medium mb-2 ${isToday ? 'text-indigo-600 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100' : 'text-gray-500'}`}>
                  {day}
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-thin scrollbar-thumb-gray-200">
                  {dayEvents.map(ev => (
                    <div key={ev.id} className={`text-[10px] p-1.5 rounded truncate border ${
                      ev.type === 'lecture' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                      ev.type === 'assessment' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                      'bg-orange-50 border-orange-100 text-orange-700'
                    }`} title={ev.title}>
                      <span className="font-semibold mr-1">{ev.time.substring(0, 5)}</span>
                      {ev.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Schedule for {selectedDay && new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 pr-2">
            {selectedDay !== null && getEventsForDay(selectedDay).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <CalendarIcon className="w-12 h-12 mb-3 text-gray-200" />
                <p>No events scheduled for this day.</p>
              </div>
            ) : selectedDay !== null && getEventsForDay(selectedDay).map(ev => (
              <div key={ev.id} className={`p-4 rounded-xl border shadow-sm flex flex-col gap-2 ${
                ev.type === 'lecture' ? 'bg-blue-50/50 border-blue-100' :
                ev.type === 'assessment' ? 'bg-purple-50/50 border-purple-100' :
                'bg-orange-50/50 border-orange-100'
              }`}>
                <div className="flex justify-between items-start gap-3">
                  <h4 className="font-bold text-gray-900 leading-tight">{ev.title}</h4>
                  <span className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-white rounded-md border border-gray-100 shadow-sm text-gray-600">
                    <Clock className="w-3 h-3" />
                    {ev.time.substring(0, 5)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    ev.type === 'lecture' ? 'bg-blue-100 text-blue-700' :
                    ev.type === 'assessment' ? 'bg-purple-100 text-purple-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {ev.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
