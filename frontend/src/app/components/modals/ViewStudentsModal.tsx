import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { api } from '../../../lib/api';
import { Skeleton } from '../ui/skeleton';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export function ViewStudentsModal({ isOpen, onClose, academicYearId, academicYearName }: { isOpen: boolean, onClose: () => void, academicYearId: string, academicYearName: string }) {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && academicYearId) {
      fetchStudents();
    }
  }, [isOpen, academicYearId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await api.getStudents({ academic_year_id: academicYearId, limit: '9999' });
      setStudents(data.students || data || []);
    } catch (err) {
      console.error('Failed to fetch students', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white border-none shadow-2xl rounded-3xl">
        <DialogHeader className="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
          <DialogTitle className="text-xl font-bold text-gray-900">
            Students in {academicYearName}
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">Total {students.length} students enrolled.</p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
            </div>
          ) : students.length > 0 ? (
            <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
              <Table>
                <TableHeader className="bg-gray-50/80">
                  <TableRow className="border-gray-100">
                    <TableHead className="font-bold text-gray-700 h-12">Student</TableHead>
                    <TableHead className="font-bold text-gray-700 h-12">Admission No</TableHead>
                    <TableHead className="font-bold text-gray-700 h-12">Class & Section</TableHead>
                    <TableHead className="font-bold text-gray-700 h-12 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student: any) => (
                    <TableRow key={student.id} className="border-gray-100 hover:bg-blue-50/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 ring-2 ring-white shadow-sm">
                            <AvatarFallback className="bg-blue-100 text-blue-700 font-bold text-xs">
                              {student.user?.first_name?.[0]}{student.user?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{student.user?.first_name} {student.user?.last_name}</p>
                            <p className="text-xs text-gray-500">{student.user?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-sm text-gray-600">{student.admission_number || 'N/A'}</TableCell>
                      <TableCell className="text-sm text-gray-600 font-medium">
                        {student.section?.class?.name} - {student.section?.name}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-green-50 text-green-700">
                          Enrolled
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 font-medium">No students found for this academic year.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
