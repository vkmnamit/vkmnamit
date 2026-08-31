import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { generateExamRegistryPDF } from '../../../lib/pdf';
import { Download, X, Search, Trophy, Medal, Award, AlertCircle } from 'lucide-react';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface ViewRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: any | null;
  schoolName: string;
}

export function ViewRegistryModal({ isOpen, onClose, exam, schoolName }: ViewRegistryModalProps) {
  // Normalize: the exam object may come from the dashboard API (camelCase: totalMarks)
  // or from the full exam list (snake_case: total_marks). Support both.
  const totalMarks = exam?.total_marks ?? exam?.totalMarks ?? 0;
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && exam) {
      fetchRegistry();
    }
  }, [isOpen, exam]);

  const fetchRegistry = async () => {
    try {
      setLoading(true);
      const data = await api.getExamResults(exam.id);
      setResults(data || []);
    } catch (err) {
      toast.error('Failed to load exam registry');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (results.length === 0) {
      toast.error('No results to export');
      return;
    }

    const students = results.map(r => {
      const percentage = totalMarks > 0 ? (r.marks_obtained / totalMarks) * 100 : 0;
      return {
        name: `${r.student?.user?.first_name || ''} ${r.student?.user?.last_name || ''}`.trim(),
        rollNo: r.student?.roll_number || r.student?.admission_number || '',
        marks: r.marks_obtained,
        percentage: isNaN(percentage) ? 0 : percentage,
        rank: r.rank
      };
    });

    generateExamRegistryPDF({
      schoolName,
      examName: exam.name || exam.subject || exam.subject?.name || 'Examination',
      className: exam.class?.name ? `${exam.class.name} ${exam.section?.name ? `- ${exam.section.name}` : ''}` : (exam.class || 'All Classes'),
      students
    });
  };

  if (!isOpen) return null;

  const filteredResults = results.filter(r => {
    const sName = `${r.student?.user?.first_name || ''} ${r.student?.user?.last_name || ''}`.toLowerCase();
    const roll = String(r.student?.roll_number || '').toLowerCase();
    return sName.includes(searchTerm.toLowerCase()) || roll.includes(searchTerm.toLowerCase());
  });

  const getRankBadge = (rank: number | null) => {
    if (rank === 1) return <Badge className="bg-amber-500"><Trophy className="w-3 h-3 mr-1"/> 1st</Badge>;
    if (rank === 2) return <Badge className="bg-slate-400"><Medal className="w-3 h-3 mr-1"/> 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-700"><Award className="w-3 h-3 mr-1"/> 3rd</Badge>;
    return <span className="text-slate-500 font-bold">#{rank}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div 
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900">Exam Registry</h2>
            <p className="text-sm font-medium text-slate-500">{exam?.name || exam?.subject?.name} • Class {exam?.class?.name || 'N/A'}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleDownloadPDF} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm">
              <Download className="w-4 h-4 mr-2" /> Export PDF
            </Button>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search by student name or roll number..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-0 overflow-y-auto flex-1 bg-slate-50">
          {loading ? (
            <div className="p-12 flex justify-center items-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : results.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-bold">No results found for this exam.</p>
              <p className="text-sm">Marks might not be entered yet.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap bg-white">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Roll No</th>
                  <th className="px-6 py-4 text-right">Marks Obt.</th>
                  <th className="px-6 py-4 text-right">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredResults.map((r) => {
                  const percentage = r.marks_obtained >= 0 && totalMarks > 0 ? ((r.marks_obtained / totalMarks) * 100) : null;
                  
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        {r.marks_obtained >= 0 ? getRankBadge(r.rank) : <Badge variant="outline" className="text-[10px]">Absent</Badge>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">
                          {`${r.student?.user?.first_name || ''} ${r.student?.user?.last_name || ''}`}
                        </div>
                        <div className="text-xs text-slate-400">Adm: {r.student?.admission_number || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        {r.student?.roll_number || '-'}
                      </td>
                      <td className={`px-6 py-4 text-right font-black ${r.marks_obtained >= 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                        {r.marks_obtained >= 0 ? `${r.marks_obtained} / ${totalMarks || '?'}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {percentage !== null && !isNaN(percentage) ? `${percentage.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
