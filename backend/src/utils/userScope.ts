import { supabaseAdmin } from '../config/supabase';

import NodeCache from 'node-cache';

// 30-second TTL — fast enough for real-time feel, reduces DB load
const scopeCache = new NodeCache({ stdTTL: 30, checkperiod: 60 });

export interface UserScope {
  studentIds: string[];
  sectionIds: string[];
  classIds: string[];
}

/**
 * Clear cached scope for a specific user or all users.
 * Call this when teacher allocations change (timetable update, class teacher reassign).
 */
export function clearScopeCache(userId?: string) {
  if (!userId) {
    scopeCache.flushAll();
    return;
  }
  // Clear all cache keys for this user (across roles/schools)
  const keys = scopeCache.keys().filter(k => k.includes(userId));
  keys.forEach(k => scopeCache.del(k));
}

/** Fetch raw data from Supabase for student/section/class IDs */
async function fetchUserScope(user: {
  id: string;
  role: string;
  school_id: string;
}): Promise<UserScope | null> {
  if (user.role === 'student') {
    const { data } = await supabaseAdmin
      .from('students')
      .select('id, section_id, section:sections(class_id)')
      .eq('user_id', user.id)
      .eq('school_id', user.school_id)
      .maybeSingle();

    if (!data) return { studentIds: [], sectionIds: [], classIds: [] };

    const classId = (data as any).section?.class_id;
    return {
      studentIds: [data.id],
      sectionIds: data.section_id ? [data.section_id] : [],
      classIds: classId ? [classId] : [],
    };
  }

  if (user.role === 'parent') {
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('user_id', user.id)
      .eq('school_id', user.school_id)
      .maybeSingle();

    if (!parent) return { studentIds: [], sectionIds: [], classIds: [] };

    const { data: links } = await supabaseAdmin
      .from('parent_students')
      .select('student_id, student:students(section_id, section:sections(class_id))')
      .eq('parent_id', parent.id);

    const studentIds = links?.map(l => l.student_id) || [];
    const sectionIds = [...new Set(
      links?.map((l: any) => l.student?.section_id).filter(Boolean) || []
    )] as string[];
    const classIds = [...new Set(
      links?.map((l: any) => l.student?.section?.class_id).filter(Boolean) || []
    )] as string[];

    return { studentIds, sectionIds, classIds };
  }

  if (user.role === 'teacher') {
    // 1. Sections where this teacher is assigned as class teacher
    const { data: classTeacherSections } = await supabaseAdmin
      .from('sections')
      .select('id, class_id')
      .eq('class_teacher_id', user.id);

    const { data: timetableSlots } = await supabaseAdmin
      .from('timetable_slots')
      .select('section_id, section:sections(id, class_id)')
      .eq('teacher_id', user.id)
      .eq('school_id', user.school_id);

    const sectionIds = new Set<string>();
    const classIds = new Set<string>();

    // Add class teacher sections
    if (classTeacherSections) {
      classTeacherSections.forEach(s => {
        if (s.id) sectionIds.add(s.id);
        if (s.class_id) classIds.add(s.class_id);
      });
    }

    // Add timetable-based sections
    if (timetableSlots) {
      timetableSlots.forEach((slot: any) => {
        if (slot.section_id) sectionIds.add(slot.section_id);
        if (slot.section?.class_id) classIds.add(slot.section.class_id);
      });
    }

    return { studentIds: [], sectionIds: Array.from(sectionIds), classIds: Array.from(classIds) };
  }

  return null;
}

/** Resolve student/section/class IDs for student & parent & teacher roles with 30s in-memory caching. */
export async function getUserScope(user: {
  id: string;
  role: string;
  school_id: string;
}): Promise<UserScope | null> {
  if (user.role === 'admin' || user.role === 'superadmin') return null; // No cache needed for full access

  const cacheKey = `scope_${user.school_id}_${user.role}_${user.id}`;
  const cached = scopeCache.get<UserScope | null>(cacheKey);
  
  if (cached !== undefined) {
    return cached;
  }

  const scope = await fetchUserScope(user);
  scopeCache.set(cacheKey, scope);
  return scope;
}

