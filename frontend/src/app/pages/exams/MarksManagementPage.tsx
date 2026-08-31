import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Search, Save, Send, AlertTriangle, Undo2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';

export function MarksManagementPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  // Filters
  const [assessmentType, setAssessmentType] = useState<'exam' | 'assignment'>('exam');
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedExam, setSelectedExam] = useState<any>(null); // Full exam object to access totalMarks
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Data
  const [students, setStudents] = useState<any[]>([]);
  const [marksData, setMarksData] = useState<Record<string, { marksObtained: string, isAbsent: boolean }>>({});

  // NOTE: Marks stay editable for BOTH draft and published exams. Publishing
  // controls student/parent visibility (unpublish to hide again & edit).

  useEffect(() => {
    api.getAcademicYears().then(setAcademicYears).catch(console.error);
    api.getExams().then(setExams).catch(console.error);
    api.getAssignments().then(setAssignments).catch(console.error);
    
    const fetchClassesFn = user?.role === 'teacher' ? api.getTeacherSections : api.getClasses;
    fetchClassesFn().then(setClasses).catch(console.error);
  }, [user]);

  const handleClassChange = (clsId: string) => {
    setSelectedClass(clsId);
    setSelectedSection('');
    const cls = classes.find(c => c.id === clsId);
    setSections(cls?.sections || []);
  };

  const handleExamChange = (id: string) => {
    let selectedAssessment = null;
    if (assessmentType === 'exam') {
      selectedAssessment = exams.find(e => e.id === id);
    } else {
      selectedAssessment = assignments.find(a => a.id === id);
    }
    
    setSelectedExam(selectedAssessment);
    
    if (selectedAssessment) {
      // Auto-select class
      const classId = selectedAssessment.class_id || selectedAssessment.classId || selectedAssessment.class?.id;
      if (classId) {
        setSelectedClass(classId);
        const cls = classes.find(c => c.id === classId);
        setSections(cls?.sections || []);
      }
      
      // Auto-select section if it exists
      const sectionId = selectedAssessment.section_id || selectedAssessment.sectionId || selectedAssessment.section?.id;
      if (sectionId) {
        setSelectedSection(sectionId);
      } else {
        setSelectedSection('');
      }
    }
  };

  const fetchStudents = async () => {
    if (!selectedExam || !selectedSection) {
      toast.error('Please select both an Assessment and a Section');
      return;
    }
    
    setFetching(true);
    try {
      let resData: any[] = [];
      if (assessmentType === 'exam') {
        const res = await api.getStudentsForMarksEntry({ 
          examId: selectedExam.id, 
          sectionId: selectedSection 
        });
        resData = res.students || [];
      } else {
        resData = await api.getAssignmentSubmissions(selectedExam.id);
      }
      
      setStudents(resData);
      
      // Initialize marks state
      const initialMarks: Record<string, any> = {};
      resData.forEach((s: any) => {
        initialMarks[studentIdFromLMS(s)] = {
          marksObtained: s.marksObtained !== null ? String(s.marksObtained) : '',
          isAbsent: s.isAbsent || s.status === 'assigned'
        };
      });
      setMarksData(initialMarks);
    } catch (err: any) {
      toast.error('Failed to load students list');
    } finally {
      setFetching(false);
    }
  };

  const studentIdFromLMS = (s: any) => s.id || s.studentId;

  const handleMarkChange = (studentId: string, value: string) => {
    const maxMarks = selectedExam?.total_marks || selectedExam?.max_marks;
    if (selectedExam && value && Number(value) > maxMarks) {
      toast.error(`Marks cannot exceed ${maxMarks}`);
      return;
    }
    setMarksData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], marksObtained: value }
    }));
  };

  const handleAbsentChange = (studentId: string, checked: boolean) => {
    setMarksData(prev => ({
      ...prev,
      [studentId]: { 
        ...prev[studentId], 
        isAbsent: checked, 
        marksObtained: checked ? '0' : prev[studentId]?.marksObtained || '' 
      }
    }));
  };

  const handleSaveDraft = async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      const payload = students.map(s => ({
        studentId: studentIdFromLMS(s),
        marksObtained: Number(marksData[studentIdFromLMS(s)]?.marksObtained || 0),
        isAbsent: marksData[studentIdFromLMS(s)]?.isAbsent || false
      }));

      if (assessmentType === 'exam') {
        await api.submitResults({ examId: selectedExam.id, results: payload });
      } else {
        await api.submitAssignmentResults({ assignmentId: selectedExam.id, results: payload });
      }
      toast.success('Draft saved successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save draft');
    } finally {
      setLoading(false);
    }
  };

  const handleUnpublish = async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      await api.unpublishResults({ examId: selectedExam.id });
      setExams(prev => prev.map(e => e.id === selectedExam.id ? { ...e, status: 'scheduled' } : e));
      setSelectedExam({ ...selectedExam, status: 'scheduled' });
      toast.success('Results unpublished — marks are editable again and hidden from students/parents.');
    } catch (err: any) {
      console.error('Unpublish Error:', err);
      toast.error(err.message || 'Failed to unpublish results');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedExam) return;
    
    setLoading(true);
    try {
      // 1. Ensure latest draft is saved first
      const payload = students.map(s => ({
        studentId: studentIdFromLMS(s),
        marksObtained: Number(marksData[studentIdFromLMS(s)]?.marksObtained || 0),
        isAbsent: marksData[studentIdFromLMS(s)]?.isAbsent || false
      }));
      
      if (assessmentType === 'exam') {
        await api.submitResults({ examId: selectedExam.id, results: payload });
        await api.publishResults({ examId: selectedExam.id, sectionId: selectedSection });
        setExams(prev => prev.map(e => e.id === selectedExam.id ? { ...e, status: 'completed' } : e));
      } else {
        await api.submitAssignmentResults({ assignmentId: selectedExam.id, results: payload });
        await api.publishAssignmentResults({ assignmentId: selectedExam.id });
        setAssignments(prev => prev.map(a => a.id === selectedExam.id ? { ...a, status: 'completed' } : a));
      }
      
      toast.success('Results published successfully!');
      
      // Update local state
      setSelectedExam({ ...selectedExam, status: 'completed' });
      
    } catch (err: any) {
      console.error('Publish Error:', err);
      toast.error(err.message || 'Failed to publish results');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Marks Management</h1>
          <p className="text-sm text-gray-500 font-medium">Record and publish academic results</p>
        </div>
      </div>

      <Card className="border-gray-100 shadow-xl shadow-gray-100/50 rounded-2xl overflow-hidden">
        <CardHeader className="bg-gray-50/50 border-b p-5 flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="space-y-2 w-48">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Academic Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Select Year" /></SelectTrigger>
                <SelectContent>
                  {academicYears.map(yr => (
                    <SelectItem key={yr.id} value={yr.id}>{yr.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 w-48">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</label>
              <Select value={assessmentType} onValueChange={(val: any) => {
                setAssessmentType(val);
                setSelectedExam(null);
                setStudents([]);
              }}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Select Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="assignment">Assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 w-48">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{assessmentType === 'exam' ? 'Exam' : 'Assignment'}</label>
              <Select value={selectedExam?.id || ''} onValueChange={handleExamChange}>
                <SelectTrigger className="bg-white"><SelectValue placeholder={`Select ${assessmentType === 'exam' ? 'Exam' : 'Assignment'}`} /></SelectTrigger>
                <SelectContent>
                  {assessmentType === 'exam' ? exams.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name} ({e.subject?.name || 'General'})</SelectItem>
                  )) : assignments.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.title} ({a.subject?.name || 'General'})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 w-40">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Class</label>
              <Select value={selectedClass} onValueChange={handleClassChange}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Select Class" /></SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 w-40">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Section</label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Select Section" /></SelectTrigger>
                <SelectContent>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* NOTE: No lock banner — marks can be entered/edited at any time, */}
          {/* published or draft. Publishing only controls student visibility. */}

          <Button onClick={fetchStudents} disabled={fetching} className="mt-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold w-auto self-start">
              <Search className="w-4 h-4 mr-2" />
              {fetching ? 'Loading...' : 'Fetch Students'}
            </Button>
        </CardHeader>

        <CardContent className="p-0">
          {students.length > 0 ? (
            <div>
              <div className="p-4 bg-blue-50/50 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <Badge variant="outline" className="mr-2 border-blue-200 text-blue-700 bg-white">
                    Max Marks: {selectedExam?.total_marks || selectedExam?.max_marks}
                  </Badge>
                  {selectedExam?.status === 'completed' && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-0">Published</Badge>
                  )}
                  {selectedExam?.status !== 'completed' && (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-0">Draft</Badge>
                  )}
                </div>
                <div className="flex flex-wrap sm:flex-nowrap w-full sm:w-auto gap-2">
                  <Button variant="outline" onClick={handleSaveDraft} disabled={loading} className="border-gray-200 text-gray-700 font-bold">
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  {(user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'teacher') && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button disabled={loading} className="bg-blue-600 hover:bg-blue-700 font-bold text-white shadow-lg shadow-blue-600/20">
                          <Send className="w-4 h-4 mr-2" />
                          {selectedExam?.status === 'completed' ? 'Republish Results' : 'Publish Results'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Publish results?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will publish the results to all students and parents. You can still edit the marks afterwards and unpublish at any time to hide them again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handlePublish} className="bg-blue-600 hover:bg-blue-700">Yes, Publish</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {(user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'teacher') && selectedExam?.status === 'completed' && (
                    <Button variant="outline" onClick={handleUnpublish} disabled={loading} className="border-amber-200 text-amber-700 hover:bg-amber-50 font-bold">
                      <Undo2 className="w-4 h-4 mr-2" />
                      Unpublish
                    </Button>
                  )}
                </div>
              </div>
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="font-black text-xs uppercase tracking-wider text-gray-500">Student Name</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wider text-gray-500">Admission No</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wider text-gray-500">Roll No</TableHead>
                    {assessmentType === 'assignment' && (
                      <TableHead className="font-black text-xs uppercase tracking-wider text-gray-500">Status</TableHead>
                    )}
                    <TableHead className="font-black text-xs uppercase tracking-wider text-gray-500 w-48 text-center">Marks</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wider text-gray-500 text-right">Absent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={studentIdFromLMS(student)} className="hover:bg-blue-50/30 transition-colors">
                      <TableCell className="font-bold text-gray-900 py-3">
                        {student.name || `${student.firstName || student.user?.first_name || 'Unknown'} ${student.lastName || student.user?.last_name || 'Student'}`.trim()}
                      </TableCell>
                      <TableCell className="text-gray-500">{student.admissionNumber || student.admission_number || 'N/A'}</TableCell>
                      <TableCell className="text-gray-500">{student.rollNumber || student.roll_number || 'N/A'}</TableCell>
                      {assessmentType === 'assignment' && (
                        <TableCell>
                          <Badge variant={student.status === 'graded' ? 'success' : student.status === 'submitted' ? 'warning' : 'secondary'}>
                            {student.status || 'Pending'}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={selectedExam?.total_marks || selectedExam?.max_marks}
                          value={marksData[studentIdFromLMS(student)]?.marksObtained || ''}
                          onChange={e => handleMarkChange(studentIdFromLMS(student), e.target.value)}
                          disabled={marksData[studentIdFromLMS(student)]?.isAbsent}
                          className="w-24 text-center font-bold text-blue-700 border-blue-200 focus-visible:ring-blue-500"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={marksData[studentIdFromLMS(student)]?.isAbsent}
                          onCheckedChange={c => handleAbsentChange(studentIdFromLMS(student), c)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-16 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
              Select an exam and section to enter marks
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
