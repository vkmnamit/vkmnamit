import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { Search, Users, BookOpen, UserCircle, GraduationCap, FileText, Download, Filter, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

export function DigitalLogbook() {
  const [activeTab, setActiveTab] = useState('students');
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const navigate = useNavigate();
  const itemsPerPage = 10;

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sRes, tRes, pRes, eRes] = await Promise.allSettled([
        api.getStudents(), api.getTeachers(), api.getParents(), api.getExams()
      ]);
      if (sRes.status === 'fulfilled') setStudents(sRes.value?.students || sRes.value || []);
      if (tRes.status === 'fulfilled') setTeachers(tRes.value?.data || tRes.value || []);
      if (pRes.status === 'fulfilled') setParents(pRes.value || []);
      if (eRes.status === 'fulfilled') setExams(eRes.value?.exams || eRes.value || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filteredStudents = students.filter(s => {
    const name = `${s.user?.first_name || ''} ${s.user?.last_name || ''}`.toLowerCase();
    const adm = s.admission_number || '';
    const matchSearch = name.includes(search.toLowerCase()) || adm.toLowerCase().includes(search.toLowerCase());
    const matchClass = filterClass === 'all' || s.section?.class?.name === filterClass;
    return matchSearch && matchClass;
  });

  const filteredTeachers = teachers.filter(t => {
    const fn = t.profile?.first_name || t.user?.first_name || '';
    const ln = t.profile?.last_name || t.user?.last_name || '';
    const name = `${fn} ${ln}`.toLowerCase();
    const dept = t.professional?.department || t.department || '';
    const matchSearch = name.includes(search.toLowerCase()) || dept.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all' || dept === filterDept;
    return matchSearch && matchDept;
  });

  const filteredParents = parents.filter(p => {
    const name = `${p.user?.first_name || ''} ${p.user?.last_name || ''}`.toLowerCase();
    return name.includes(search.toLowerCase()) || (p.user?.phone || '').includes(search);
  });

  const filteredExams = exams.filter(e => {
    const name = (e.name || '').toLowerCase();
    return name.includes(search.toLowerCase()) || (e.subject?.name || '').toLowerCase().includes(search.toLowerCase());
  });

  const uniqueClasses = [...new Set(students.map(s => s.section?.class?.name).filter(Boolean))];
  const uniqueDepts = [...new Set(teachers.map(t => t.professional?.department || t.department).filter(Boolean))];

  const tabCounts = {
    students: filteredStudents.length,
    teachers: filteredTeachers.length,
    parents: filteredParents.length,
    exams: filteredExams.length,
  };

  const paginate = (items: any[]) => {
    if (viewAll) return items;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(tabCounts[activeTab as keyof typeof tabCounts] / itemsPerPage);

  const PaginationControls = () => {
    if (viewAll || totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between p-4 border-t border-gray-50 bg-white">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0 rounded-lg" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0 rounded-lg" 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  const handleExport = () => {
    toast.success(`Exporting ${activeTab} data as CSV...`);
    // Build CSV from active tab data
    let csv = '';
    if (activeTab === 'students') {
      csv = 'Name,Admission No,Class,Section,Roll No,Phone,Status\n';
      filteredStudents.forEach(s => {
        csv += `${s.user?.first_name} ${s.user?.last_name},${s.admission_number},${s.section?.class?.name || ''},${s.section?.name || ''},${s.roll_number || ''},${s.user?.phone || ''},Active\n`;
      });
    } else if (activeTab === 'teachers') {
      csv = 'Name,Employee ID,Department,Designation,Phone,Email\n';
      filteredTeachers.forEach(t => {
        const fn = t.profile?.first_name || t.user?.first_name || '';
        const ln = t.profile?.last_name || t.user?.last_name || '';
        csv += `${fn} ${ln},${t.professional?.employee_id || t.employee_id || ''},${t.professional?.department || t.department || ''},${t.professional?.designation || t.designation || ''},${t.profile?.phone || t.user?.phone || ''},${t.profile?.email || t.user?.email || ''}\n`;
      });
    }
    if (csv) {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `logbook_${activeTab}_${Date.now()}.csv`;
      a.click(); URL.revokeObjectURL(url);
    }
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-[500px] w-full rounded-2xl" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Digital Logbook</h1>
          <p className="text-gray-500 font-medium">Unified registry of all institutional records</p>
        </div>
        <Button variant="outline" className="rounded-xl font-bold border-gray-200" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" /> Export {activeTab}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Students', count: students.length, icon: GraduationCap, color: 'bg-blue-600' },
          { label: 'Teachers', count: teachers.length, icon: BookOpen, color: 'bg-emerald-600' },
          { label: 'Parents', count: parents.length, icon: UserCircle, color: 'bg-purple-600' },
          { label: 'Exams', count: exams.length, icon: FileText, color: 'bg-amber-600' },
        ].map(s => (
          <Card key={s.label} className="border-none shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setActiveTab(s.label.toLowerCase())}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-11 h-11 ${s.color} rounded-xl flex items-center justify-center shadow-md`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
                <p className="text-xl font-black text-gray-900">{s.count}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filters */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search by name, ID, phone, subject..." className="pl-12 h-11 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {activeTab === 'students' && (
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-[180px] h-11 rounded-xl"><SelectValue placeholder="All Classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {uniqueClasses.map(c => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {activeTab === 'teachers' && (
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="w-[180px] h-11 rounded-xl"><SelectValue placeholder="All Departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {uniqueDepts.map(d => <SelectItem key={d} value={d!}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" className="font-bold text-gray-400" onClick={() => { setSearch(''); setFilterClass('all'); setFilterDept('all'); setCurrentPage(1); }}>
              Reset
            </Button>
            <div className="flex items-center gap-2 border-l pl-3 ml-2 border-gray-100">
              <span className="text-xs font-bold text-gray-500 whitespace-nowrap">View All</span>
              <input 
                type="checkbox" 
                checked={viewAll} 
                onChange={(e) => { setViewAll(e.target.checked); setCurrentPage(1); }} 
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-50 p-1 rounded-xl border border-gray-100 mb-6">
          {['students', 'teachers', 'parents', 'exams'].map(tab => (
            <TabsTrigger 
              key={tab} 
              value={tab} 
              onClick={() => setCurrentPage(1)}
              className="rounded-lg px-5 py-2 text-xs font-bold capitalize data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              {tab} ({tabCounts[tab as keyof typeof tabCounts]})
            </TabsTrigger>
          ))}
        </TabsList>

        {/* STUDENTS TAB */}
        <TabsContent value="students">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Student</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Admission #</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Class</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Roll</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Guardian</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Phone</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-center">Profile</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginate(filteredStudents).map(s => (
                    <TableRow key={s.id} className="hover:bg-gray-50/50 border-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                            <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">{s.user?.first_name?.[0]}{s.user?.last_name?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{s.user?.first_name} {s.user?.last_name}</p>
                            <p className="text-[10px] text-gray-400">{s.user?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{s.admission_number}</TableCell>
                      <TableCell>
                        <Badge className="bg-blue-50 text-blue-700 border-none text-[10px] font-bold">{s.section?.class?.name}-{s.section?.name}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold">{s.roll_number || '-'}</TableCell>
                      <TableCell className="text-xs text-gray-500">{s.father_name || '-'}</TableCell>
                      <TableCell className="text-xs text-gray-500">{s.guardian_phone || s.user?.phone || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Link to={`/students/${s.id}`}>
                          <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold border-gray-200 hover:border-blue-300 hover:text-blue-600">
                            <Eye className="w-3 h-3 mr-1" /> View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredStudents.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-gray-400 font-bold">No students match your filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <PaginationControls />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEACHERS TAB */}
        <TabsContent value="teachers">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Teacher</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Employee ID</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Department</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Designation</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Experience</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Phone</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-center">Profile</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginate(filteredTeachers).map(t => {
                    const fn = t.profile?.first_name || t.user?.first_name || '';
                    const ln = t.profile?.last_name || t.user?.last_name || '';
                    const dept = t.professional?.department || t.department || '';
                    const desg = t.professional?.designation || t.designation || '';
                    const exp = t.professional?.experience_years || t.experience_years || 0;
                    const empId = t.professional?.employee_id || t.employee_id || '';
                    const phone = t.profile?.phone || t.user?.phone || '';
                    return (
                      <TableRow key={t.id} className="hover:bg-gray-50/50 border-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                              <AvatarFallback className="bg-emerald-600 text-white text-xs font-bold">{fn[0]}{ln[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-bold text-sm text-gray-900">{fn} {ln}</p>
                              <p className="text-[10px] text-gray-400">{t.profile?.email || t.user?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{empId}</TableCell>
                        <TableCell><Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">{dept}</Badge></TableCell>
                        <TableCell className="text-xs text-gray-600">{desg}</TableCell>
                        <TableCell className="text-xs font-bold">{exp} yrs</TableCell>
                        <TableCell className="text-xs text-gray-500">{phone}</TableCell>
                        <TableCell className="text-center">
                          <Link to={`/teachers/${t.id}`}>
                            <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold border-gray-200 hover:border-emerald-300 hover:text-emerald-600">
                              <Eye className="w-3 h-3 mr-1" /> View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredTeachers.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-gray-400 font-bold">No teachers match your filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <PaginationControls />
            </CardContent>
          </Card>
        </TabsContent>

        {/* PARENTS TAB */}
        <TabsContent value="parents">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Parent</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Email</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Phone</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Linked Students</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Occupation</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Address</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-center">Profile</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginate(filteredParents).map(p => (
                    <TableRow key={p.id} className="hover:bg-gray-50/50 border-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                            <AvatarFallback className="bg-purple-600 text-white text-xs font-bold">{p.user?.first_name?.[0]}{p.user?.last_name?.[0]}</AvatarFallback>
                          </Avatar>
                          <p className="font-bold text-sm text-gray-900">{p.user?.first_name} {p.user?.last_name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{p.user?.email}</TableCell>
                      <TableCell className="text-xs text-gray-500">{p.user?.phone || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.children?.map((c: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="bg-blue-50 text-blue-700 border-none text-[9px] font-bold cursor-pointer hover:bg-blue-100" onClick={() => {
                              if (c.student_id) navigate(`/students/${c.student_id}`);
                              else toast.info(`Viewing profile for ${c.student?.user?.first_name}`);
                            }}>
                              {c.student?.user?.first_name}
                            </Badge>
                          )) || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{p.occupation || 'Professional'}</TableCell>
                      <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">{p.address || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Link to={`/parents/${p.id}`}>
                          <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold border-gray-200 hover:border-purple-300 hover:text-purple-600">
                            <Eye className="w-3 h-3 mr-1" /> View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredParents.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-gray-400 font-bold">No parents found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <PaginationControls />
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXAMS TAB */}
        <TabsContent value="exams">
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Exam Name</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Subject</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Class</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Total Marks</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginate(filteredExams).map(e => (
                    <TableRow key={e.id} className="hover:bg-gray-50/50 border-gray-50">
                      <TableCell className="font-bold text-sm text-gray-900">{e.name}</TableCell>
                      <TableCell><Badge className="bg-amber-50 text-amber-700 border-none text-[10px] font-bold">{e.subject?.name || '-'}</Badge></TableCell>
                      <TableCell className="text-xs text-gray-600">{e.class?.name || '-'}</TableCell>
                      <TableCell className="text-xs text-gray-500">{e.date ? new Date(e.date).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-xs font-bold">{e.total_marks || '-'}</TableCell>
                      <TableCell>
                        <Badge className={`border-none text-[10px] font-bold ${e.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {e.is_published ? 'Published' : 'Draft'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredExams.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-gray-400 font-bold">No exams found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <PaginationControls />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
