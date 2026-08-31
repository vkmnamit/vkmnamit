import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Search, Plus, Download, Star, X, Users, Upload } from 'lucide-react';
import { Link } from 'react-router';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { AddUserModal } from '../../components/modals/AddUserModal';

export function TeachersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const response = await api.getTeachers();
      // Handle the new SaaS structure: { success: true, data: [...], meta: {...} }
      const teachersList = response.data || response || [];
      setTeachers(teachersList);
    } catch (err) {
      console.error('Failed to fetch teachers');
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateDownload = () => {
    const template = [
      {
        'First Name': 'Rajesh', 'Last Name': 'Kumar',
        'Email': 'rajesh.kumar@school.edu', 'Phone': '9876543210',
        'Employee ID': 'EMP001', 'Designation': 'Senior Teacher',
        'Department': 'Science', 'Specialization': 'Physics',
        'Qualification': 'M.Sc. Physics', 'Experience Years': 5,
        'Date of Joining': '2020-06-01', 'Salary': 45000, 'Date of Birth': '1990-05-15',
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Teachers Template');
    XLSX.writeFile(wb, 'teacher_import_template.xlsx');
    toast.success('Teacher import template downloaded!');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);
        if (rawData.length === 0) { toast.error('The file is empty'); return; }

        const mappedData = rawData.map((row: any) => ({
          firstName: row['First Name'] || row.firstName || row.first_name || '',
          lastName: row['Last Name'] || row.lastName || row.last_name || '',
          email: row['Email'] || row.email || '',
          phone: String(row['Phone'] || row.phone || ''),

          designation: row['Designation'] || row.designation || '',
          department: row['Department'] || row.department || '',
          specialization: row['Specialization'] || row.specialization || '',
          qualification: row['Qualification'] || row.qualification || '',
          experienceYears: row['Experience Years'] || row.experienceYears || 0,
          dateOfJoining: row['Date of Joining'] || row.dateOfJoining || '',
          salary: row['Salary'] || row.salary || 0,
          dateOfBirth: row['Date of Birth'] || row.dateOfBirth || '',
        }));

        const toastId = toast.loading(`Importing ${mappedData.length} teachers...`);
        const response = await api.bulkCreateTeachers(mappedData);
        if (response?.results) {
          const ok = response.results.filter((r: any) => r.success).length;
          const dup = response.results.filter((r: any) => r.status === 'duplicate').length;
          const fail = response.results.length - ok;
          if (fail > 0 || dup > 0) {
            toast.warning(`✅ ${ok} imported  |  ⚠️ ${dup} duplicates  |  ❌ ${fail - dup} failed`, { id: toastId, duration: 6000 });
          } else {
            toast.success(`✅ ${ok} teachers imported successfully!`, { id: toastId });
          }
        } else {
          toast.success('Teachers imported successfully!', { id: toastId });
        }
        fetchTeachers();
      } catch (err: any) {
        toast.error(err.message || 'Import failed. Use the template format.');
      } finally { e.target.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  };

  const stats = [
    { label: 'Total Teachers', value: teachers.length || '0', color: 'bg-blue-600' },
    { label: 'Active', value: teachers.filter(t => (t.profile?.is_active ?? t.user?.is_active)).length || '0', color: 'bg-green-600' },
    { label: 'On Leave', value: teachers.filter(t => !(t.profile?.is_active ?? t.user?.is_active)).length || '0', color: 'bg-orange-600' },
    { label: 'Specializations', value: new Set(teachers.map(t => t.professional?.specialization ?? t.specialization)).size.toString(), color: 'bg-purple-600' },
  ];

  const filteredTeachers = (teachers || []).filter(teacher => {
    const firstName = teacher.profile?.first_name ?? teacher.user?.first_name ?? '';
    const lastName = teacher.profile?.last_name ?? teacher.user?.last_name ?? '';
    const teacherName = `${firstName} ${lastName}`;
    const specialization = teacher.professional?.specialization ?? teacher.specialization ?? '';

    const matchesSearch = teacherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      specialization.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSubject = selectedSubject === 'all' || specialization === selectedSubject;
    const isActive = teacher.profile?.is_active ?? teacher.user?.is_active;
    const matchesStatus = selectedStatus === 'all' || (isActive ? 'active' : 'leave') === selectedStatus;

    return matchesSearch && matchesSubject && matchesStatus;
  });

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Management</h1>
          <p className="text-gray-500 font-medium">Manage faculty profiles, workloads, and ratings</p>
        </div>
        <div className="flex flex-col w-full sm:w-auto sm:flex-row items-stretch sm:items-center gap-2 mt-4 sm:mt-0">
          <Button variant="outline" className="w-full sm:w-auto justify-center font-semibold h-10 border-gray-200 text-gray-600 hover:bg-gray-50" onClick={handleTemplateDownload}>
            <Download className="w-4 h-4 mr-2" />
            Template
          </Button>
          <div className="relative w-full sm:w-auto">
            <input
              type="file"
              id="teacher-import"
              className="hidden"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
            />
            <Button variant="outline" className="w-full sm:w-auto justify-center border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold h-10" onClick={() => document.getElementById('teacher-import')?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Bulk Import
            </Button>
          </div>
          <Button className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 font-semibold h-10 shadow-lg shadow-blue-600/20" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Teacher
          </Button>
        </div>
      </div>

      <AddUserModal
        key={isAddModalOpen ? 'add' : 'add-closed'}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        role="teacher"
        onSuccess={fetchTeachers}
      />

      <AddUserModal
        key={selectedTeacher ? `edit-${selectedTeacher.id}` : 'edit-closed'}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedTeacher(null);
        }}
        role="teacher"
        initialData={selectedTeacher ? {
          id: selectedTeacher.id,
          firstName: selectedTeacher.user?.first_name,
          lastName: selectedTeacher.user?.last_name,
          email: selectedTeacher.user?.email,
          phone: selectedTeacher.user?.phone,
          employeeId: selectedTeacher.employee_id,
          designation: selectedTeacher.designation,
          department: selectedTeacher.department,
          qualification: selectedTeacher.qualification,
          experienceYears: selectedTeacher.experience_years,
          specialization: selectedTeacher.specialization,
          salary: selectedTeacher.salary,
        } : null}
        onSuccess={fetchTeachers}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/10`}>
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-semibold">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-gray-100 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">All Faculty ({filteredTeachers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            <div className="relative w-full">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10"
              />

              <input
                type="search"
                placeholder="Search teachers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 rounded-xl border border-gray-200 bg-white shadow-sm pl-12 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Specialization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  <SelectItem value="Mathematics">Mathematics</SelectItem>
                  <SelectItem value="Science">Science</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="leave">On Leave</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" onClick={() => setSearchTerm('')} className="font-semibold text-gray-500 hidden sm:flex">Reset</Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="font-bold whitespace-nowrap">Teacher</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">Specialization</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">Experience</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">Status</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeachers.map((teacher) => {
                  const firstName = teacher.profile?.first_name ?? teacher.user?.first_name ?? '';
                  const lastName = teacher.profile?.last_name ?? teacher.user?.last_name ?? '';
                  const employeeId = teacher.professional?.employee_id ?? teacher.employee_id ?? '';
                  const specialization = teacher.professional?.specialization ?? teacher.specialization ?? '';
                  const experience = teacher.professional?.experience_years ?? teacher.experience_years ?? '0';
                  const isActive = teacher.profile?.is_active ?? teacher.user?.is_active;

                  return (
                    <TableRow key={teacher.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                            <AvatarFallback className="bg-blue-600 text-white font-bold text-xs">
                              {(firstName?.[0] || '') + (lastName?.[0] || '')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{firstName} {lastName}</p>
                            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-tight">ID: {employeeId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-gray-600">{specialization}</TableCell>
                      <TableCell className="font-semibold text-gray-600">{experience} Years</TableCell>
                      <TableCell>
                        <Badge variant={isActive ? 'default' : 'secondary'} className="rounded-full px-3 font-semibold">
                          {isActive ? 'Active' : 'On Leave'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-lg font-bold text-xs text-gray-400 hover:text-blue-600"
                          onClick={() => {
                            setSelectedTeacher(teacher);
                            setIsEditModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Link to={`/teachers/${teacher.id}`}>
                          <Button size="sm" variant="outline" className="h-8 rounded-lg font-bold text-xs border-gray-200 hover:bg-white hover:text-blue-600">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
