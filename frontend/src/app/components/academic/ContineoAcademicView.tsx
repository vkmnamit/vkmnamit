import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '../ui/table';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts';
import { 
  CheckCircle2, XCircle, Clock, BookOpen, FileText, ChevronRight, Info
} from 'lucide-react';

interface ContineoAcademicViewProps {
  academic: {
    subjectPerformance: any[];
    performanceData: any[];
    recentScores: any[];
    today_schedule: any[];
    behavior_logs: any[];
  };
  studentInfo?: {
    name: string;
    id: string;
    email: string;
    class: string;
  };
}

export function ContineoAcademicView({ academic, studentInfo }: ContineoAcademicViewProps) {
  const [activeView, setActiveView] = useState<'overview' | 'attendance' | 'cie'>('overview');
  const [selectedSubject, setSelectedSubject] = useState<any>(null);

  const subjects = academic.subjectPerformance || [];

  const handleSubjectAction = (subject: any, type: 'attendance' | 'cie') => {
    setSelectedSubject(subject);
    setActiveView(type);
  };

  return (
    <div className="space-y-6">
      {/* Tab Header (Contineo Style) */}
      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => { setActiveView('overview'); setSelectedSubject(null); }}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all ${activeView === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          COURSE REGISTRATION & STATUS
        </button>
        {selectedSubject && (
          <button 
            className={`px-6 py-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-all capitalize`}
          >
            {activeView.toUpperCase()}: {selectedSubject.subject}
          </button>
        )}
      </div>

      {activeView === 'overview' && (
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              Registered Courses - Attendance & CIE
            </h3>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">
              Semester 4 | 2026
            </Badge>
          </div>
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px] font-bold text-gray-600">COURSE CODE</TableHead>
                <TableHead className="font-bold text-gray-600">COURSE NAME</TableHead>
                <TableHead className="text-center font-bold text-gray-600">NOTES</TableHead>
                <TableHead className="text-center font-bold text-gray-600">ATTENDANCE</TableHead>
                <TableHead className="text-center font-bold text-gray-600">CIE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((sub, i) => (
                <TableRow key={i} className="hover:bg-blue-50/30 transition-colors">
                  <TableCell className="font-mono text-xs font-bold text-gray-500">{sub.subject.slice(0, 3).toUpperCase()}{Math.floor(Math.random() * 10000)}</TableCell>
                  <TableCell className="font-bold text-gray-800">{sub.subject}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold border-blue-200 text-blue-600 hover:bg-blue-50">NOTES</Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleSubjectAction(sub, 'attendance')}
                      className={`h-7 text-[10px] font-bold border-rose-200 text-rose-600 hover:bg-rose-50 ${sub.avg_score < 75 ? 'bg-rose-50' : ''}`}
                    >
                      ATTENDANCE ({sub.avg_score}%)
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleSubjectAction(sub, 'cie')}
                      className="h-7 text-[10px] font-bold border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    >
                      CIE ({sub.last_exam_score}/100)
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeView === 'attendance' && selectedSubject && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border-none shadow-sm bg-white">
            <CardContent className="p-6 space-y-6">
              <div className="text-center space-y-2">
                <p className="text-sm font-bold text-gray-500 uppercase">Attendance Percentage</p>
                <div className="relative inline-flex items-center justify-center">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                      strokeDasharray={364.42} 
                      strokeDashoffset={364.42 - (364.42 * selectedSubject.avg_score) / 100}
                      className={`${selectedSubject.avg_score >= 75 ? 'text-emerald-500' : 'text-rose-500'} transition-all duration-1000`}
                    />
                  </svg>
                  <span className="absolute text-2xl font-black">{selectedSubject.avg_score}%</span>
                </div>
                <Badge className={selectedSubject.avg_score >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}>
                  {selectedSubject.avg_score >= 75 ? 'Satisfactory' : 'Low Attendance'}
                </Badge>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Summary</p>
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-800">Present</span>
                  </div>
                  <span className="font-bold text-emerald-700">19 Classes</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-rose-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span className="text-sm font-bold text-rose-800">Absent</span>
                  </div>
                  <span className="font-bold text-rose-700">4 Classes</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
             <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Class-wise Attendance Log</h3>
                <Button variant="ghost" size="sm" onClick={() => setActiveView('overview')} className="text-blue-600 text-xs font-bold">Back to List</Button>
             </div>
             <div className="max-h-[400px] overflow-y-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead className="font-bold">SL NO</TableHead>
                     <TableHead className="font-bold">DATE</TableHead>
                     <TableHead className="font-bold">TIME</TableHead>
                     <TableHead className="font-bold">STATUS</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {[...Array(10)].map((_, i) => (
                     <TableRow key={i}>
                       <TableCell className="text-xs text-gray-400">{i + 1}</TableCell>
                       <TableCell className="text-sm font-medium">{new Date(2026, 4, 13 - i).toLocaleDateString()}</TableCell>
                       <TableCell className="text-xs text-gray-500">08:55 TO 09:50</TableCell>
                       <TableCell>
                         <Badge className={i % 4 === 0 ? 'bg-rose-100 text-rose-700 hover:bg-rose-100 border-none' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none'}>
                           {i % 4 === 0 ? 'Absent' : 'Present'}
                         </Badge>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </div>
          </Card>
        </div>
      )}

      {activeView === 'cie' && selectedSubject && (
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Internal Assessment (CIE) - {selectedSubject.subject}</h3>
            <Button variant="ghost" size="sm" onClick={() => setActiveView('overview')} className="text-blue-600 text-xs font-bold">Back to List</Button>
          </div>
          <CardContent className="p-6 space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {[
                 { label: 'CIE 1', marks: '18/20' },
                 { label: 'CIE 2', marks: '15/20' },
                 { label: 'AAT 1', marks: '10/10' },
                 { label: 'Final IA', marks: `${selectedSubject.last_exam_score}/50` },
               ].map((item, idx) => (
                 <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{item.label}</p>
                    <p className="text-lg font-black text-gray-900 mt-1">{item.marks}</p>
                 </div>
               ))}
            </div>

            <div className="h-[300px] w-full">
               <p className="text-sm font-bold text-gray-600 mb-4">Performance Analysis</p>
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart 
                   data={[
                     { name: 'CIE 1', obtained: 18, max: 20 },
                     { name: 'CIE 2', obtained: 15, max: 20 },
                     { name: 'AAT 1', obtained: 10, max: 10 },
                     { name: 'Final IA', obtained: selectedSubject.last_exam_score / 2, max: 50 },
                   ]}
                   margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                 >
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600}} />
                   <YAxis axisLine={false} tickLine={false} />
                   <Tooltip 
                     contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                     cursor={{fill: '#f8fafc'}}
                   />
                   <Legend verticalAlign="top" align="right" />
                   <Bar dataKey="obtained" name="Marks Obtained" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                   <Bar dataKey="max" name="Max Marks" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={40} />
                 </BarChart>
               </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
