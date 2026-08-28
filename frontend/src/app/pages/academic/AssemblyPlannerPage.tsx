import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Megaphone, Plus, Clock, MapPin, ListOrdered, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function AssemblyPlannerPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: '', date: '', startTime: '', endTime: '', 
    venue: '', type: 'regular', theme: '', dressCode: '', instructions: '',
    classId: '', sectionId: '', activities: [] as any[]
  });

  useEffect(() => {
    loadData();
  }, [filterDate]);

  useEffect(() => {
    loadDropdowns();
  }, []);

  const loadDropdowns = async () => {
    try {
      const cls = await api.getClasses().catch(() => []);
      setClasses(Array.isArray(cls) ? cls : []);
      const mappedSections = Array.isArray(cls) ? cls.flatMap((c: any) => c.sections || []) : [];
      setSections(mappedSections);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (formData.classId && formData.sectionId) {
      api.getStudents({ class_id: formData.classId, section_id: formData.sectionId }).then((res: any) => {
        setStudents(res?.students || []);
      }).catch(console.error);
    } else {
      setStudents([]);
    }
  }, [formData.classId, formData.sectionId]);

  const handlePrefillActivities = () => {
    setFormData({
      ...formData,
      activities: [
        { name: 'National Anthem', assignedToType: 'student', assignedToIds: [] },
        { name: 'Prayer', assignedToType: 'student', assignedToIds: [] },
        { name: 'Pledge', assignedToType: 'student', assignedToIds: [] },
        { name: 'News Reading', assignedToType: 'student', assignedToIds: [] },
        { name: 'Thought of the Day', assignedToType: 'student', assignedToIds: [] },
        { name: 'PT / Warmup', assignedToType: 'student', assignedToIds: [] }
      ]
    });
  };

  const handleAddActivity = () => {
    setFormData({
      ...formData,
      activities: [...formData.activities, { name: '', assignedToType: 'student', assignedToIds: [] }]
    });
  };

  const handleActivityChange = (index: number, field: string, value: any) => {
    const updated = [...formData.activities];
    updated[index][field] = value;
    setFormData({ ...formData, activities: updated });
  };
  
  const handleRemoveActivity = (index: number) => {
    const updated = [...formData.activities];
    updated.splice(index, 1);
    setFormData({ ...formData, activities: updated });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getAssemblies(filterDate ? { startDate: filterDate, endDate: filterDate } : undefined);
      if (!res.error) setAssemblies(res);
    } catch (e) {
      toast.error('Failed to load assemblies');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (assembly: any) => {
    setIsEdit(true);
    setEditId(assembly.id);
    
    // Group activities by name so multi-select works
    const groupedActivities: any[] = [];
    if (assembly.activities) {
      assembly.activities.forEach((a: any) => {
        const existing = groupedActivities.find(g => g.name === a.activity_name);
        if (existing) {
          if (a.assigned_to_id) existing.assignedToIds.push(a.assigned_to_id);
        } else {
          groupedActivities.push({
            name: a.activity_name,
            assignedToType: a.assigned_to_type,
            assignedToIds: a.assigned_to_id ? [a.assigned_to_id] : []
          });
        }
      });
    }

    setFormData({
      title: assembly.title,
      date: assembly.date,
      startTime: assembly.start_time,
      endTime: assembly.end_time,
      venue: assembly.venue,
      type: assembly.type,
      theme: assembly.theme || '',
      dressCode: assembly.dress_code || '',
      instructions: assembly.instructions || '',
      classId: '', 
      sectionId: '', 
      activities: groupedActivities
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assembly?')) return;
    try {
      await api.deleteAssembly(id);
      toast.success('Assembly deleted successfully');
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete assembly');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Expand grouped activities back to individual rows for the backend
      const expandedActivities: any[] = [];
      formData.activities.forEach(act => {
        if (act.assignedToIds && act.assignedToIds.length > 0) {
          act.assignedToIds.forEach((id: string) => {
            const student = students.find(s => s.id === id);
            expandedActivities.push({
              name: act.name,
              assignedToType: act.assignedToType,
              assignedToId: id,
              assignedToName: student ? `${student.user?.first_name || ''} ${student.user?.last_name || ''}` : ''
            });
          });
        } else {
          expandedActivities.push({
            name: act.name,
            assignedToType: act.assignedToType,
            assignedToId: null,
            assignedToName: null
          });
        }
      });

      const payload = { ...formData, activities: expandedActivities };

      let res;
      if (isEdit) {
        res = await api.updateAssembly(editId, payload);
      } else {
        res = await api.createAssembly(payload);
      }
      if (res.error) throw new Error(res.error);
      toast.success(isEdit ? 'Assembly updated!' : 'Assembly scheduled!');
      setShowModal(false);
      setIsEdit(false);
      setEditId('');
      setFormData({
        title: '', date: '', startTime: '', endTime: '', 
        venue: '', type: 'regular', theme: '', dressCode: '', instructions: '',
        classId: '', sectionId: '', activities: []
      });
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error saving assembly');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 sm:gap-0 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-orange-600" />
            Morning Assembly
          </h1>
          <p className="text-gray-500 mt-1">Schedule and organize daily assemblies</p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto flex-col sm:flex-row">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none w-full sm:w-auto"
            title="Filter by date"
          />
          {isStaff && (
            <button
              onClick={() => {
                setIsEdit(false);
                setFormData({
                  title: '', date: '', startTime: '', endTime: '', 
                  venue: '', type: 'regular', theme: '', dressCode: '', instructions: '',
                  classId: '', sectionId: '', activities: []
                });
                setShowModal(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 w-full sm:w-auto shrink-0 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Schedule Assembly
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {assemblies.map((assembly) => (
            <div key={assembly.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-5 border-b border-gray-50 flex justify-between items-start">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 mb-2 inline-block capitalize">
                    {assembly.type.replace('_', ' ')}
                  </span>
                  <h3 className="font-semibold text-gray-900 text-lg leading-tight">{assembly.title}</h3>
                  {assembly.theme && <p className="text-sm text-gray-500 italic mt-1">Theme: {assembly.theme}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                    assembly.status === 'completed' ? 'bg-green-100 text-green-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {assembly.status}
                  </div>
                  {isStaff && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleEdit(assembly)} className="p-1 text-gray-400 hover:text-orange-600 transition-colors" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                      </button>
                      <button onClick={() => handleDelete(assembly.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {new Date(assembly.date).toLocaleDateString()} ({assembly.start_time.substring(0, 5)})
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {assembly.venue || 'School Ground'}
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
                    <ListOrdered className="w-4 h-4" />
                    Activities & Responsibilities
                  </h4>
                  {assembly.activities && assembly.activities.length > 0 ? (
                    <ul className="space-y-2">
                      {assembly.activities.sort((a:any, b:any) => a.sequence_order - b.sequence_order).map((act: any) => (
                        <li key={act.id} className="text-sm flex justify-between p-2 bg-gray-50 rounded">
                          <span className="font-medium text-gray-700">{act.activity_name}</span>
                          <span className="text-gray-500">{act.assigned_to_type}: {act.assigned_to_name || 'TBD'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No specific activities planned yet.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {assemblies.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
              No assemblies planned. Click 'Schedule Assembly' to organize one.
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <h2 className="text-xl font-semibold text-gray-900">{isEdit ? 'Edit Assembly' : 'Schedule Assembly'}</h2>
                <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="e.g. Independence Day Special Assembly" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select required value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                    <option value="regular">Regular Daily Assembly</option>
                    <option value="special">Special Occasion</option>
                    <option value="national_event">National Event</option>
                    <option value="festival">Festival</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input type="time" required value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input type="time" required value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Theme (Optional)</label>
                  <input type="text" value={formData.theme} onChange={e => setFormData({...formData, theme: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="e.g. Environmental Awareness" />
                </div>
              </div>

              {/* Class & Section for Participants */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div className="col-span-1 sm:col-span-2"><h3 className="font-semibold text-gray-800">Leading Class (Optional)</h3></div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                  <select value={formData.classId} onChange={e => setFormData({...formData, classId: e.target.value, sectionId: '', activities: []})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                  <select value={formData.sectionId} onChange={e => setFormData({...formData, sectionId: e.target.value})} disabled={!formData.classId} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-gray-100">
                    <option value="">Select Section</option>
                    {sections.filter(s => s.class_id === formData.classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Activities Builder */}
              {formData.classId && formData.sectionId && (
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">Assembly Activities</h3>
                    <button type="button" onClick={handlePrefillActivities} className="text-sm px-3 py-1 bg-orange-50 text-orange-600 rounded hover:bg-orange-100">
                      Pre-fill Standard Activities
                    </button>
                  </div>
                  
                  {formData.activities.map((act, index) => (
                    <div key={index} className="flex flex-col sm:flex-row items-start gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="flex-1 w-full">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Activity Name</label>
                        <input type="text" required value={act.name} onChange={e => handleActivityChange(index, 'name', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:border-orange-500" placeholder="e.g. Prayer" />
                      </div>
                      <div className="flex-1 w-full space-y-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Student(s)</label>
                        {(act.assignedToIds && act.assignedToIds.length > 0 ? act.assignedToIds : ['']).map((studentId: string, sIdx: number) => (
                          <div key={sIdx} className="flex items-center gap-2">
                            <select 
                              value={studentId}
                              onChange={e => {
                                const newIds = [...(act.assignedToIds || [])];
                                if (newIds.length === 0) newIds.push('');
                                newIds[sIdx] = e.target.value;
                                handleActivityChange(index, 'assignedToIds', newIds);
                              }}
                              className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:border-orange-500"
                            >
                              <option value="">Select Student...</option>
                              {students.map(s => <option key={s.id} value={s.id}>{s.user?.first_name || ''} {s.user?.last_name || ''}</option>)}
                            </select>
                            {sIdx > 0 && (
                              <button type="button" onClick={() => {
                                const newIds = [...(act.assignedToIds || [])];
                                newIds.splice(sIdx, 1);
                                handleActivityChange(index, 'assignedToIds', newIds);
                              }} className="text-red-500 hover:bg-red-50 p-1.5 rounded-md flex-shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => {
                          const newIds = [...(act.assignedToIds || [])];
                          if (newIds.length === 0) newIds.push('');
                          newIds.push('');
                          handleActivityChange(index, 'assignedToIds', newIds);
                        }} className="text-[11px] text-orange-600 font-medium hover:text-orange-700 mt-2 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Add another student
                        </button>
                      </div>
                      <button type="button" onClick={() => handleRemoveActivity(index)} className="mt-2 sm:mt-6 p-1.5 text-red-500 hover:bg-red-50 rounded self-end sm:self-auto">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  
                  <button type="button" onClick={handleAddActivity} className="flex items-center gap-1 text-sm text-orange-600 font-medium hover:text-orange-700">
                    <Plus className="w-4 h-4" /> Add Activity
                  </button>
                </div>
              )}

              
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isEdit ? 'Update Assembly' : 'Schedule Assembly'}
                  </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
