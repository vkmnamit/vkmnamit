import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from 'sonner';
import {
  BookOpen, Plus, Trash2, Search, GraduationCap, Link2, X,
  Tag, AlignLeft, AlertCircle, UserCheck, Layers
} from 'lucide-react';

interface Subject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_elective?: boolean;
}

interface ClassSubject {
  id: string;
  classSubjectId: string;
  name: string;
  code?: string;
  isElective?: boolean;
  periodsPerWeek: number;
  teacher?: { id: string; name: string } | null;
}

interface ClassData {
  id: string;
  name: string;
  grade: number;
  sections?: any[];
}

interface Teacher {
  id: string;
  userId?: string;
  profile?: { first_name?: string; last_name?: string; full_name?: string };
  first_name?: string;
  last_name?: string;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingClassSubjects, setLoadingClassSubjects] = useState(false);
  const [search, setSearch] = useState('');

  // Modal states
  const [isCreateSubjectOpen, setIsCreateSubjectOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectDesc, setNewSubjectDesc] = useState('');
  const [newSubjectElective, setNewSubjectElective] = useState(false);
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignPeriods, setAssignPeriods] = useState('5');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      const cls = classes.find(c => c.id === selectedClassId);
      setSections(cls?.sections || []);
      setSelectedSectionId('');
      setClassSubjects([]);
    } else {
      setSections([]);
      setSelectedSectionId('');
      setClassSubjects([]);
    }
  }, [selectedClassId, classes]);

  useEffect(() => {
    if (selectedSectionId) {
      fetchSectionSubjects(selectedSectionId);
    } else {
      setClassSubjects([]);
    }
  }, [selectedSectionId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [subjectsData, classesData, teachersData] = await Promise.all([
        api.getSubjects(),
        api.getClasses(),
        api.getTeachers(),
      ]);
      setSubjects(subjectsData || []);
      setClasses(classesData || []);
      const teacherList = teachersData?.data || teachersData?.teachers || (Array.isArray(teachersData) ? teachersData : []);
      setTeachers(teacherList);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSectionSubjects = async (sectionId: string) => {
    setLoadingClassSubjects(true);
    try {
      const data = await api.getSubjects({ sectionId });
      setClassSubjects(data || []);
    } catch {
      toast.error('Failed to load subjects for this section');
    } finally {
      setLoadingClassSubjects(false);
    }
  };

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) { toast.error('Subject name is required'); return; }
    setSaving(true);
    try {
      await api.createSubject({
        name: newSubjectName.trim(),
        code: newSubjectCode.trim() || undefined,
        description: newSubjectDesc.trim() || undefined,
        isElective: newSubjectElective,
      });
      toast.success(`Subject "${newSubjectName}" created`);
      setIsCreateSubjectOpen(false);
      setNewSubjectName(''); setNewSubjectCode(''); setNewSubjectDesc(''); setNewSubjectElective(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create subject');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (id: string, name: string) => {
    if (!confirm(`Delete subject "${name}"? It will be removed from all classes.`)) return;
    try {
      await api.deleteSubject(id);
      toast.success(`Subject "${name}" deleted`);
      fetchAll();
      if (selectedSectionId) fetchSectionSubjects(selectedSectionId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete subject');
    }
  };

  const handleAssignSubject = async () => {
    if (!selectedClassId || !selectedSectionId || !assignSubjectId) {
      toast.error('Select class, section, and subject');
      return;
    }
    setSaving(true);
    try {
      await api.addSubjectToClass({
        classId: selectedClassId,
        sectionId: selectedSectionId,
        subjectId: assignSubjectId,
        teacherId: assignTeacherId || undefined,
        periodsPerWeek: parseInt(assignPeriods) || 5,
      });
      toast.success('Subject assigned to section');
      setIsAssignOpen(false);
      setAssignSubjectId(''); setAssignTeacherId(''); setAssignPeriods('5');
      fetchSectionSubjects(selectedSectionId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign subject');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromClass = async (classSubjectId: string, name: string) => {
    if (!confirm(`Remove "${name}" from this class?`)) return;
    try {
      await api.removeSubjectFromClass(classSubjectId);
      toast.success(`"${name}" removed from class`);
      if (selectedSectionId) fetchSectionSubjects(selectedSectionId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove subject');
    }
  };

  const filteredSubjects = subjects.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedClass = classes.find(c => c.id === selectedClassId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Subject Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create subjects, then assign them to classes with teachers
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 rounded-xl h-10 font-bold shadow-lg shadow-blue-600/20"
          onClick={() => setIsCreateSubjectOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Subject
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── All Subjects Library ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                Subject Library
                <Badge variant="outline" className="ml-auto">{subjects.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Search */}
              <div className="relative w-full">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10"
                />

                <input
                  type="search"
                  placeholder="Search subjects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 rounded-xl border border-gray-200 bg-white shadow-sm pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {filteredSubjects.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No subjects found</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setIsCreateSubjectOpen(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Create first subject
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredSubjects.map(sub => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between bg-gray-50/70 hover:bg-blue-50/50 border border-gray-100 hover:border-blue-200 rounded-xl px-4 py-3 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-gray-800">{sub.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {sub.code && (
                              <span className="text-[10px] font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                                {sub.code}
                              </span>
                            )}
                            {sub.is_elective && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-300 text-amber-700 bg-amber-50">
                                Elective
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteSubject(sub.id, sub.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Class Subject Assignment ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                Assign Subjects to Class
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Class & Section picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Select Class</Label>
                  <select
                    className="w-full h-9 rounded-lg border border-gray-200 text-sm bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                  >
                    <option value="">-- Pick a class --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Select Section</Label>
                  <select
                    className="w-full h-9 rounded-lg border border-gray-200 text-sm bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedSectionId}
                    disabled={!selectedClassId}
                    onChange={e => setSelectedSectionId(e.target.value)}
                  >
                    <option value="">-- Pick a section --</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>Section {s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedClassId && selectedSectionId && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">
                      Subjects in {selectedClass?.name} - Section {sections.find(s => s.id === selectedSectionId)?.name}
                    </p>
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs"
                      onClick={() => setIsAssignOpen(true)}
                    >
                      <Link2 className="w-3 h-3 mr-1" /> Assign Subject
                    </Button>
                  </div>

                  {loadingClassSubjects ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
                    </div>
                  ) : classSubjects.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm text-gray-400">No subjects assigned to this class</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setIsAssignOpen(true)}
                      >
                        <Link2 className="w-3 h-3 mr-1" /> Assign first subject
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {classSubjects.map(cs => (
                        <div
                          key={cs.classSubjectId}
                          className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center">
                              <BookOpen className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-gray-800">{cs.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-gray-500 font-medium">
                                  {cs.periodsPerWeek} periods/week
                                </span>
                                {cs.teacher && (
                                  <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5">
                                    <UserCheck className="w-3 h-3" />
                                    {cs.teacher.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                            onClick={() => handleRemoveFromClass(cs.classSubjectId, cs.name)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {(!selectedClassId || !selectedSectionId) && (
                <div className="text-center py-12 text-gray-400">
                  <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select class and section above to manage subjects</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Create Subject Dialog ── */}
      <Dialog open={isCreateSubjectOpen} onOpenChange={setIsCreateSubjectOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Create New Subject
            </DialogTitle>
            <DialogDescription>
              Add a subject to your school library. You can assign it to specific classes afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Subject Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Mathematics, Physics"
                  value={newSubjectName}
                  onChange={e => setNewSubjectName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Subject Code
                </Label>
                <Input
                  placeholder="e.g. MATH, PHY"
                  value={newSubjectCode}
                  onChange={e => setNewSubjectCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full h-9 rounded-lg border border-gray-200 text-sm bg-white px-3"
                  value={newSubjectElective ? 'elective' : 'core'}
                  onChange={e => setNewSubjectElective(e.target.value === 'elective')}
                >
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <AlignLeft className="w-3.5 h-3.5" /> Description (optional)
              </Label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-gray-200 text-sm bg-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the subject..."
                value={newSubjectDesc}
                onChange={e => setNewSubjectDesc(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateSubjectOpen(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreateSubject}
              loading={saving}
            >
              {saving ? 'Creating...' : <><Plus className="w-4 h-4 mr-2" />Create Subject</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Subject to Class Dialog ── */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-emerald-600" />
              Assign Subject to {selectedClass?.name}
            </DialogTitle>
            <DialogDescription>
              Select a subject and optionally assign a teacher.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject <span className="text-red-500">*</span></Label>
              <select
                className="w-full h-9 rounded-lg border border-gray-200 text-sm bg-white px-3"
                value={assignSubjectId}
                onChange={e => setAssignSubjectId(e.target.value)}
              >
                <option value="">-- Select subject --</option>
                {subjects
                  .filter(s => !classSubjects.find(cs => cs.id === s.id))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Assign Teacher (optional)</Label>
              <select
                className="w-full h-9 rounded-lg border border-gray-200 text-sm bg-white px-3"
                value={assignTeacherId}
                onChange={e => setAssignTeacherId(e.target.value)}
              >
                <option value="">-- No teacher assigned --</option>
                {teachers.map(t => {
                  const userId = t.userId || t.id;
                  const name = t.profile?.full_name || `${t.profile?.first_name || t.first_name || ''} ${t.profile?.last_name || t.last_name || ''}`.trim();
                  return (
                    <option key={userId} value={userId}>{name || 'Teacher'}</option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Periods per Week</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={assignPeriods}
                onChange={e => setAssignPeriods(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleAssignSubject}
              loading={saving}
            >
              {saving ? 'Assigning...' : <><Link2 className="w-4 h-4 mr-2" />Assign Subject</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
