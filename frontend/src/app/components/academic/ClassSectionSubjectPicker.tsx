import { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';

export interface ClassSectionSubjectValue {
  classId: string;
  sectionId: string;
  subjectId: string;
}

interface Props {
  value: ClassSectionSubjectValue;
  onChange: (v: ClassSectionSubjectValue) => void;
  required?: boolean;
  showSection?: boolean;
  disabled?: boolean;
}

export function ClassSectionSubjectPicker({
  value,
  onChange,
  required = true,
  showSection = true,
  disabled = false,
}: Props) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  useEffect(() => {
    const fetchFn = user?.role === 'teacher' ? api.getTeacherSections : api.getClasses;
    fetchFn().then(setClasses).catch(() => setClasses([]));
  }, [user]);

  useEffect(() => {
    if (!value.classId) {
      setSections([]);
      setSubjects([]);
      return;
    }
    const cls = classes.find(c => c.id === value.classId);
    setSections(cls?.sections || []);
    loadSubjects(value.classId);
  }, [value.classId, classes]);

  const loadSubjects = async (classId: string) => {
    setLoadingSubjects(true);
    try {
      const data = await api.getSubjects({ classId });
      setSubjects(Array.isArray(data) ? data : []);
    } catch {
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const selectClass = 'w-full h-12 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
            Class {required && '*'}
          </Label>
          <select
            className={selectClass}
            value={value.classId}
            disabled={disabled}
            required={required}
            onChange={(e) => onChange({ classId: e.target.value, sectionId: '', subjectId: '' })}
          >
            <option value="">Select Class</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {showSection && (
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
              Section {required && '*'}
            </Label>
            <select
              className={selectClass}
              value={value.sectionId}
              disabled={disabled || !value.classId}
              required={required}
              onChange={(e) => onChange({ ...value, sectionId: e.target.value })}
            >
              <option value="">Select Section</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>Section {s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
          Subject {required && '*'}
        </Label>
        <select
          className={selectClass}
          value={value.subjectId}
          disabled={disabled || !value.classId || loadingSubjects}
          required={required}
          onChange={(e) => onChange({ ...value, subjectId: e.target.value })}
        >
          <option value="">
            {loadingSubjects ? 'Loading subjects...' : !value.classId ? 'Select class first' : subjects.length === 0 ? 'No subjects assigned to this class' : 'Select Subject'}
          </option>
          {subjects.map(sub => (
            <option key={sub.id} value={sub.id}>
              {sub.name}{sub.code ? ` (${sub.code})` : ''}
            </option>
          ))}
        </select>
        {value.classId && !loadingSubjects && subjects.length === 0 && (
          <p className="text-xs text-amber-600 font-medium">
            No subjects mapped to this class. Go to Subjects page and assign subjects first.
          </p>
        )}
      </div>
    </div>
  );
}
