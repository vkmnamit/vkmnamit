import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { generateExamRegistryPDF } from '../../../lib/pdf';
import { Download, Search, AlertCircle, Trophy, Medal, Award } from 'lucide-react';
import { toast } from 'sonner';

export function ClassReportsPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [examTypes, setExamTypes] = useState<any[]>([]);
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedExamType, setSelectedExamType] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<{ students: any[], totalMax: number, exams: any[] } | null>(null);

  useEffect(() => {
    fetchFilters();
  }, []);

  const fetchFilters = async () => {
    try {
      const [clsData, typesData] = await Promise.all([
        api.getClasses(),
        api.getExamTypes()
      ]);
      setClasses(clsData || []);
      setExamTypes(typesData || []);
      if (clsData?.length > 0) setSelectedClass(clsData[0].id);
      if (typesData?.length > 0) setSelectedExamType(typesData[0].id);
    } catch (err) {
      toast.error('Failed to load filters');
    }
  };

  useEffect(() => {
    if (selectedClass) {
      const cls = classes.find(c => c.id === selectedClass);
      setSections(cls?.sections || []);
      setSelectedSection('all');
    }
  }, [selectedClass, classes]);

  const handleFetchReports = async () => {
    if (!selectedClass || !selectedExamType) {
      toast.error('Please select class and exam type');
      return;
    }
    setLoading(true);
    try {
      const params: any = { class_id: selectedClass, exam_type_id: selectedExamType };
      if (selectedSection !== 'all') params.section_id = selectedSection;
      
      const data = await api.getClassReports(params);
      setReportData(data);
    } catch (err) {
      toast.error('Failed to load class reports');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    if (!reportData || reportData.students.length === 0) return;
    
    const clsName = classes.find(c => c.id === selectedClass)?.name || 'Unknown Class';
    const secName = selectedSection !== 'all' ? sections.find(s => s.id === selectedSection)?.name : 'All Sections';
    const typeName = examTypes.find(t => t.id === selectedExamType)?.name || 'Exam';

    const students = reportData.students.map(s => ({
      name: s.name,
      rollNo: s.rollNo || s.admissionNo || '',
      marks: s.marksObtained,
      percentage: s.percentage,
      rank: s.rank
    }));

    generateExamRegistryPDF({
      schoolName: user?.school_name || 'School',
      examName: `${typeName} Consolidated Report`,
      className: `${clsName} ${secName ? `- ${secName}` : ''}`,
      students
    });
  };

  const getRankBadge = (rank: number | null) => {
    if (!rank) return <span className="text-slate-400">-</span>;
    if (rank === 1) return <Badge className="bg-amber-500"><Trophy className="w-3 h-3 mr-1"/> 1st</Badge>;
    if (rank === 2) return <Badge className="bg-slate-400"><Medal className="w-3 h-3 mr-1"/> 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-700"><Award className="w-3 h-3 mr-1"/> 3rd</Badge>;
    return <span className="text-slate-500 font-bold">#{rank}</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Consolidated Class Reports</h1>
          <p className="text-slate-500 mt-1">Aggregated results across all subjects for a specific exam term.</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 min-w-[200px] flex-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Class</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="bg-white rounded-xl h-11"><SelectValue placeholder="Select Class" /></SelectTrigger>
              <SelectContent>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[200px] flex-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Section</label>
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="bg-white rounded-xl h-11"><SelectValue placeholder="All Sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[200px] flex-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Exam Term</label>
            <Select value={selectedExamType} onValueChange={setSelectedExamType}>
              <SelectTrigger className="bg-white rounded-xl h-11"><SelectValue placeholder="Select Exam Term" /></SelectTrigger>
              <SelectContent>
                {examTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleFetchReports} disabled={loading} className="h-11 px-8 rounded-xl bg-slate-900 text-white shadow-sm hover:bg-slate-800">
            {loading ? 'Loading...' : 'Generate Report'}
          </Button>
        </div>

        {reportData && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900 text-lg">
                Report Card Summary <span className="text-slate-400 font-normal text-sm ml-2">Total Max Marks: {reportData.totalMax}</span>
              </h3>
              <Button onClick={handleExportPDF} variant="outline" className="h-9 rounded-lg border-slate-200">
                <Download className="w-4 h-4 mr-2" /> Export PDF
              </Button>
            </div>

            {reportData.students.length === 0 ? (
               <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                 <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                 <p className="font-bold">No results found.</p>
                 <p className="text-sm">Marks might not be entered yet for this exam term.</p>
               </div>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3 text-right">Total Obt.</th>
                      <th className="px-4 py-3 text-right">Percentage</th>
                      <th className="px-4 py-3">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reportData.students.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">{s.percentage > 0 ? getRankBadge(s.rank) : <Badge variant="outline" className="text-[10px]">N/A</Badge>}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{s.name}</div>
                          <div className="text-xs text-slate-400">Roll: {s.rollNo || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-medium">{s.section}</td>
                        <td className="px-4 py-3 text-right font-black text-blue-600">
                          {s.percentage > 0 ? `${s.marksObtained} / ${reportData.totalMax}` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {s.percentage > 0 ? `${s.percentage}%` : '-'}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{s.percentage > 0 ? s.grade : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
