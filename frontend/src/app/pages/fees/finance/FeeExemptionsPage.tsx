import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { toast } from 'sonner';
import { Search, ShieldBan, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

export function FeeExemptionsPage() {
  const [structures, setStructures] = useState<any[]>([]);
  const [exemptions, setExemptions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStructure, setSelectedStructure] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStructureId, setModalStructureId] = useState('');
  const [modalStudentId, setModalStudentId] = useState('');
  const [studentPickerSearch, setStudentPickerSearch] = useState('');
  const [studentPickerClass, setStudentPickerClass] = useState('all');
  const [studentPickerSection, setStudentPickerSection] = useState('all');
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [sRes, eRes, stRes] = await Promise.all([
        api.getFeeStructures(),
        api.getFeeExemptions(),
        api.getStudents({ limit: '9999' })
      ]);
      setStructures(sRes || []);
      setExemptions(eRes || []);
      setStudents(Array.isArray(stRes) ? stRes : stRes?.students || []);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load fee exemptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAdd = async () => {
    if (!modalStructureId || !modalStudentId) {
      toast.error('Select both a structure and a student');
      return;
    }
    setAdding(true);
    try {
      const result = await api.addFeeExemption({ studentId: modalStudentId, feeStructureId: modalStructureId });
      const removedCount = Number(result?.removedUnpaidDues || 0);
      toast.success(removedCount > 0
        ? `Exemption added and ${removedCount} unpaid fee record${removedCount === 1 ? '' : 's'} removed.`
        : 'Exemption added. This fee will no longer be generated for the student.');
      setIsModalOpen(false);
      setModalStudentId('');
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add exemption');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this exemption? The student will start receiving this fee again.')) return;
    try {
      await api.removeFeeExemption(id);
      toast.success('Exemption removed');
      fetchAll();
    } catch (e: any) {
      toast.error('Failed to remove exemption');
    }
  };

  const filteredExemptions = exemptions.filter(e => {
    const studentName = `${e.student?.user?.first_name || ''} ${e.student?.user?.last_name || ''}`.toLowerCase();
    const structureName = structures.find(s => s.id === e.fee_structure_id)?.name?.toLowerCase() || '';
    const term = search.toLowerCase();
    const matchSearch = studentName.includes(term) || structureName.includes(term) || e.student?.admission_number?.toLowerCase().includes(term) || String(e.student?.roll_number ?? '').includes(term);
    const matchStructure = selectedStructure === 'all' || e.fee_structure_id === selectedStructure;
    return matchSearch && matchStructure;
  });

  const pickerClasses = Array.from(new Map(
    students
      .filter((student: any) => student.section?.class?.id)
      .map((student: any) => [student.section.class.id, student.section.class])
  ).values());
  const pickerSections = Array.from(new Map(
    students
      .filter((student: any) => studentPickerClass === 'all' || student.section?.class?.id === studentPickerClass)
      .filter((student: any) => student.section?.id)
      .map((student: any) => [student.section.id, student.section])
  ).values());
  const filteredPickerStudents = students.filter((student: any) => {
    const term = studentPickerSearch.trim().toLowerCase();
    const studentName = `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.toLowerCase();
    const matchesSearch = !term || studentName.includes(term) || String(student.roll_number ?? '').includes(term) ||
      String(student.admission_number || '').toLowerCase().includes(term);
    const matchesClass = studentPickerClass === 'all' || student.section?.class?.id === studentPickerClass;
    const matchesSection = studentPickerSection === 'all' || student.section?.id === studentPickerSection;
    return matchesSearch && matchesClass && matchesSection;
  });

  const openAddExemption = () => {
    setModalStudentId('');
    setStudentPickerSearch('');
    setStudentPickerClass('all');
    setStudentPickerSection('all');
    setIsModalOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Fee Exemptions</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Exempt specific students from specific fee structures</p>
        </div>
        {isAdmin && (
          <Button onClick={openAddExemption} className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-600/20">
            <ShieldBan className="w-4 h-4 mr-2" /> Add Exemption
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search name, roll no. or structure..." className="pl-10 h-10 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={selectedStructure} onValueChange={setSelectedStructure}>
          <SelectTrigger className="h-10 rounded-xl w-48 text-xs font-bold">
            <SelectValue placeholder="All Structures" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Structures</SelectItem>
            {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.frequency})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Student</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Exempted From</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Class / Section</th>
                  <th className="text-left px-4 py-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">Added On</th>
                  {isAdmin && <th className="px-4 py-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-6 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td></tr>
                )) : filteredExemptions.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-16 text-center text-gray-400 font-bold">No exemptions found</td></tr>
                ) : filteredExemptions.map(ex => {
                  const struct = structures.find(s => s.id === ex.fee_structure_id);
                  return (
                    <tr key={ex.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900">{ex.student?.user?.first_name} {ex.student?.user?.last_name}</p>
                        <p className="text-xs text-gray-400 font-medium">Roll: {ex.student?.roll_number ?? '—'} · {ex.student?.admission_number}</p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className="bg-red-50 text-red-700 border-none">
                          {struct?.name || 'Unknown Structure'}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold text-gray-700">{ex.student?.section?.class?.name || '—'}</p>
                        <p className="text-xs text-blue-600 font-bold">{ex.student?.section?.name || ''}</p>
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500">
                        {new Date(ex.created_at).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-4 text-right">
                          <button onClick={() => handleRemove(ex.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">Add Fee Exemption</DialogTitle>
            <DialogDescription className="text-gray-500 text-sm">
              The selected student will no longer be charged for the selected fee structure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Fee Structure *</label>
              <Select value={modalStructureId} onValueChange={setModalStructureId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select Structure" />
                </SelectTrigger>
                <SelectContent>
                  {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.frequency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Student *</label>
              <Input
                value={studentPickerSearch}
                onChange={(event) => { setStudentPickerSearch(event.target.value); setModalStudentId(''); }}
                placeholder="Search name, roll no. or admission no."
                className="h-11 rounded-xl"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select value={studentPickerClass} onValueChange={(value) => {
                  setStudentPickerClass(value);
                  setStudentPickerSection('all');
                  setModalStudentId('');
                }}>
                  <SelectTrigger className="h-11 rounded-xl text-sm">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {pickerClasses.map((schoolClass: any) => (
                      <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={studentPickerSection} onValueChange={(value) => { setStudentPickerSection(value); setModalStudentId(''); }}>
                  <SelectTrigger className="h-11 rounded-xl text-sm" disabled={studentPickerClass === 'all'}>
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {pickerSections.map((section: any) => (
                      <SelectItem key={section.id} value={section.id}>{section.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={modalStudentId} onValueChange={setModalStudentId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder={`Select Student (${filteredPickerStudents.length})`} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredPickerStudents.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user?.first_name} {s.user?.last_name} (Roll {s.roll_number ?? '—'}) - {s.section?.class?.name} {s.section?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold mt-2" onClick={handleAdd} disabled={adding}>
              {adding ? 'Saving...' : 'Save Exemption'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
