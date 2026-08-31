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
import { AddUserModal } from '../../components/modals/AddUserModal';
import {
  Plus, Trash2, Users, Layers, GraduationCap, ChevronDown, ChevronRight,
  BookOpen, UserPlus, School, AlertTriangle, Pencil, UserX, MoveRight
} from 'lucide-react';

interface Section {
  id: string;
  name: string;
  capacity: number;
  class_teacher_id?: string;
  studentCount?: number;
}

interface ClassData {
  id: string;
  name: string;
  grade: number;
  sections: Section[];
}

export default function ClassesPage() {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');
  const [newSections, setNewSections] = useState('A');
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionCapacity, setNewSectionCapacity] = useState('40');
  
  const [isEditSectionOpen, setIsEditSectionOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<{ id: string; name: string; capacity: number } | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editSectionCapacity, setEditSectionCapacity] = useState('40');

  // Delete confirmation state
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<{ id: string; name: string; count: number } | null>(null);
  const [deleteClassConfirm, setDeleteClassConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [totalStudentCount, setTotalStudentCount] = useState(0);

  // Unassigned students
  const [unassignedStudents, setUnassignedStudents] = useState<any[]>([]);
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(false);
  const [assigningSectionId, setAssigningSectionId] = useState<Record<string, string>>({});
  const [assigningLoading, setAssigningLoading] = useState<Record<string, boolean>>({});

  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const data = await api.getClasses();
      setClasses(data || []);

      // Fetch student counts per section
      const allStudents = await api.getStudents({ limit: '9999' });
      const allStudentsList = allStudents?.students || [];
      setTotalStudentCount(allStudentsList.length);
      const unassigned = allStudentsList.filter((s: any) => !s.section_id);
      setUnassignedStudents(unassigned);
      const counts: Record<string, number> = {};
      allStudentsList.forEach((s: any) => {
        if (s.section_id) {
          counts[s.section_id] = (counts[s.section_id] || 0) + 1;
        }
      });
      setStudentCounts(counts);
    } catch (err) {
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      toast.error('Please enter a class name');
      return;
    }
    try {
      const sectionNames = newSections.split(',').map(s => s.trim()).filter(Boolean);
      await api.createClass({
        name: newClassName,
        grade: newClassGrade || '0',
        sections: sectionNames.map(name => ({ name, capacity: 40 })),
      });
      toast.success(`Class "${newClassName}" created with ${sectionNames.length} section(s)`);
      setIsCreateClassOpen(false);
      setNewClassName('');
      setNewClassGrade('');
      setNewSections('A');
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create class');
    }
  };

  const handleAddSection = async () => {
    if (!selectedClassId || !newSectionName.trim()) {
      toast.error('Please enter a section name');
      return;
    }
    try {
      await api.addSection(selectedClassId, {
        name: newSectionName,
        capacity: parseInt(newSectionCapacity) || 40,
      });
      toast.success(`Section "${newSectionName}" added`);
      setIsAddSectionOpen(false);
      setNewSectionName('');
      setNewSectionCapacity('40');
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add section');
    }
  };

  const handleEditSectionSave = async () => {
    if (!editingSection || !editSectionName.trim()) {
      toast.error('Please enter a section name');
      return;
    }
    try {
      await api.updateSection(editingSection.id, {
        name: editSectionName,
        capacity: parseInt(editSectionCapacity) || 40,
      });
      toast.success(`Section "${editSectionName}" updated`);
      setIsEditSectionOpen(false);
      setEditingSection(null);
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update section');
    }
  };

  const handleDeleteSection = (sectionId: string, sectionName: string) => {
    const count = studentCounts?.[sectionId] || 0;
    setDeleteSectionConfirm({ id: sectionId, name: sectionName, count });
  };

  const confirmDeleteSection = async () => {
    if (!deleteSectionConfirm) return;
    setIsDeleting(true);
    try {
      await api.deleteSection(deleteSectionConfirm.id);
      toast.success(`Section deleted. ${deleteSectionConfirm.count > 0 ? `${deleteSectionConfirm.count} student(s) also permanently deleted.` : ''}`);
      setDeleteSectionConfirm(null);
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete section');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClass = (classId: string, className: string) => {
    setDeleteClassConfirm({ id: classId, name: className });
  };

  const confirmDeleteClass = async () => {
    if (!deleteClassConfirm) return;
    setIsDeleting(true);
    try {
      await api.deleteClass(deleteClassConfirm.id);
      toast.success(`Class "${deleteClassConfirm.name}" deleted`);
      setDeleteClassConfirm(null);
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete class');
    } finally {
      setIsDeleting(false);
    }
  };

  const inSectionCount = Object.values(studentCounts).reduce((a, b) => a + b, 0);
  const unassignedCount = totalStudentCount - inSectionCount;

  const handleAssignSection = async (studentId: string) => {
    const targetSectionId = assigningSectionId[studentId];
    if (!targetSectionId) { toast.error('Please select a section first'); return; }
    setAssigningLoading(prev => ({ ...prev, [studentId]: true }));
    try {
      await api.updateStudent(studentId, { sectionId: targetSectionId });
      toast.success('Student assigned to section');
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign student');
    } finally {
      setAssigningLoading(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleDeleteUnassigned = async (studentId: string, name: string) => {
    if (!window.confirm) return; // handled by calling code
    setAssigningLoading(prev => ({ ...prev, [studentId]: true }));
    try {
      await api.deleteStudent(studentId);
      toast.success(`${name} permanently deleted`);
      fetchClasses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete student');
    } finally {
      setAssigningLoading(prev => ({ ...prev, [studentId]: false }));
    }
  };

  // Delete confirm state for unassigned
  const [deleteUnassignedConfirm, setDeleteUnassignedConfirm] = useState<{ id: string; name: string } | null>(null);
  const totalSections = classes.reduce((a, c) => a + (c.sections?.length || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Classes & Sections</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your school's class structure, sections, and student assignments</p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 rounded-xl h-10 font-bold shadow-lg shadow-blue-600/20"
          onClick={() => setIsCreateClassOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Class
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <School className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Classes</p>
              <p className="text-2xl font-bold">{classes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Sections</p>
              <p className="text-2xl font-bold">{totalSections}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-purple-600 rounded-lg flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Students</p>
              <p className="text-2xl font-bold">{totalStudentCount}</p>
              {unassignedCount > 0 && (
                <p className="text-[11px] text-amber-600 font-medium mt-0.5">{unassignedCount} without a section</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unassigned students warning */}
      {unassignedCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-amber-800">{unassignedCount} student{unassignedCount !== 1 ? 's' : ''} not assigned to any section.</span>
            <span className="text-amber-700 ml-1">They are enrolled in the school but missing a class placement.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold"
            onClick={() => setIsUnassignedOpen(true)}
          >
            Manage {unassignedCount} Students →
          </Button>
        </div>
      )}

      {/* Classes List */}
      {classes.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-200">
          <CardContent className="p-12 text-center">
            <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-600 mb-2">No classes yet</h3>
            <p className="text-gray-400 text-sm mb-6">Create your first class to start organizing your school structure</p>
            <Button onClick={() => setIsCreateClassOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Create First Class
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map(cls => {
            const isExpanded = expandedClass === cls.id;
            const classSections = cls.sections || [];
            const classStudentCount = classSections.reduce((sum, s) => sum + (studentCounts[s.id] || 0), 0);

            return (
              <Card key={cls.id} className={`transition-all ${isExpanded ? 'ring-2 ring-blue-200 shadow-md' : 'hover:shadow-sm'}`}>
                <CardContent className="p-0">
                  {/* Class Header — stacked on mobile */}
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedClass(isExpanded ? null : cls.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-blue-600" /> : <ChevronRight className="w-5 h-5 text-blue-600" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 text-lg">{cls.name}</h3>
                        <p className="text-xs text-gray-400">Grade {cls.grade}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 pl-14 sm:pl-0">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-xs">
                        {classSections.length} Section{classSections.length !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs">
                        {classStudentCount} Student{classStudentCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 pl-14 sm:pl-0 border-t sm:border-t-0 pt-3 sm:pt-0" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 rounded-xl font-bold text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => { setSelectedClassId(cls.id); setIsAddSectionOpen(true); }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 rounded-xl font-bold text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleDeleteClass(cls.id, cls.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>

                  {/* Sections (expanded) */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/30">
                      {classSections.length === 0 ? (
                        <div className="p-6 text-center">
                          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500 mb-3">No sections created for this class</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedClassId(cls.id); setIsAddSectionOpen(true); }}
                          >
                            <Plus className="w-3 h-3 mr-1" /> Add Section
                          </Button>
                        </div>
                      ) : (
                        <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {classSections.map(sec => {
                            const count = studentCounts[sec.id] || 0;
                            const fillPercent = sec.capacity ? Math.min(100, Math.round((count / sec.capacity) * 100)) : 0;

                            return (
                              <div
                                key={sec.id}
                                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-all group"
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                      <BookOpen className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                      <p className="font-bold text-sm text-gray-900">
                                        {cls.name} - {sec.name}
                                      </p>
                                      <p className="text-[10px] text-gray-400 font-medium">
                                        Capacity: {sec.capacity || 40}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-blue-500 hover:bg-blue-50 rounded-lg"
                                      onClick={() => {
                                        setSelectedSectionId(sec.id);
                                        setIsAddStudentOpen(true);
                                      }}
                                      title="Add Student to Section"
                                    >
                                      <UserPlus className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-amber-500 hover:bg-amber-50 rounded-lg"
                                      onClick={() => {
                                        setEditingSection(sec);
                                        setEditSectionName(sec.name);
                                        setEditSectionCapacity(String(sec.capacity || 40));
                                        setIsEditSectionOpen(true);
                                      }}
                                      title="Edit Section"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 rounded-lg"
                                      onClick={() => handleDeleteSection(sec.id, `${cls.name} - ${sec.name}`)}
                                      title="Delete Section"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Student count & fill bar */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 font-medium flex items-center gap-1">
                                      <Users className="w-3 h-3" /> {count} student{count !== 1 ? 's' : ''}
                                    </span>
                                    <span className={`font-bold ${fillPercent > 90 ? 'text-red-600' : fillPercent > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {fillPercent}% full
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${fillPercent > 90 ? 'bg-red-500' : fillPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                      style={{ width: `${fillPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Add Section Card */}
                          <button
                            onClick={() => { setSelectedClassId(cls.id); setIsAddSectionOpen(true); }}
                            className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-2 min-h-[100px] text-gray-400 hover:text-blue-600"
                          >
                            <Plus className="w-5 h-5" />
                            <span className="text-xs font-bold">Add Section</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Class Dialog */}
      <Dialog open={isCreateClassOpen} onOpenChange={setIsCreateClassOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              Create New Class
            </DialogTitle>
            <DialogDescription>
              Add a new class with sections. Students can be added afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="className">Class Name</Label>
                <Input
                  id="className"
                  placeholder="e.g. Class 10, Grade 5"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="classGrade">Grade Order / Level</Label>
                <Input
                  id="classGrade"
                  type="text"
                  placeholder="e.g. 10 or Nursery"
                  value={newClassGrade}
                  onChange={e => setNewClassGrade(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sections">Sections (comma separated)</Label>
              <Input
                id="sections"
                placeholder="A, B, C"
                value={newSections}
                onChange={e => setNewSections(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                Enter section names separated by commas. Example: A, B, C
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-700">
                <strong>Preview:</strong> This will create{' '}
                <strong>{newClassName || '...'}</strong> with sections:{' '}
                {newSections.split(',').map(s => s.trim()).filter(Boolean).join(', ') || '...'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateClassOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateClass}>
              <Plus className="w-4 h-4 mr-2" /> Create Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Section Dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              Add Section
            </DialogTitle>
            <DialogDescription>
              Add a new section to {classes.find(c => c.id === selectedClassId)?.name || 'this class'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Section Name</Label>
              <Input
                placeholder="e.g. C, D, Science"
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input
                type="number"
                placeholder="40"
                value={newSectionCapacity}
                onChange={e => setNewSectionCapacity(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddSectionOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleAddSection} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">Add Section</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Section Modal */}
      <Dialog open={isEditSectionOpen} onOpenChange={setIsEditSectionOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>Update the section's name or capacity.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Section Name</Label>
              <Input
                placeholder="e.g. A, B, North"
                value={editSectionName}
                onChange={e => setEditSectionName(e.target.value)}
                className="rounded-xl bg-gray-50/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Capacity (Max Students)</Label>
              <Input
                type="number"
                placeholder="40"
                value={editSectionCapacity}
                onChange={e => setEditSectionCapacity(e.target.value)}
                className="rounded-xl bg-gray-50/50"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditSectionOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleEditSectionSave} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Section Confirm Dialog */}
      <Dialog open={!!deleteSectionConfirm} onOpenChange={() => setDeleteSectionConfirm(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Section
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete <strong>{deleteSectionConfirm?.name}</strong>.
              {(deleteSectionConfirm?.count ?? 0) > 0 && (
                <span className="block mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
                  🚨 {deleteSectionConfirm?.count} student(s) are in this section. They will be <strong>permanently deleted</strong> from the school along with their accounts.
                </span>
              )}
              <span className="block mt-2 text-sm text-gray-500">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteSectionConfirm(null)} className="rounded-xl" disabled={isDeleting}>Cancel</Button>
            <Button onClick={confirmDeleteSection} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white rounded-xl">
              {isDeleting ? 'Deleting…' : 'Yes, Delete Section'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Class Confirm Dialog */}
      <Dialog open={!!deleteClassConfirm} onOpenChange={() => setDeleteClassConfirm(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Class
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete class <strong>{deleteClassConfirm?.name}</strong> and all its sections.
              <span className="block mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
                🚨 All sections inside this class will be deleted. Students in those sections will be detached.
              </span>
              <span className="block mt-2 text-sm text-gray-500">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteClassConfirm(null)} className="rounded-xl" disabled={isDeleting}>Cancel</Button>
            <Button onClick={confirmDeleteClass} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white rounded-xl">
              {isDeleting ? 'Deleting…' : 'Yes, Delete Class'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unassigned Students Manager */}
      <Dialog open={isUnassignedOpen} onOpenChange={setIsUnassignedOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[700px] max-h-[85dvh] flex flex-col p-0 overflow-hidden w-[100vw] sm:w-auto">
          <DialogHeader className="p-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-amber-500" />
              Unassigned Students ({unassignedStudents.length})
            </DialogTitle>
            <DialogDescription>
              These students are enrolled but have no section. Assign them to a section or delete them permanently.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {unassignedStudents.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">All students are assigned to sections!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {unassignedStudents.map((student: any) => {
                  const name = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim() || student.admission_number;
                  const loading = assigningLoading[student.id];
                  const allSections = classes.flatMap(cls =>
                    (cls.sections || []).map(sec => ({ value: sec.id, label: `${cls.name} — ${sec.name}` }))
                  );
                  return (
                    <div key={student.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                          {(student.user?.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{name}</p>
                          <p className="text-xs text-gray-400">{student.admission_number}</p>
                        </div>
                      </div>

                      {/* Section picker */}
                      <select
                        className="flex-1 h-9 rounded-lg border border-gray-200 bg-gray-50 text-sm px-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={assigningSectionId[student.id] || ''}
                        onChange={e => setAssigningSectionId(prev => ({ ...prev, [student.id]: e.target.value }))}
                      >
                        <option value="">Select section…</option>
                        {allSections.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>

                      {/* Assign button */}
                      <Button
                        size="sm"
                        disabled={loading || !assigningSectionId[student.id]}
                        onClick={() => handleAssignSection(student.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs shrink-0 flex items-center gap-1"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                        {loading ? 'Moving…' : 'Assign'}
                      </Button>

                      {/* Delete button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={loading}
                        onClick={() => setDeleteUnassignedConfirm({ id: student.id, name })}
                        className="text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t flex justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsUnassignedOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete unassigned student confirm */}
      <Dialog open={!!deleteUnassignedConfirm} onOpenChange={() => setDeleteUnassignedConfirm(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Student
            </DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{deleteUnassignedConfirm?.name}</strong> from the school?
              <span className="block mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
                🚨 This will delete their account, login access, and all associated data. This cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteUnassignedConfirm(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={async () => {
                if (!deleteUnassignedConfirm) return;
                await handleDeleteUnassigned(deleteUnassignedConfirm.id, deleteUnassignedConfirm.name);
                setDeleteUnassignedConfirm(null);
              }}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
            >
              Yes, Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Modal — pre-selects section */}
      <AddUserModal
        isOpen={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        role="student"
        initialData={selectedSectionId ? { sectionId: selectedSectionId } : undefined}
        onSuccess={() => {
          fetchClasses();
          setIsAddStudentOpen(false);
        }}
      />
    </div>
  );
}
