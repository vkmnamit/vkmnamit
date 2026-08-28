import { supabaseAdmin } from '../config/supabase';
import { UserScope } from '../utils/userScope';

export type EntityResolution =
  | { status: 'resolved'; id: string; label: string }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: { id: string; label: string }[] };

/** Converts human references into tenant- and scope-validated ERP IDs. */
class AIEntityResolver {
  async resolveSection(params: {
    schoolId: string;
    sectionId?: unknown;
    className?: unknown;
    sectionName?: unknown;
  }): Promise<EntityResolution> {
    const candidateId = typeof params.sectionId === 'string' ? params.sectionId : '';
    if (this.isUuid(candidateId)) {
      const { data } = await supabaseAdmin
        .from('sections')
        .select('id, name, class:classes!inner(name, school_id)')
        .eq('id', candidateId)
        .eq('classes.school_id', params.schoolId)
        .maybeSingle();
      return data ? { status: 'resolved', id: data.id, label: `${(data as any).class?.name} ${data.name}` } : { status: 'not_found' };
    }

    const className = typeof params.className === 'string' ? params.className : '';
    const sectionName = typeof params.sectionName === 'string' ? params.sectionName : candidateId;
    if (!className || !sectionName) return { status: 'not_found' };

    const { data: classes } = await supabaseAdmin.from('classes').select('id, name, grade').eq('school_id', params.schoolId);
    
    let matchingClasses = (classes || []).filter((item: any) => item.name === className);
    if (matchingClasses.length === 0) {
      const requestedClass = this.normalize(className);
      matchingClasses = (classes || []).filter((item: any) =>
        this.normalize(item.name) === requestedClass || this.normalize(String(item.grade ?? '')) === requestedClass,
      );
    }
    if (matchingClasses.length !== 1) return { status: 'not_found' };

    const { data: sections } = await supabaseAdmin
      .from('sections')
      .select('id, name')
      .eq('class_id', matchingClasses[0].id);
      
    let matchingSections = (sections || []).filter((section) => section.name === sectionName);
    if (matchingSections.length === 0) {
      matchingSections = (sections || []).filter((section) => this.normalizeSection(section.name) === this.normalizeSection(sectionName));
    }
    
    if (!matchingSections.length) return { status: 'not_found' };
    if (matchingSections.length > 1) return { status: 'ambiguous', candidates: matchingSections.map((section) => ({ id: section.id, label: `${matchingClasses[0].name} ${section.name}` })) };
    return { status: 'resolved', id: matchingSections[0].id, label: `${matchingClasses[0].name} ${matchingSections[0].name}` };
  }

  async resolveStudent(params: {
    schoolId: string;
    studentId?: unknown;
    admissionNumber?: unknown;
    studentName?: unknown;
    scope?: UserScope | null;
  }): Promise<EntityResolution> {
    let query = supabaseAdmin
      .from('students')
      .select('id, admission_number, user:users!inner(first_name, last_name)')
      .eq('school_id', params.schoolId);
    if (params.scope) {
      if (!params.scope.studentIds.length) return { status: 'not_found' };
      query = query.in('id', params.scope.studentIds);
    }
    if (typeof params.studentId === 'string' && this.isUuid(params.studentId)) query = query.eq('id', params.studentId);
    else if (typeof params.admissionNumber === 'string' && params.admissionNumber.trim()) query = query.ilike('admission_number', params.admissionNumber.trim());

    const { data } = await query.limit(10);
    let matches = data || [];
    if (!params.studentId && !params.admissionNumber && typeof params.studentName === 'string') {
      const wanted = this.normalize(params.studentName);
      matches = matches.filter((student: any) => this.normalize(`${student.user?.first_name || ''} ${student.user?.last_name || ''}`) === wanted);
    }
    if (!matches.length) return { status: 'not_found' };
    const candidates = matches.map((student: any) => ({ id: student.id, label: `${student.user?.first_name || ''} ${student.user?.last_name || ''} (${student.admission_number})`.trim() }));
    return candidates.length === 1 ? { status: 'resolved', ...candidates[0] } : { status: 'ambiguous', candidates };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private normalize(value: string) {
    let norm = value.toLowerCase().replace(/\b(class|grade)\b/g, '').replace(/[^a-z0-9]/g, '');
    // Alias common kindergarten naming formats
    if (norm === 'lkg' || norm === 'lowerkg' || norm === 'lowerkindergarten') return 'lkg';
    if (norm === 'ukg' || norm === 'upperkg' || norm === 'upperkindergarten') return 'ukg';
    if (norm === 'nursery' || norm === 'prek' || norm === 'prekindergarten') return 'nursery';
    return norm;
  }

  private normalizeSection(value: string) {
    return value.toLowerCase().replace(/\bsection\b/g, '').replace(/[^a-z0-9]/g, '');
  }
}

export const aiEntityResolver = new AIEntityResolver();
