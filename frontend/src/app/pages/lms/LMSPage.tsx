import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { BookOpen, FileText, Video, Plus, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { AddAssignmentModal } from '../../components/modals/AddAssignmentModal';
import { toast } from 'sonner';

export function LMSPage() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);

  useEffect(() => {
    fetchLMSData();
  }, []);

  const fetchLMSData = async () => {
    try {
      const data = await api.getLMS();
      setCourses(data?.courses || data || []);
      setAssignments(data?.assignments || []);
      setStats(data?.stats || null);
    } catch (err) {
      console.error('Failed to load LMS data');
      // Fallback data removed - we want to show actual data or empty state
      setCourses([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await api.deleteAssignment(id);
      toast.success('Assignment deleted successfully');
      fetchLMSData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete assignment');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[250px] w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Learning Protocol Hub</h1>
          <p className="text-sm text-gray-500 font-medium">Manage academic courses, module lessons, and digital assignments</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="h-11 px-6 rounded-xl font-bold text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => { setSelectedAssignment(null); setIsAssignmentModalOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Assignment
          </Button>
          <Button className="h-11 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 px-8 rounded-xl font-bold text-xs">
            <BookOpen className="w-4 h-4 mr-2" />
            Deploy Course
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Courses', value: stats?.courses ?? courses.length ?? 0, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-600/10 border-blue-600/20' },
          { label: 'Assignments', value: stats?.assignments ?? assignments.length ?? 0, icon: FileText, color: 'text-green-600', bg: 'bg-green-600/10 border-green-600/20' },
          { label: 'Video Lessons', value: stats?.videoLessons ?? 0, icon: Video, color: 'text-purple-600', bg: 'bg-purple-600/10 border-purple-600/20' },
          { label: 'Completion Rate', value: stats?.completionRate ?? '0%', icon: BookOpen, color: 'text-orange-600', bg: 'bg-orange-600/10 border-orange-600/20' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className={`w-12 h-12 ${s.bg} rounded-xl border flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${s.color}`} />
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="courses" className="space-y-6">
        <TabsList className="bg-gray-100/50 p-1 rounded-xl">
          <TabsTrigger value="courses" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Active Courses</TabsTrigger>
          <TabsTrigger value="assignments" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Assignments Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="space-y-4 outline-none">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Card key={course.id} className="border-gray-100 shadow-xl shadow-gray-100/50 hover:border-blue-200 transition-all overflow-hidden group">
                <CardHeader className="bg-gray-50/50 border-b p-5">
                  <Badge className="w-fit bg-blue-600/10 text-blue-600 border-0 font-black text-[10px] uppercase mb-2">Protocol Active</Badge>
                  <CardTitle className="text-lg font-black uppercase tracking-tight group-hover:text-blue-600 transition-colors">{course.title}</CardTitle>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Instructor: {course.instructor}</p>
                </CardHeader>
                <CardContent className="p-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[10px] font-black text-gray-400 uppercase">Modules / Lessons:</span>
                      <span className="font-black text-gray-900">{course.lessons}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[10px] font-black text-gray-400 uppercase">Enrolled Students:</span>
                      <span className="font-black text-gray-900">{course.students}</span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase">Aggregate Progress:</span>
                        <span className="font-black text-blue-600">{course.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${course.progress}%` }}></div>
                      </div>
                    </div>
                    <Button size="sm" className="w-full mt-2 rounded-xl bg-gray-900 hover:bg-gray-800 font-black uppercase text-[10px] h-10 shadow-lg shadow-gray-900/20">Manage Curriculum</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4 outline-none">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {assignments.map((assignment, index) => (
              <Card key={index} className="border-gray-100 shadow-xl shadow-gray-100/50 hover:border-green-200 transition-all overflow-hidden group">
                <CardContent className="p-6">
                  <div className="flex flex-col h-full justify-between">
                    <div>
                      <Badge className="w-fit bg-green-600/10 text-green-600 border-0 font-black text-[10px] uppercase mb-3">Submission Queue</Badge>
                      <div className="flex justify-between items-start">
                        <h3 className="font-black text-lg text-gray-900 uppercase tracking-tight leading-tight group-hover:text-green-600 transition-colors mb-2">{assignment.title}</h3>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setSelectedAssignment(assignment); setIsAssignmentModalOpen(true); }}>Edit</Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteAssignment(assignment.id)}>Delete</Button>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{assignment.subjectName} | {assignment.className}</p>
                      <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-1">Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div className="mt-6 pt-4 border-t flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase">Submissions</p>
                        <p className="text-xl font-black text-gray-900">{assignment.submissions}<span className="text-sm text-gray-400">/{assignment.total}</span></p>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-xl font-black uppercase text-[10px] border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200">Evaluate</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <AddAssignmentModal 
        isOpen={isAssignmentModalOpen}
        onClose={() => setIsAssignmentModalOpen(false)}
        onSuccess={fetchLMSData}
        initialData={selectedAssignment}
      />
    </div>
  );
}
