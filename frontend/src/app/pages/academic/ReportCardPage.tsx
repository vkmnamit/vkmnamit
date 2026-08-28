import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import {
    Award, BookOpen, Calendar, Download, FileText, GraduationCap,
    Loader2, School, TrendingUp, User, CheckCircle, AlertCircle
} from 'lucide-react';

function getGradeColor(pct: number | null) {
    if (pct === null) return 'bg-slate-100 text-slate-500';
    if (pct >= 90) return 'bg-emerald-100 text-emerald-700';
    if (pct >= 75) return 'bg-blue-100 text-blue-700';
    if (pct >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-rose-100 text-rose-700';
}

function getGradeLabel(pct: number | null) {
    if (pct === null) return '—';
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
}

export function ReportCardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isParent = user?.role === 'parent';
    const isStudent = user?.role === 'student';

    // Students & parents now get full exam-wise report cards (with PDFs) on
    // the My Results page — redirect there instead of showing this legacy page.
    useEffect(() => {
        if (isStudent || isParent) {
            navigate('/results', { replace: true });
        }
    }, [isStudent, isParent, navigate]);

    const [examTypes, setExamTypes] = useState<any[]>([]);
    const [selectedExamType, setSelectedExamType] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [reportCard, setReportCard] = useState<any>(null);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    // Parent child selector
    const [children, setChildren] = useState<any[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
    const [childrenLoading, setChildrenLoading] = useState(false);

    useEffect(() => {
        loadExamTypes();
        if (isParent) {
            loadChildren();
        }
    }, []);

    useEffect(() => {
        if (selectedExamType && (isStudent || (isParent && selectedChildId))) {
            const studentId = isStudent ? user!.id : selectedChildId!;
            loadReportCard(studentId, selectedExamType);
        }
    }, [selectedExamType, selectedChildId, isStudent, user?.id]);

    const loadExamTypes = async () => {
        try {
            const data = await api.getExamTypes();
            setExamTypes(Array.isArray(data) ? data : []);
            if (data && data.length > 0) {
                setSelectedExamType(data[0].id);
            }
        } catch (err: any) {
            toast.error('Failed to load exam types');
        } finally {
            setLoading(false);
        }
    };

    const loadChildren = async () => {
        setChildrenLoading(true);
        try {
            const data = await api.getParentChildren();
            const kids = (data || []).map((link: any) => ({
                id: link.student?.id,
                name: `${link.student?.user?.first_name || ''} ${link.student?.user?.last_name || ''}`.trim(),
                class: `${link.student?.section?.class?.name || ''} ${link.student?.section?.name || ''}`.trim(),
            })).filter((k: any) => k.id);
            setChildren(kids);
            if (kids.length > 0) {
                setSelectedChildId(kids[0].id);
            }
        } catch {
            toast.error('Failed to load children');
        } finally {
            setChildrenLoading(false);
        }
    };

    const loadReportCard = async (studentId: string, examTypeId: string) => {
        setLoading(true);
        try {
            const data = await api.getReportCard(studentId, examTypeId);
            setReportCard(data);
        } catch (err: any) {
            toast.error('Failed to load report card');
        } finally {
            setLoading(false);
        }
    };

    const generatePdf = async () => {
        if (!reportCard) return;
        setGeneratingPdf(true);
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF('p', 'mm', 'a4');
            const schoolName = user?.school || 'Kautix School';
            const schoolAddress = user?.schoolAddress || '';
            const schoolPhone = user?.schoolPhone || '';
            const schoolEmail = user?.schoolEmail || '';
            const examTypeName = examTypes.find(e => e.id === selectedExamType)?.name || 'Report Card';
            const student = reportCard.student;
            const studentName = student?.user ? `${student.user.first_name} ${student.user.last_name}` : 'Student';
            const className = student?.section?.class?.name || '';
            const sectionName = student?.section?.name || '';
            const overall = reportCard.overall || { percentage: 0, grade: 'N/A', totalObtained: 0, totalMax: 0 };
            const subjects = reportCard.subjects || [];

            let y = 20;

            // Header
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text(schoolName, 105, y, { align: 'center' });
            y += 8;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            if (schoolAddress) { doc.text(schoolAddress, 105, y, { align: 'center' }); y += 5; }
            if (schoolPhone || schoolEmail) {
                doc.text(`${schoolPhone || ''} ${schoolEmail ? '| ' + schoolEmail : ''}`, 105, y, { align: 'center' });
                y += 5;
            }

            // Report Card Title
            y += 5;
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(`${examTypeName} Report Card`, 105, y, { align: 'center' });
            y += 10;

            // Student Info
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Student Name: ${studentName}`, 20, y);
            doc.text(`Class: ${className} - ${sectionName}`, 110, y);
            y += 6;
            doc.text(`Roll No: ${student?.roll_number || 'N/A'}`, 20, y);
            doc.text(`Admission No: ${student?.admission_number || 'N/A'}`, 110, y);
            y += 6;
            doc.text(`Academic Year: ${student?.academic_year || 'N/A'}`, 20, y);
            y += 10;

            // Subjects Table
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setFillColor(239, 242, 249);
            doc.rect(20, y, 170, 8, 'F');
            doc.text('Subject', 22, y + 5.5);
            doc.text('Marks Obtained', 70, y + 5.5);
            doc.text('Max Marks', 110, y + 5.5);
            doc.text('Percentage', 140, y + 5.5);
            doc.text('Grade', 170, y + 5.5);
            y += 8;

            doc.setFont('helvetica', 'normal');
            subjects.forEach((subj: any) => {
                doc.setDrawColor(226, 232, 240);
                doc.line(20, y, 190, y);
                doc.text(subj.subject, 22, y + 5);
                doc.text(String(subj.totalObtained), 70, y + 5);
                doc.text(String(subj.totalMax), 110, y + 5);
                doc.text(`${subj.percentage}%`, 140, y + 5);
                doc.text(subj.grade, 170, y + 5);
                y += 8;
            });

            // Overall
            y += 5;
            doc.setFont('helvetica', 'bold');
            doc.setFillColor(236, 252, 244);
            doc.rect(20, y, 170, 10, 'F');
            doc.text('OVERALL', 22, y + 7);
            doc.text(String(overall.totalObtained), 70, y + 7);
            doc.text(String(overall.totalMax), 110, y + 7);
            doc.text(`${overall.percentage}%`, 140, y + 7);
            doc.text(overall.grade, 170, y + 7);
            y += 15;

            // Grade interpretation
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text('Grading Scale: A+ (90-100), A (80-89), B (70-79), C (60-69), D (50-59), F (Below 50)', 105, y, { align: 'center' });

            doc.save(`${examTypeName.replace(/\s+/g, '_')}_ReportCard_${studentName.replace(/\s+/g, '_')}.pdf`);
            toast.success('Report card PDF downloaded!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to generate PDF');
        } finally {
            setGeneratingPdf(false);
        }
    };

    const selectedChild = children.find(c => c.id === selectedChildId);

    return (
        <div className="dashboard-page space-y-6 min-h-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                            <Award className="w-5 h-5 text-white" />
                        </div>
                        Report Card
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 ml-14">
                        View mapped results across all subjects for any exam or test. Download a professional PDF report card.
                    </p>
                </div>
            </div>

            {/* Child Selector — only for parents */}
            {isParent && (
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-4">
                    <p className="text-xs font-black uppercase text-violet-400 tracking-widest mb-3 flex items-center gap-2">
                        <User className="w-3 h-3" /> Select Child
                    </p>
                    {childrenLoading ? (
                        <div className="flex gap-3">
                            {[1, 2].map(i => <div key={i} className="h-12 w-40 rounded-xl bg-slate-200 animate-pulse" />)}
                        </div>
                    ) : children.length === 0 ? (
                        <p className="text-sm text-slate-400">No children linked to your account.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {children.map((child) => (
                                <button
                                    key={child.id}
                                    onClick={() => setSelectedChildId(child.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${selectedChildId === child.id
                                        ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/25'
                                        : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:text-violet-700'
                                        }`}
                                >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${selectedChildId === child.id ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
                                        }`}>
                                        {child.name?.[0] || '?'}
                                    </div>
                                    <div className="text-left">
                                        <p className="leading-tight">{child.name}</p>
                                        <p className={`text-[10px] font-medium leading-tight ${selectedChildId === child.id ? 'text-violet-200' : 'text-slate-400'}`}>{child.class}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Exam Type Selector */}
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-white">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Select Exam / Test Type
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Select value={selectedExamType} onValueChange={setSelectedExamType}>
                        <SelectTrigger className="w-full h-12 rounded-xl border-slate-200 text-sm font-semibold">
                            <SelectValue placeholder="Choose an exam type..." />
                        </SelectTrigger>
                        <SelectContent>
                            {examTypes.map((et: any) => (
                                <SelectItem key={et.id} value={et.id}>
                                    <div className="flex items-center justify-between w-full">
                                        <span>{et.name}</span>
                                        {et.weightage && <span className="text-xs text-slate-400 font-medium">({et.weightage}%)</span>}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Report Card Content */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/60">
                    <Loader2 className="w-10 h-10 animate-spin text-violet-600 mb-4" />
                    <p className="text-slate-500 font-semibold text-sm">Loading report card...</p>
                </div>
            ) : !reportCard ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/60 text-center px-4">
                    <Award className="w-16 h-16 text-slate-300 mb-4" />
                    <h3 className="text-lg font-bold text-slate-800">No Report Card Available</h3>
                    <p className="text-slate-500 max-w-md mt-1 text-sm">
                        No results have been published for the selected exam type yet. The report card will appear here once the teacher publishes the results.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Student Info Card */}
                    <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 border-b border-slate-100 pb-4">
                            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-black">
                                    {reportCard.student?.user?.first_name?.[0] || 'S'}
                                </div>
                                <div>
                                    <span className="block text-xl">{reportCard.student?.user ? `${reportCard.student.user.first_name} ${reportCard.student.user.last_name}` : 'Student'}</span>
                                    <span className="text-sm font-medium text-slate-500 block">
                                        {reportCard.student?.section?.class?.name || 'Class'} - {reportCard.student?.section?.name || 'Section'}
                                    </span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Roll No</p>
                                    <p className="font-bold text-slate-800 mt-0.5">{reportCard.student?.roll_number || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Admission No</p>
                                    <p className="font-bold text-slate-800 mt-0.5">{reportCard.student?.admission_number || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Exam Type</p>
                                    <p className="font-bold text-slate-800 mt-0.5">{examTypes.find(e => e.id === selectedExamType)?.name || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Academic Year</p>
                                    <p className="font-bold text-slate-800 mt-0.5">{reportCard.student?.academic_year || 'N/A'}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Overall Summary */}
                    <Card className="rounded-2xl border-slate-100 shadow-sm bg-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" /> Overall Performance
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <div className="text-center">
                                    <div className="text-4xl font-black text-violet-700">{reportCard.overall?.percentage || 0}%</div>
                                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">Overall Percentage</p>
                                </div>
                                <div className="text-center">
                                    <Badge className={`text-2xl font-black px-6 py-2 ${getGradeColor(reportCard.overall?.percentage || null)}`}>
                                        {reportCard.overall?.grade || 'N/A'}
                                    </Badge>
                                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">Overall Grade</p>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-black text-slate-800">{reportCard.overall?.totalObtained || 0} / {reportCard.overall?.totalMax || 0}</div>
                                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">Total Marks</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Subjects Table */}
                    <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
                        <CardHeader className="pb-3 bg-slate-50/60 border-b border-slate-100">
                            <CardTitle className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                <BookOpen className="w-4 h-4" /> Subject-wise Results
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left text-[10px] font-black uppercase text-slate-400 tracking-widest px-5 py-3">Subject</th>
                                            <th className="text-right text-[10px] font-black uppercase text-slate-400 tracking-widest px-5 py-3">Marks Obtained</th>
                                            <th className="text-right text-[10px] font-black uppercase text-slate-400 tracking-widest px-5 py-3">Max Marks</th>
                                            <th className="text-right text-[10px] font-black uppercase text-slate-400 tracking-widest px-5 py-3">Percentage</th>
                                            <th className="text-center text-[10px] font-black uppercase text-slate-400 tracking-widest px-5 py-3">Grade</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(reportCard.subjects || []).map((subj: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-4 font-bold text-slate-800">{subj.subject}</td>
                                                <td className="px-5 py-4 text-right font-bold text-slate-800">{subj.totalObtained}</td>
                                                <td className="px-5 py-4 text-right text-slate-600">{subj.totalMax}</td>
                                                <td className="px-5 py-4 text-right font-bold text-slate-700">{subj.percentage}%</td>
                                                <td className="px-5 py-4 text-center">
                                                    <Badge className={`font-black text-xs ${getGradeColor(subj.percentage)}`}>
                                                        {subj.grade}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Download PDF Button */}
                    <div className="flex justify-end">
                        <Button
                            onClick={generatePdf}
                            loading={generatingPdf}
                            className="bg-violet-600 hover:bg-violet-700 text-white rounded-2xl h-12 px-6 font-bold text-sm shadow-xl shadow-violet-600/10 transition-all flex items-center gap-2"
                        >
                            <Download className="w-5 h-5" />
                            Download PDF Report Card
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
