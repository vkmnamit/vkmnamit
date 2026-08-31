import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Calendar, CheckCircle2, AlertCircle, Plus, Users, Pencil, Trash2, AlertTriangle, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Skeleton } from '../../components/ui/skeleton';
import { BulkPromoteStudents } from '../../components/academic/BulkPromoteStudents';
import { ViewStudentsModal } from '../../components/modals/ViewStudentsModal';
import { RolloverModal } from '../../components/academic/RolloverModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

export default function AcademicYearsPage() {
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('years');

  // Create Form State
  const [newYearName, setNewYearName] = useState('');
  const [newYearStart, setNewYearStart] = useState('');
  const [newYearEnd, setNewYearEnd] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [isStudentsModalOpen, setIsStudentsModalOpen] = useState(false);
  const [selectedYearForModal, setSelectedYearForModal] = useState<any>(null);

  // Edit modal state
  const [editingYear, setEditingYear] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editIsCurrent, setEditIsCurrent] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; year: any }>({ open: false, year: null });
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Rollover logs state
  const [rolloverLogs, setRolloverLogs] = useState<any[]>([]);
  const [rolloverLogsLoading, setRolloverLogsLoading] = useState(false);
  const [isRolloverModalOpen, setIsRolloverModalOpen] = useState(false);
  const [editingRollover, setEditingRollover] = useState<any>(null);

  useEffect(() => {
    // Auto-fill dates based on name format YYYY-YYYY
    const match = newYearName.match(/^(\d{4})-(\d{4})$/);
    if (match) {
      const start = match[1];
      const end = match[2];
      if (!newYearStart) setNewYearStart(`${start}-04-01`);
      if (!newYearEnd) setNewYearEnd(`${end}-03-31`);
    }
  }, [newYearName]);

  useEffect(() => {
    fetchYears();
    fetchRolloverLogs();
  }, []);

  const fetchYears = async () => {
    try {
      setLoading(true);
      const data = await api.getAcademicYears();
      setYears(data || []);
    } catch (error) {
      toast.error('Failed to load academic years');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newYearName || !newYearStart || !newYearEnd) {
        return toast.error('Please fill all fields');
      }
      if (new Date(newYearEnd) <= new Date(newYearStart)) {
        return toast.error('The academic year end date must be after the start date.');
      }
      await api.createAcademicYear({
        name: newYearName,
        start_date: newYearStart,
        end_date: newYearEnd,
        is_current: isCurrent
      });
      toast.success('Academic Year created successfully!');
      fetchYears();
      setNewYearName('');
      setNewYearStart('');
      setNewYearEnd('');
      setIsCurrent(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create academic year');
    }
  };

  const handleSetCurrent = async (id: string) => {
    try {
      await api.setCurrentAcademicYear(id);
      toast.success('Academic year activated successfully!');
      fetchYears();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to set active year');
    }
  };

  const openEditModal = (y: any) => {
    setEditingYear(y);
    setEditName(y.name);
    setEditStart(y.start_date?.split('T')[0] || '');
    setEditEnd(y.end_date?.split('T')[0] || '');
    setEditIsCurrent(y.is_current);
  };

  const handleEditSave = async () => {
    if (!editName || !editStart || !editEnd) return toast.error('Please fill all fields');
    if (new Date(editEnd) <= new Date(editStart)) return toast.error('End date must be after start date.');
    setEditLoading(true);
    try {
      await api.updateAcademicYear(editingYear.id, { name: editName, start_date: editStart, end_date: editEnd, is_current: editIsCurrent });
      toast.success('Academic year updated!');
      setEditingYear(null);
      fetchYears();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.year) return;
    setDeleteLoading(true);
    try {
      await api.deleteAcademicYear(deleteConfirm.year.id);
      toast.success(`"${deleteConfirm.year.name}" deleted.`);
      setDeleteConfirm({ open: false, year: null });
      fetchYears();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete — make sure no students are enrolled in this year.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchRolloverLogs = async () => {
    setRolloverLogsLoading(true);
    try {
      const data = await api.getRolloverLogs();
      setRolloverLogs(data || []);
    } catch (error) {
      console.error('Failed to load rollover logs:', error);
    } finally {
      setRolloverLogsLoading(false);
    }
  };

  const handleEditRollover = (log: any) => {
    setEditingRollover({
      id: log.id,
      from_academic_year_id: log.from_academic_year_id,
      to_academic_year_id: log.to_academic_year_id,
      fee_increase_percent: log.fee_increase_percent || 0,
    });
    setIsRolloverModalOpen(true);
  };

  if (loading) return <div className="p-6"><Skeleton className="h-[400px] w-full rounded-2xl" /></div>;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Academic Setup & Promotions</h1>
        <p className="text-gray-500 text-sm mt-1">Manage academic years and handle end-of-year student promotions.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex-wrap justify-start bg-transparent h-auto p-0 gap-2 mb-6">
          <TabsTrigger value="years" className="rounded-xl px-5 py-2.5 data-[state=active]:bg-gray-900 data-[state=active]:text-white font-bold text-sm bg-white border border-gray-100 shadow-sm text-gray-500">
            <Calendar className="w-4 h-4 mr-2" /> Academic Years
          </TabsTrigger>
          <TabsTrigger value="promote" className="rounded-xl px-5 py-2.5 data-[state=active]:bg-gray-900 data-[state=active]:text-white font-bold text-sm bg-white border border-gray-100 shadow-sm text-gray-500">
            <Users className="w-4 h-4 mr-2" /> Bulk Promotions
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-xl px-5 py-2.5 data-[state=active]:bg-gray-900 data-[state=active]:text-white font-bold text-sm bg-white border border-gray-100 shadow-sm text-gray-500">
            <Activity className="w-4 h-4 mr-2" /> Rollover Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Create Form */}
            <div className="md:col-span-1">
              <Card className="rounded-3xl border-gray-100 shadow-sm">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                  <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Start Academic Year
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleCreateYear} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Name (e.g. 2025-2026)</label>
                      <input type="text" value={newYearName} onChange={e => setNewYearName(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="2025-2026" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Start Date</label>
                        <input type="date" value={newYearStart} onChange={e => setNewYearStart(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">End Date</label>
                        <input type="date" min={newYearStart || undefined} value={newYearEnd} onChange={e => setNewYearEnd(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" id="isCurrent" checked={isCurrent} onChange={e => setIsCurrent(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <label htmlFor="isCurrent" className="text-sm font-bold text-gray-700">Set as Active Year</label>
                    </div>
                    <Button type="submit" className="w-full font-bold h-10 rounded-xl mt-4">Create Academic Year</Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* List */}
            <div className="md:col-span-2">
              <Card className="rounded-3xl border-gray-100 shadow-sm h-full">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                  <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Academic Years
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {years.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {years.map((y: any) => (
                        <div key={y.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-bold text-lg text-gray-900">{y.name}</h3>
                              {y.is_current ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-500 font-bold bg-gray-50 border-gray-200">Inactive</Badge>
                              )}
                              {y.student_count !== undefined && (
                                <Badge className="bg-blue-50 text-blue-700 border-none font-bold">
                                  <Users className="w-3 h-3 mr-1" /> {y.student_count} Students
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-gray-500">
                              {new Date(y.start_date).toLocaleDateString()} - {new Date(y.end_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setSelectedYearForModal(y); setIsStudentsModalOpen(true); }}
                              className="font-bold text-gray-700 bg-white border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap"
                            >
                              <Users className="w-3.5 h-3.5 mr-1" /> View Students
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(y)}
                              className="font-bold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl"
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                            </Button>
                            {!y.is_current && (
                              <Button variant="outline" size="sm" onClick={() => handleSetCurrent(y.id)} className="font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50 rounded-xl whitespace-nowrap">
                                Set Active
                              </Button>
                            )}
                            {!y.is_current && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteConfirm({ open: true, year: y })}
                                className="font-bold text-red-600 border-red-200 hover:bg-red-50 rounded-xl"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center flex flex-col items-center">
                      <AlertCircle className="w-10 h-10 text-gray-200 mb-3" />
                      <p className="text-gray-500 font-medium">No academic years found.</p>
                      <p className="text-gray-400 text-sm mt-1">Start by creating your first academic year.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="promote" className="mt-0 animate-in fade-in slide-in-from-bottom-2">
          <BulkPromoteStudents />
        </TabsContent>

        <TabsContent value="logs" className="mt-0 animate-in fade-in slide-in-from-bottom-2">
          <Card className="rounded-3xl border-gray-100 shadow-sm">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100">
              <CardTitle className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4" /> Rollover History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {rolloverLogsLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading rollover logs...</p>
                </div>
              ) : rolloverLogs.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {rolloverLogs.map((log: any) => (
                    <div key={log.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-gray-900">
                              {log.from_year?.name || 'Unknown'} → {log.to_year?.name || 'Unknown'}
                            </h3>
                            <Badge
                              className={
                                log.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-none font-bold' :
                                  log.status === 'failed' ? 'bg-red-50 text-red-700 border-none font-bold' :
                                    'bg-amber-50 text-amber-700 border-none font-bold'
                              }
                            >
                              {log.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                              {log.status === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
                              {log.status === 'running' && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-700 mr-1"></div>}
                              {log.status?.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-gray-500 block">Promoted</span>
                              <span className="font-bold text-gray-900">{log.students_promoted || 0}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block">Passed Out</span>
                              <span className="font-bold text-gray-900">{log.students_passed_out || 0}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block">Fees Copied</span>
                              <span className="font-bold text-gray-900">{log.fee_structures_copied || 0}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block">Fee Increase</span>
                              <span className="font-bold text-gray-900">{log.fee_increase_percent || 0}%</span>
                            </div>
                          </div>
                          {log.error_message && (
                            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                              <strong>Error:</strong> {log.error_message}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-gray-400">
                            {new Date(log.created_at).toLocaleString()} • {log.generation_time_ms ? `${(log.generation_time_ms / 1000).toFixed(1)}s` : 'N/A'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRollover(log)}
                            className="font-bold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit & Re-run
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center flex flex-col items-center">
                  <Activity className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-gray-500 font-medium">No rollover logs found.</p>
                  <p className="text-gray-400 text-sm mt-1">Execute a rollover to see it here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <ViewStudentsModal
          isOpen={isStudentsModalOpen}
          onClose={() => setIsStudentsModalOpen(false)}
          academicYearId={selectedYearForModal?.id}
          academicYearName={selectedYearForModal?.name}
        />
      </Tabs>

      {/* Rollover Modal (for both new and edit) */}
      <RolloverModal
        open={isRolloverModalOpen}
        onClose={() => {
          setIsRolloverModalOpen(false);
          setEditingRollover(null);
        }}
        academicYears={years}
        currentYear={years.find(y => y.is_current) || null}
        onRolloverComplete={() => {
          fetchRolloverLogs();
          fetchYears();
        }}
        editMode={!!editingRollover}
        editData={editingRollover}
      />

      {/* Edit Modal */}
      <Dialog open={!!editingYear} onOpenChange={(open) => { if (!open) setEditingYear(null); }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[460px] rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black"><Pencil className="w-4 h-4 text-blue-500" /> Edit Academic Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Year Name</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Start Date</label>
                <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">End Date</label>
                <input type="date" min={editStart || undefined} value={editEnd} onChange={e => setEditEnd(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="editIsCurrent" checked={editIsCurrent} onChange={e => setEditIsCurrent(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <label htmlFor="editIsCurrent" className="text-sm font-bold text-gray-700">Set as Active Year</label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingYear(null)} disabled={editLoading} className="rounded-xl">Cancel</Button>
            <Button onClick={handleEditSave} disabled={editLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">
              {editLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => { if (!open) setDeleteConfirm({ open: false, year: null }); }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[420px] rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="w-5 h-5" /> Delete Academic Year</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-gray-600">
            Are you sure you want to delete <strong>"{deleteConfirm.year?.name}"</strong>?
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-xs font-semibold">
              ⚠️ If students are still enrolled in this year, deletion will fail. Remove or reassign those students first.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, year: null })} disabled={deleteLoading} className="rounded-xl">Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={deleteLoading} className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl">
              {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
