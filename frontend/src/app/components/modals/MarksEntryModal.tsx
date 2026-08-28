import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, Save, User, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Lock } from 'lucide-react';

interface MarksEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: any;
  onSuccess?: () => void;
}

export function MarksEntryModal({ isOpen, onClose, exam, onSuccess }: MarksEntryModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Check if exam date hasn't passed yet (marks locked)
  const isExamLocked = (() => {
    if (!exam?.date) return false;
    const examDate = new Date(exam.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return examDate > today;
  })();

  useEffect(() => {
    if (isOpen && exam) {
      fetchData();
    }
  }, [isOpen, exam]);

  const fetchData = async () => {
    setFetching(true);
    try {
      const sectionId = exam.section_id || exam.sectionId;

      if (sectionId) {
        // Use the dedicated marks-entry endpoint — returns students + existing marks together
        const response = await api.getStudentsForMarksEntry({ examId: exam.id, sectionId });
        const studentData = response.students || [];
        setStudents(studentData);

        // Pre-populate results map from the returned data
        const resultMap: Record<string, any> = {};
        studentData.forEach((s: any) => {
          if (s.marksObtained !== null && s.marksObtained !== undefined) {
            resultMap[s.id] = {
              marksObtained: s.isAbsent ? '' : String(s.marksObtained),
              isAbsent: s.isAbsent || false,
              remarks: ''
            };
          }
        });
        setResults(resultMap);
      } else {
        // Fallback: no sectionId on exam, use generic endpoint
        const studentList = await api.getStudents({ class_id: exam.class_id });
        setStudents(studentList.students || studentList || []);

        const existingResults = await api.getExamResults(exam.id);
        const resultMap: Record<string, any> = {};
        (existingResults || []).forEach((r: any) => {
          resultMap[r.student_id] = {
            marksObtained: r.marks_obtained,
            isAbsent: r.is_absent,
            remarks: r.remarks || ''
          };
        });
        setResults(resultMap);
      }
    } catch (err) {
      console.error('Failed to fetch marks data');
      toast.error('Failed to load student list');
    } finally {
      setFetching(false);
    }
  };

  const handleMarkChange = (studentId: string, value: string) => {
    const marks = parseFloat(value);
    if (marks > exam.totalMarks) {
      toast.error(`Marks cannot exceed total (${exam.totalMarks})`);
      return;
    }
    setResults(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], marksObtained: value }
    }));
  };

  const handleAbsentToggle = (studentId: string, checked: boolean) => {
    setResults(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], isAbsent: checked, marksObtained: checked ? '0' : prev[studentId]?.marksObtained || '0' }
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const formattedResults = students.map(s => ({
        studentId: s.id,
        marksObtained: parseFloat(results[s.id]?.marksObtained || '0'),
        isAbsent: results[s.id]?.isAbsent || false
      }));

      await api.submitResults({
        examId: exam.id,
        results: formattedResults
      });

      toast.success('Marks synchronized with institutional registry');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync marks');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s => 
    (s.name || `${s.user?.first_name || ''} ${s.user?.last_name || ''}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(s.rollNumber || s.roll_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col bg-white rounded-3xl border-none shadow-2xl">
        <DialogHeader className="px-6 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-gray-900/20">
                <Save className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-gray-900">Marks Entry Protocol</DialogTitle>
                <DialogDescription className="text-gray-500 font-medium">
                  {exam?.subject} • {exam?.class} • Total Marks: {exam?.totalMarks}
                </DialogDescription>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Passing Marks</p>
              <p className="text-lg font-bold text-rose-600">{exam?.passingMarks || '33'}</p>
            </div>
          </div>
          
          <div className="relative mt-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Filter nodes by name or roll number..." 
              className="pl-12 h-11 rounded-xl bg-gray-50 border-none font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Lock Warning Banner */}
          {isExamLocked && (
            <div className="mt-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
              <Lock className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-sm">Marks Entry Locked</p>
                <p className="text-xs font-medium">This exam is scheduled for <span className="font-black">{new Date(exam.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span> and hasn't happened yet. Marks can be entered only after the exam date passes.</p>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {fetching ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center">Fetching registry data...</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50/50 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="w-[80px] font-black text-[10px] uppercase text-gray-400 tracking-widest">Roll No</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-gray-400 tracking-widest">Student Node</TableHead>
                  <TableHead className="w-[100px] text-center font-black text-[10px] uppercase text-gray-400 tracking-widest">Absent</TableHead>
                  <TableHead className="w-[150px] font-black text-[10px] uppercase text-gray-400 tracking-widest">Obtained</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-gray-400 tracking-widest">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => {
                  const res = results[student.id] || { marksObtained: '', isAbsent: false };
                  const isPassing = parseFloat(res.marksObtained) >= (exam?.passingMarks || 33);
                  
                  return (
                    <TableRow key={student.id} className="hover:bg-blue-50/30 transition-colors border-gray-50">
                      <TableCell className="font-mono text-xs font-bold text-gray-500">{student.rollNumber || student.roll_number || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                            <User className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-gray-900">
                            {student.name || `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch 
                          checked={res.isAbsent}
                          onCheckedChange={(v) => handleAbsentToggle(student.id, v)}
                          disabled={isExamLocked}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input 
                            type="number" 
                            disabled={res.isAbsent || isExamLocked}
                            value={res.marksObtained}
                            onChange={(e) => handleMarkChange(student.id, e.target.value)}
                            className={`h-10 rounded-lg bg-white font-black text-center ${res.isAbsent ? 'opacity-50' : ''} ${!res.isAbsent && res.marksObtained !== '' && !isPassing ? 'text-rose-600' : 'text-gray-900'}`}
                            placeholder="0"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {res.isAbsent ? (
                          <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-none font-black text-[9px] uppercase tracking-tighter">ABSENT</Badge>
                        ) : res.marksObtained === '' ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none font-black text-[9px] uppercase tracking-tighter">PENDING</Badge>
                        ) : isPassing ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-rose-500 mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="px-6 py-6 bg-gray-50/50 border-t border-gray-100 gap-3">
          <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl font-bold text-gray-400">Cancel</Button>
          <Button 
            onClick={handleSubmit}
            disabled={loading || fetching || isExamLocked} 
            className="h-12 px-10 rounded-xl bg-gray-900 hover:bg-black shadow-xl shadow-gray-900/20 font-black uppercase text-[10px] tracking-widest"
          >
            <Save className="w-4 h-4 mr-2" />
            Sync with Registry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
