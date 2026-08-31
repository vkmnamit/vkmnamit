import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { X, Download, Trophy, Medal, Award, AlertCircle, BookOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateExamRegistryPDF } from '../../../lib/pdf';

interface AggregatedRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTypeName: string;
  examTypeId: string;
  schoolName: string;
  defaultClassId?: string;
}

export function AggregatedRegistryModal({
  isOpen,
  onClose,
  examTypeName,
  examTypeId,
  schoolName,
  defaultClassId
}: AggregatedRegistryModalProps) {
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState(defaultClassId || '');
  const [selectedSection, setSelectedSection] = useState('all');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<{ students: any[]; totalMax: number; exams: any[] } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadClasses();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedClass) {
      const cls = classes.find(c => c.id === selectedClass);
      setSections(cls?.sections || []);
      setSelectedSection('all');
    }
  }, [selectedClass, classes]);

  useEffect(() => {
    if (isOpen && selectedClass && examTypeId) {
      fetchReport();
    }
  }, [isOpen, selectedClass, selectedSection, examTypeId]);

  const loadClasses = async () => {
    try {
      const data = await api.getClasses();
      setClasses(data || []);
      if (!selectedClass && data?.length > 0) setSelectedClass(data[0].id);
    } catch {
      toast.error('Failed to load classes');
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params: any = { class_id: selectedClass, exam_type_id: examTypeId };
      if (selectedSection !== 'all') params.section_id = selectedSection;
      const data = await api.getClassReports(params);
      setReportData(data);
    } catch {
      toast.error('Failed to load aggregated results');
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-amber-500 text-white gap-1"><Trophy className="w-3 h-3" /> 1st</Badge>;
    if (rank === 2) return <Badge className="bg-slate-400 text-white gap-1"><Medal className="w-3 h-3" /> 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-700 text-white gap-1"><Award className="w-3 h-3" /> 3rd</Badge>;
    return <span className="font-bold text-slate-500">#{rank}</span>;
  };

  const handleExport = () => {
    if (!reportData?.students?.length) return;
    const clsName = classes.find(c => c.id === selectedClass)?.name || '';
    const secName = selectedSection !== 'all' ? sections.find(s => s.id === selectedSection)?.name : '';
    generateExamRegistryPDF({
      schoolName,
      examName: `${examTypeName} – Aggregated Results`,
      className: [clsName, secName].filter(Boolean).join(' - '),
      students: reportData.students.map(s => ({
        name: s.name,
        rollNo: s.rollNo || '-',
        marks: s.marksObtained,
        percentage: s.percentage,
        rank: s.rank
      }))
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900">Aggregated Exam Results</h2>
            <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              {examTypeName} — All subjects combined
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap gap-3 items-center shrink-0">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Class</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="h-9 bg-white rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Section</label>
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="h-9 bg-white rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reportData && (
            <div className="ml-auto flex items-end pb-0.5">
              <Button onClick={handleExport} variant="outline" className="h-9 rounded-xl text-xs border-slate-200">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
              </Button>
            </div>
          )}
        </div>

        {/* Subjects covered banner */}
        {reportData?.exams?.length > 0 && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
            <p className="text-xs font-bold text-blue-700">
              Subjects included: {reportData.exams.map((e: any) => e.subject?.name).filter(Boolean).join(' • ')}
              <span className="ml-2 font-normal text-blue-500">— Total max marks: {reportData.totalMax}</span>
            </p>
          </div>
        )}

        {/* Table */}
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" /> Loading results…
            </div>
          ) : !reportData || reportData.students.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
              <AlertCircle className="w-10 h-10 opacity-20" />
              <p className="font-bold">No results found</p>
              <p className="text-sm">Marks may not have been entered yet for this class.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100 z-10">
                <tr>
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Section</th>
                  <th className="px-6 py-4 text-right">Total Marks</th>
                  <th className="px-6 py-4 text-right">Percentage</th>
                  <th className="px-6 py-4">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reportData.students.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3.5">
                      {s.percentage > 0 ? getRankBadge(s.rank) : <Badge variant="outline" className="text-[10px]">N/A</Badge>}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-bold text-slate-900">{s.name}</div>
                      <div className="text-[11px] text-slate-400">Roll: {s.rollNo || '-'}</div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium">{s.section}</td>
                    <td className="px-6 py-3.5 text-right font-black text-blue-600">
                      {s.percentage > 0 ? `${s.marksObtained} / ${reportData.totalMax}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3.5 text-right font-bold text-slate-900">
                      {s.percentage > 0 ? `${s.percentage}%` : '—'}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-slate-700">{s.percentage > 0 ? s.grade : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
