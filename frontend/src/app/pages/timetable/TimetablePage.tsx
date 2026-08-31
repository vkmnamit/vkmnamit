import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Clock, Plus, Loader2, Sparkles, CheckCircle, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { useAuth } from '../../context/AuthContext';
import { AddTimetableSlotModal } from '../../components/modals/AddTimetableSlotModal';
import { toast } from 'sonner';

export function TimetablePage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [selectedSectionId, setSelectedSectionId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<any>(null);
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [classTeacherIds, setClassTeacherIds] = useState<Record<string, string>>({});

  useEffect(() => { fetchClasses(); }, []);

  useEffect(() => {
    if (!user || !classes?.length) return;
    if (user.role === 'student') {
      api.getStudentDashboard().then((dash) => {
        if (dash?.classId) {
          setSelectedClassId(dash.classId);
          const cls = classes.find(c => c.id === dash.classId);
          setAvailableSections(cls?.sections || []);
        }
        if (dash?.sectionId) setSelectedSectionId(dash.sectionId);
      }).catch(() => {});
    } else if (user.role === 'teacher') {
      api.getTeacherDashboard().then((dash) => {
        if (dash?.primarySectionId) {
          const secId = dash.primarySectionId;
          for (const cls of classes) {
            const sec = cls.sections?.find((s: any) => s.id === secId);
            if (sec) {
              setSelectedClassId(cls.id);
              setAvailableSections(cls.sections || []);
              setSelectedSectionId(secId);
              break;
            }
          }
        }
      }).catch(() => {});
    }
  }, [user, classes]);

  const fetchClasses = async () => {
    try {
      const classData = user?.role === 'teacher' ? await api.getTeacherSections() : await api.getClasses();
      setClasses(classData || []);
      // Build a map of section_id -> class_teacher_id for badge display
      const ctMap: Record<string, string> = {};
      (classData || []).forEach((cls: any) => {
        (cls.sections || []).forEach((sec: any) => {
          if (sec.class_teacher_id) ctMap[sec.id] = sec.class_teacher_id;
        });
      });
      setClassTeacherIds(ctMap);
    } catch {
      console.error('Failed to load classes');
    }
  };

  const fetchTimetable = async () => {
    setLoading(true);
    try {
      const timetableData = await api.getTimetable(
        selectedClassId === 'all' ? undefined : selectedClassId,
        selectedSectionId === 'all' ? undefined : selectedSectionId
      );
      setData(timetableData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load timetable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTimetable(); }, [selectedClassId, selectedSectionId]);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setSelectedSectionId('all');
    if (classId === 'all') {
      setAvailableSections([]);
    } else {
      const cls = classes.find(c => c.id === classId);
      setAvailableSections(cls?.sections || []);
    }
  };

  const handleGenerateAI = async () => {
    const sectionIdToUse = selectedSectionId !== 'all' ? selectedSectionId : null;
    if (!sectionIdToUse) {
      toast.error('Please select a specific section to generate AI timetable');
      return;
    }
    setGenerating(true);
    try {
      const res = await api.generateAITimetableFromPrompt(sectionIdToUse, customPrompt);
      setPreviewData(res.result);
      setIsPreviewModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'AI Generation Failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyAI = async () => {
    if (!previewData || selectedSectionId === 'all') return;
    setGenerating(true);
    try {
      await api.generateAITimetable(selectedSectionId, false, customPrompt || undefined);
      setIsPreviewModalOpen(false);
      setPreviewData(null);
      toast.success('Timetable applied successfully');
      fetchClasses();
      fetchTimetable();
    } catch {
      toast.error('Failed to apply timetable');
    } finally {
      setGenerating(false);
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const buildDynamicTimetable = () => {
    if (!data?.slots?.length) return { byDay: {}, sortedTimes: [], timeRanges: {} };
    const timeSet = new Set<string>();
    const timeRanges: Record<string, string> = {}; // startFormatted -> "HH:MM AM - HH:MM AM"
    const byDay: Record<string, Record<string, any>> = {};
    days.forEach(d => { byDay[d] = {}; });

    data.slots.forEach((slot: any) => {
      const dayName = typeof slot.day_of_week === 'number'
        ? days[slot.day_of_week - 1] || days[0]
        : slot.day_of_week;
      if (!byDay[dayName]) byDay[dayName] = {};

      const startDate = new Date(`2000-01-01T${slot.start_time}`);
      const formattedStart = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      timeSet.add(formattedStart);

      // Store end time range label
      if (slot.end_time && !timeRanges[formattedStart]) {
        const endDate = new Date(`2000-01-01T${slot.end_time}`);
        const formattedEnd = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        timeRanges[formattedStart] = `${formattedStart} – ${formattedEnd}`;
      }

      byDay[dayName][formattedStart] = {
        ...slot,
        subject: slot.subjects?.name || '-',
        teacher: slot.users ? `${slot.users.first_name} ${slot.users.last_name}` : '-',
        room: slot.room_number || slot.room || '-',
        timeRange: slot.end_time
          ? `${formattedStart} – ${new Date(`2000-01-01T${slot.end_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
          : formattedStart,
      };
    });

    const sortedTimes = Array.from(timeSet).sort((a, b) => {
      return new Date(`2000-01-01 ${a}`).getTime() - new Date(`2000-01-01 ${b}`).getTime();
    });

    return { byDay, sortedTimes, timeRanges };
  };

  const { byDay, sortedTimes, timeRanges } = buildDynamicTimetable();
  const timeSlots = sortedTimes.length > 0 ? sortedTimes : ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'];

  const getSubjectColor = (subject: string) => {
    const colors: Record<string, string> = {
      Mathematics: 'bg-blue-100/50 border-blue-200 text-blue-700',
      Science: 'bg-green-100/50 border-green-200 text-green-700',
      English: 'bg-purple-100/50 border-purple-200 text-purple-700',
      'Social Studies': 'bg-orange-100/50 border-orange-200 text-orange-700',
      Computer: 'bg-cyan-100/50 border-cyan-200 text-cyan-700',
      Hindi: 'bg-pink-100/50 border-pink-200 text-pink-700',
      Break: 'bg-gray-100/50 border-gray-200 text-gray-500',
      Sports: 'bg-red-100/50 border-red-200 text-red-700',
    };
    return colors[subject] || 'bg-gray-100/50 border-gray-200 text-gray-700';
  };

  const handleSlotClick = (slotData: any, dayIndex: number, time: string) => {
    if (user?.role !== 'admin') return;
    
    if (selectedSectionId === 'all') {
      toast.error('Please select a specific section first.');
      return;
    }

    if (slotData?.id) {
      setSelectedSlot(slotData);
    } else {
      setSelectedSlot({ day_of_week: dayIndex, start_time: time });
    }
    setIsAddModalOpen(true);
  };

  const handleDeleteSlot = async (slotId: string, slotLabel: string) => {
    if (!confirm(`Delete "${slotLabel}" slot? This cannot be undone.`)) return;
    // Optimistic update — remove from local state immediately
    setData((prev: any) => ({
      ...prev,
      slots: (prev?.slots || []).filter((s: any) => s.id !== slotId)
    }));
    try {
      await api.deleteTimetableSlot(slotId);
      toast.success('Slot deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete slot');
      // Revert on failure
      fetchTimetable();
    }
  };

  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const canEdit = isAdmin;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">
      <AddTimetableSlotModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setSelectedSlot(null); }}
        onSuccess={() => {
          fetchClasses();
          fetchTimetable();
        }}
        slot={selectedSlot}
        sectionId={selectedSectionId !== 'all' ? selectedSectionId : ''}
        classId={selectedClassId !== 'all' ? selectedClassId : ''}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-gray-900">Class Timetable</h1>
        <p className="text-gray-500 text-sm">View and manage weekly schedules</p>
      </div>

      {/* Controls — stacked on mobile */}
      <div className="flex flex-col gap-3">
        {isAdmin && (
          <Input
            placeholder="AI prompt (e.g. Math in period 1)..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="h-12 w-full rounded-xl text-sm border-gray-200"
          />
        )}
        
        {(isAdmin || isTeacher) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {isAdmin && (
              <Button
                loading={generating}
                onClick={handleGenerateAI}
                className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold w-full"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI Sync
              </Button>
            )}
            <Select value={selectedClassId} onValueChange={handleClassChange}>
              <SelectTrigger className="h-12 rounded-xl font-bold border-gray-200 w-full">
                <SelectValue placeholder="Select Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedSectionId} onValueChange={setSelectedSectionId} disabled={selectedClassId === 'all'}>
              <SelectTrigger className="h-12 rounded-xl font-bold border-gray-200 w-full">
                <SelectValue placeholder="Select Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {availableSections.map(s => (
                  <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold w-full"
              onClick={() => {
                if (selectedSectionId === 'all') {
                  toast.error('Please select a specific section.');
                  return;
                }
                setSelectedSlot(null);
                setIsAddModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Slot
            </Button>
          </div>
        )}
      </div>

      {/* Mobile: Day cards */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : data?.slots?.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-gray-400 text-sm">
              No timetable slots yet. Select a class & section, then add slots or use AI Sync.
            </CardContent>
          </Card>
        ) : (
          days.map(day => {
            const daySlots = byDay?.[day] ? Object.entries(byDay[day]) : [];
            if (daySlots.length === 0) return null;
            return (
              <Card key={day} className="border-gray-100">
                <CardHeader className="py-3 px-4 bg-gray-50/50">
                  <CardTitle className="text-sm font-black uppercase text-gray-700">{day}</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  {daySlots.map(([time, period]: [string, any]) => {
                    const isClassTeacher = period.section_id && period.teacher_id && classTeacherIds[period.section_id] === period.teacher_id;
                    const canEditSlot = canEdit && (isAdmin || period.teacher_id === user?.id);
                    return (
                      <div key={time} className={`p-3 rounded-xl border-2 ${getSubjectColor(period.subject)}`}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-black text-xs uppercase">{period.subject}</p>
                              {period.period_number && (
                                <span className="text-[9px] font-black bg-black/10 text-current px-1.5 py-0.5 rounded-full">P{period.period_number}</span>
                              )}
                              {isClassTeacher && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                                  <ShieldCheck className="w-2.5 h-2.5" /> CT
                                </span>
                              )}
                            </div>
                            {period.teacher !== '-' && <p className="text-[10px] font-bold mt-0.5 opacity-80">{period.teacher}</p>}
                            {period.room !== '-' && <p className="text-[10px] opacity-60">Room: {period.room}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] font-bold opacity-70 text-right">{period.timeRange || time}</span>
                            {canEditSlot && (
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/70 hover:bg-white border border-current opacity-60 hover:opacity-100 transition-all"
                                  onClick={() => handleSlotClick(period, period.day_of_week, time)}
                                  title="Edit"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  className="w-6 h-6 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 border border-red-300 text-red-600 hover:opacity-100 transition-all"
                                  onClick={() => handleDeleteSlot(period.id, `${period.subject} on ${day}`)}
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop: Grid table */}
      <Card className="hidden md:block border-gray-100 shadow-sm overflow-hidden">
        <CardHeader className="bg-gray-50/50 border-b py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black">Weekly Distribution</CardTitle>
            <Badge className="bg-indigo-600/10 text-indigo-600 border-0 font-black px-3 py-1">
              <Clock className="w-3 h-3 mr-1" />
              {data?.slots?.length || 0} SLOTS
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr>
                <th className="p-4 bg-gray-50/80 text-[10px] font-black uppercase text-gray-400 text-left border-r border-b">Time</th>
                {days.map(day => (
                  <th key={day} className="p-4 bg-gray-50/80 text-[10px] font-black uppercase text-gray-400 text-center border-b">{day.slice(0, 3)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map(time => (
                <tr key={time}>
                  <td className="p-3 bg-gray-50/30 text-left border-r border-b">
                    <p className="font-black text-xs text-gray-900">{timeRanges[time] || time}</p>
                  </td>
                  {days.map((day, dayIdx) => {
                    const period = byDay?.[day]?.[time];
                    const isClassTeacher = period?.section_id && period?.teacher_id && classTeacherIds[period.section_id] === period.teacher_id;
                    const canEditSlot = canEdit && (isAdmin || period?.teacher_id === user?.id);
                    return (
                      <td key={`${day}-${time}`} className="p-2 border-b">
                        {loading ? (
                          <Skeleton className="h-16 w-full rounded-xl" />
                        ) : period && period.subject !== '-' ? (
                          <div className={`p-2 rounded-xl border-2 ${getSubjectColor(period.subject)} group relative`}>
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <p className="font-black text-[10px] uppercase">{period.subject}</p>
                                  {period.period_number && (
                                    <span className="text-[8px] font-black bg-black/10 text-current px-1 py-0.5 rounded-full">P{period.period_number}</span>
                                  )}
                                  {isClassTeacher && (
                                    <span title="Class Teacher" className="inline-flex items-center gap-0.5 text-[8px] font-bold bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded-full">
                                      <ShieldCheck className="w-2 h-2" /> CT
                                    </span>
                                  )}
                                </div>
                                {period.teacher !== '-' && <p className="text-[9px] font-bold opacity-80">{period.teacher}</p>}
                              </div>
                              {canEditSlot && (
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    className="w-5 h-5 flex items-center justify-center rounded bg-white/80 hover:bg-white border border-current text-current"
                                    onClick={(e) => { e.stopPropagation(); handleSlotClick(period, dayIdx + 1, time); }}
                                    title="Edit"
                                  ><Pencil className="w-2.5 h-2.5" /></button>
                                  <button
                                    className="w-5 h-5 flex items-center justify-center rounded bg-red-50 hover:bg-red-100 border border-red-300 text-red-600"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSlot(period.id, `${period.subject} on ${day}`); }}
                                    title="Delete"
                                  ><Trash2 className="w-2.5 h-2.5" /></button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : canEdit && selectedSectionId !== 'all' ? (
                          <div
                            className="text-center text-gray-300 font-black text-lg hover:text-indigo-600 hover:bg-indigo-50/50 rounded-xl cursor-pointer p-2"
                            onClick={() => handleSlotClick(null, dayIdx + 1, time)}
                          >+</div>
                        ) : (
                          <div className="text-center text-gray-200 font-black text-lg p-2">-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* AI Preview Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-none overflow-hidden max-h-[85vh] flex flex-col">
            <CardHeader className="bg-indigo-600 p-6 text-white shrink-0">
              <CardTitle className="text-xl font-black flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> AI Timetable Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                {previewData?.slots?.map((slot: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-indigo-600 shadow-sm">D{slot.day_of_week}</div>
                    <div>
                      <p className="font-black text-sm">{slot.subject_name || 'Subject'}</p>
                      <p className="text-[10px] text-gray-500">Period {slot.period_number} • {slot.start_time} - {slot.end_time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl font-bold" onClick={() => setIsPreviewModalOpen(false)}>Discard</Button>
                <Button loading={generating} className="flex-1 h-12 rounded-2xl bg-indigo-600 font-black" onClick={handleApplyAI}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Apply Timetable
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
