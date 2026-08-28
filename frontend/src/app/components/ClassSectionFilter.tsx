import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api } from '../../lib/api';
import { Label } from './ui/label';
import { useAuth } from '../context/AuthContext';

interface ClassSectionFilterProps {
  onFilterChange: (filters: { classId: string; sectionId: string }) => void;
  showLabels?: boolean;
  className?: string;
}

export function ClassSectionFilter({ onFilterChange, showLabels = true, className = "" }: ClassSectionFilterProps) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');

  useEffect(() => {
    fetchClasses();
  }, [user]);

  const fetchClasses = async () => {
    try {
      const data = user?.role === 'teacher' 
        ? await api.getTeacherSections() 
        : await api.getClasses();
      setClasses(data || []);
    } catch (err) {
      console.error('Failed to fetch classes for filter');
    }
  };

  const handleClassChange = (value: string) => {
    setSelectedClass(value);
    setSelectedSection('all');
    onFilterChange({ classId: value, sectionId: 'all' });
  };

  const handleSectionChange = (value: string) => {
    setSelectedSection(value);
    onFilterChange({ classId: selectedClass, sectionId: value });
  };

  const currentClass = classes.find(c => c.id === selectedClass);
  const sections = currentClass?.sections || [];

  return (
    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-4 ${className}`}>
      <div className="space-y-1.5 flex-1">
        {showLabels && <Label className="text-[10px] font-bold uppercase text-gray-400">Class</Label>}
        <Select value={selectedClass} onValueChange={handleClassChange}>
          <SelectTrigger className="w-full sm:w-[160px] h-12 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 flex-1">
        {showLabels && <Label className="text-[10px] font-bold uppercase text-gray-400">Section</Label>}
        <Select 
          value={selectedSection} 
          onValueChange={handleSectionChange}
          disabled={selectedClass === 'all'}
        >
          <SelectTrigger className="w-full sm:w-[160px] h-12 rounded-xl bg-white border-gray-200 shadow-sm font-medium">
            <SelectValue placeholder="All Sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {sections.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
