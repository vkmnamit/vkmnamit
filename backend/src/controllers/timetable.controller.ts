import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';
import { aiService } from '../services/ai.service';
import { getUserScope, clearScopeCache } from '../utils/userScope';
import { notificationService } from '../services/notification.service';

const DEFAULT_SUBJECTS = [
  { name: 'English', code: 'ENG' },
  { name: 'Hindi', code: 'HIN' },
  { name: 'Mathematics', code: 'MATH' },
  { name: 'Science', code: 'SCI' },
  { name: 'Social Science', code: 'SST' },
  { name: 'Computer', code: 'COMP' },
  { name: 'General Knowledge', code: 'GK' },
  { name: 'EVS', code: 'EVS' },
  { name: 'Sanskrit', code: 'SAN' },
  { name: 'Moral Science', code: 'MOR' },
  { name: 'Physical Education', code: 'PE' },
  { name: 'Art', code: 'ART' },
  { name: 'Music', code: 'MUS' },
];

async function validateSlotConflict(
  schoolId: string,
  params: { 
    teacherId?: string; 
    sectionId: string; 
    dayOfWeek: number; 
    periodNumber: number; 
    startTime?: string; 
    endTime?: string; 
    room?: string; 
    excludeId?: string;
  }
) {
  const { teacherId, sectionId, dayOfWeek, periodNumber, startTime, endTime, room, excludeId } = params;

  // ── 1. Teacher conflict: check by actual time overlap if times given, else fall back to period_number ──
  if (teacherId) {
    let teacherQ = supabase
      .from('timetable_slots')
      .select('id, start_time, end_time, section:sections(name, class:classes(name))')
      .eq('school_id', schoolId)
      .eq('teacher_id', teacherId)
      .eq('day_of_week', dayOfWeek);

    if (excludeId) teacherQ = teacherQ.neq('id', excludeId);

    const { data: teacherSlots } = await teacherQ;

    if (teacherSlots && teacherSlots.length > 0) {
      for (const existing of teacherSlots) {
        let conflicts = false;

        if (startTime && endTime && existing.start_time && existing.end_time) {
          // True time-overlap: new slot starts before existing ends AND new slot ends after existing starts
          const newStart = startTime;
          const newEnd   = endTime;
          const exStart  = existing.start_time.substring(0, 5); // "HH:MM"
          const exEnd    = existing.end_time.substring(0, 5);
          conflicts = newStart < exEnd && newEnd > exStart;
        } else {
          // Fallback: same period number = conflict
          conflicts = (existing as any).period_number === periodNumber;
        }

        if (conflicts) {
          const sec = (existing as any).section;
          throw new Error(
            `Teacher already assigned to ${sec?.class?.name || ''}${sec?.name ? '-' + sec.name : ' another section'} ` +
            `at ${existing.start_time?.substring(0,5) || '?'} – ${existing.end_time?.substring(0,5) || '?'} on this day`
          );
        }
      }
    }
  }

  // ── 2. Room conflict: same time-overlap check ──
  if (room) {
    let roomQ = supabase
      .from('timetable_slots')
      .select('id, start_time, end_time')
      .eq('school_id', schoolId)
      .eq('day_of_week', dayOfWeek)
      .eq('room_number', room);
    if (excludeId) roomQ = roomQ.neq('id', excludeId);
    const { data: roomSlots } = await roomQ;

    if (roomSlots) {
      for (const existing of roomSlots) {
        let conflicts = false;
        if (startTime && endTime && existing.start_time && existing.end_time) {
          const exStart = existing.start_time.substring(0, 5);
          const exEnd   = existing.end_time.substring(0, 5);
          conflicts = startTime < exEnd && endTime > exStart;
        } else {
          conflicts = true;
        }
        if (conflicts) {
          throw new Error(`Room "${room}" is already booked at this time`);
        }
      }
    }
  }

  // ── 3. Section double-booking: same section can't have two periods overlapping ──
  let sectionQ = supabase
    .from('timetable_slots')
    .select('id, start_time, end_time')
    .eq('school_id', schoolId)
    .eq('section_id', sectionId)
    .eq('day_of_week', dayOfWeek);
  if (excludeId) sectionQ = sectionQ.neq('id', excludeId);
  const { data: sectionSlots } = await sectionQ;

  if (sectionSlots) {
    for (const existing of sectionSlots) {
      let conflicts = false;
      if (startTime && endTime && existing.start_time && existing.end_time) {
        const exStart = existing.start_time.substring(0, 5);
        const exEnd   = existing.end_time.substring(0, 5);
        conflicts = startTime < exEnd && endTime > exStart;
      } else {
        conflicts = (existing as any).period_number === periodNumber;
      }
      if (conflicts) {
        throw new Error('This section already has a period scheduled that overlaps with this time slot');
      }
    }
  }
}

export const getTimetable = async (req: Request, res: Response) => {
  const { classId, sectionId } = req.query;
  const user = (req as any).user;
  const school_id = user?.school_id;

  if (!school_id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const scope = await getUserScope(user);

    let query = supabase
      .from('timetable_slots')
      .select(`
        *,
        subjects(name, code),
        users(first_name, last_name)
      `)
      .eq('school_id', school_id);

    if (user.role === 'teacher') {
      if (sectionId && sectionId !== 'all') {
        if (scope && scope.sectionIds.includes(sectionId as string)) {
          query = query.eq('section_id', sectionId as string);
        } else {
          return res.json({ slots: [] }); // Unauthorized for this section
        }
      } else {
        query = query.eq('teacher_id', user.id);
      }
    } else if (scope) {
      if (scope.sectionIds.length === 0) return res.json({ slots: [] });
      query = query.in('section_id', scope.sectionIds);
      if (sectionId && sectionId !== 'all' && scope.sectionIds.includes(sectionId as string)) {
        query = query.eq('section_id', sectionId as string);
      }
    } else {
      if (sectionId && sectionId !== 'all') {
        query = query.eq('section_id', sectionId);
      } else if (classId && classId !== 'all') {
        const { data: sections } = await supabase.from('sections').select('id').eq('class_id', classId);
        const sectionIds = sections?.map(s => s.id) || [];
        if (sectionIds.length > 0) {
          query = query.in('section_id', sectionIds);
        } else {
          return res.json({ slots: [] });
        }
      }
    }

    const { data: slots, error } = await query.order('day_of_week').order('start_time');

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ slots: slots || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load timetable' });
  }
};

export const createSlot = async (req: Request, res: Response) => {
  try {
    const { sectionId, subjectId, teacherId, dayOfWeek, periodNumber, startTime, endTime, room, makeClassTeacher } = req.body;
    const school_id = (req as any).user?.school_id;
    const requestUser = (req as any).user;

    if (!sectionId || !subjectId || dayOfWeek == null || !periodNumber) {
      return res.status(400).json({ error: 'sectionId, subjectId, dayOfWeek, and periodNumber are required' });
    }

    // Teachers can only create slots for their own sections (class teacher check)
    if (requestUser.role === 'teacher') {
      const { data: section } = await supabase
        .from('sections')
        .select('class_teacher_id')
        .eq('id', sectionId)
        .single();
      if (!section || section.class_teacher_id !== requestUser.id) {
        return res.status(403).json({ error: 'You can only add slots to sections where you are the class teacher' });
      }
    }

    await validateSlotConflict(school_id, {
      teacherId,
      sectionId,
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
      room: room || req.body.roomNumber,
    });

    const { data, error } = await supabase
      .from('timetable_slots')
      .insert({
        school_id,
        section_id: sectionId,
        subject_id: subjectId,
        teacher_id: teacherId,
        day_of_week: dayOfWeek,
        period_number: periodNumber,
        start_time: startTime,
        end_time: endTime,
        room_number: room || req.body.roomNumber,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Auto-sync: register teacher's access to this section's class via class_subjects
    if (teacherId && subjectId && data) {
      const { data: section } = await supabase
        .from('sections')
        .select('class_id')
        .eq('id', sectionId)
        .single();
      if (section?.class_id) {
        // Upsert so there's no duplicate — if already exists, update teacher
        await supabase
          .from('class_subjects')
          .upsert({
            class_id: section.class_id,
            subject_id: subjectId,
            teacher_id: teacherId,
          }, { onConflict: 'class_id,subject_id', ignoreDuplicates: false })
          .select();
      }
    }

    if (makeClassTeacher && teacherId) {
      // teacherId is already user_id
      // 1. Remove this teacher from any other sections first
      await supabase
        .from('sections')
        .update({ class_teacher_id: null })
        .eq('class_teacher_id', teacherId);

      // 2. Assign to the new section
      await supabase
        .from('sections')
        .update({ class_teacher_id: teacherId })
        .eq('id', sectionId);
    }

    // Invalidate scope cache for the assigned teacher
    if (teacherId) clearScopeCache(teacherId);

    return res.status(201).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create slot' });
  }
};

export const updateSlot = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const school_id = (req as any).user?.school_id;
    const requestUser = (req as any).user;
    const { sectionId, subjectId, teacherId, dayOfWeek, periodNumber, startTime, endTime, room, makeClassTeacher } = req.body;

    const { data: existing } = await supabase
      .from('timetable_slots')
      .select('*')
      .eq('id', id)
      .eq('school_id', school_id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Slot not found' });

    // Teachers can only edit their own slots
    if (requestUser.role === 'teacher' && existing.teacher_id !== requestUser.id) {
      return res.status(403).json({ error: 'You can only edit your own timetable slots' });
    }

    const next = {
      sectionId: sectionId ?? existing.section_id,
      subjectId: subjectId ?? existing.subject_id,
      teacherId: teacherId ?? existing.teacher_id,
      dayOfWeek: dayOfWeek ?? existing.day_of_week,
      periodNumber: periodNumber ?? existing.period_number,
      room: room ?? existing.room_number,
    };

    await validateSlotConflict(school_id, {
      teacherId: next.teacherId,
      sectionId: next.sectionId,
      dayOfWeek: next.dayOfWeek,
      periodNumber: next.periodNumber,
      startTime: startTime ?? existing.start_time,
      endTime: endTime ?? existing.end_time,
      room: next.room,
      excludeId: id,
    });

    const updates: Record<string, any> = {};
    if (sectionId !== undefined) updates.section_id = sectionId;
    if (subjectId !== undefined) updates.subject_id = subjectId;
    if (teacherId !== undefined) updates.teacher_id = teacherId;
    if (dayOfWeek !== undefined) updates.day_of_week = dayOfWeek;
    if (periodNumber !== undefined) updates.period_number = periodNumber;
    if (startTime !== undefined) updates.start_time = startTime;
    if (endTime !== undefined) updates.end_time = endTime;
    if (room !== undefined) updates.room_number = room;

    const { data, error } = await supabase
      .from('timetable_slots')
      .update(updates)
      .eq('id', id)
      .eq('school_id', school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    if (makeClassTeacher && next.teacherId) {
      await supabase
        .from('sections')
        .update({ class_teacher_id: next.teacherId })
        .eq('id', next.sectionId);
    }

    // Auto-sync class_subjects when teacher assignment changes
    if (next.teacherId && next.subjectId && next.sectionId) {
      const { data: section } = await supabase
        .from('sections')
        .select('class_id')
        .eq('id', next.sectionId)
        .single();
      if (section?.class_id) {
        await supabase
          .from('class_subjects')
          .upsert({
            class_id: section.class_id,
            subject_id: next.subjectId,
            teacher_id: next.teacherId,
          }, { onConflict: 'class_id,subject_id', ignoreDuplicates: false })
          .select();
      }
    }

    // Invalidate scope cache for affected teachers
    if (next.teacherId) clearScopeCache(next.teacherId);
    if (existing.teacher_id && existing.teacher_id !== next.teacherId) clearScopeCache(existing.teacher_id);

    return res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update slot' });
  }
};

export const deleteSlot = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const school_id = (req as any).user?.school_id;
    const requestUser = (req as any).user;

    // Teachers can only delete their own slots
    if (requestUser.role === 'teacher') {
      const { data: slot } = await supabase
        .from('timetable_slots')
        .select('teacher_id')
        .eq('id', id)
        .eq('school_id', school_id)
        .single();
      if (!slot || slot.teacher_id !== requestUser.id) {
        return res.status(403).json({ error: 'You can only delete your own timetable slots' });
      }
    }

    const { error } = await supabase
      .from('timetable_slots')
      .delete()
      .eq('id', id)
      .eq('school_id', school_id);

    if (error) return res.status(400).json({ error: error.message });
    // Invalidate scope cache for the teacher who had this slot
    clearScopeCache();

    return res.json({ message: 'Slot deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};

export const generateAITimetable = async (req: Request, res: Response) => {
  const { sectionId, prompt, preview = false } = req.body;
  const school_id = (req as any).user?.school_id;

  if (!sectionId) return res.status(400).json({ error: 'sectionId is required' });

  try {
    // If prompt provided, pass it. We assume aiService.generateClassTimetable supports a third/fourth param if needed, 
    // or we can just pass it. For now, since ai.service might not be fully modified, we'll just pass it through.
    const result = await aiService.generateClassTimetable(school_id, sectionId, preview, prompt);
    res.json({ 
      message: preview ? 'AI Timetable preview generated' : 'AI Timetable generated and saved successfully', 
      result 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getSubjects = async (req: Request, res: Response) => {
  const school_id = (req as any).user?.school_id;
  const { classId, sectionId } = req.query;
  try {
    if (sectionId) {
      // Find class_id for this section first
      const { data: section } = await supabase.from('sections').select('class_id').eq('id', sectionId as string).single();
      if (section && section.class_id) {
        const { data, error } = await supabase
          .from('class_subjects')
          .select('id, periods_per_week, subjects(id, name, code, is_elective), users:teacher_id(id, first_name, last_name)')
          .eq('class_id', section.class_id);
        if (error) return res.status(400).json({ error: error.message });
        return res.json(data?.map(cs => ({
          id: (cs.subjects as any)?.id,
          classSubjectId: cs.id,
          name: (cs.subjects as any)?.name,
          code: (cs.subjects as any)?.code,
          isElective: (cs.subjects as any)?.is_elective,
          periodsPerWeek: cs.periods_per_week,
          teacher: cs.users ? { id: (cs.users as any).id, name: `${(cs.users as any).first_name} ${(cs.users as any).last_name || ''}`.trim() } : null
        })) || []);
      }
      return res.json([]);
    }
    if (classId) {
      const { data, error } = await supabase
        .from('class_subjects')
        .select('id, periods_per_week, subjects(id, name, code, is_elective), users:teacher_id(id, first_name, last_name)')
        .eq('class_id', classId);
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data?.map(cs => ({
        id: (cs.subjects as any)?.id,
        classSubjectId: cs.id,
        name: (cs.subjects as any)?.name,
        code: (cs.subjects as any)?.code,
        isElective: (cs.subjects as any)?.is_elective,
        periodsPerWeek: cs.periods_per_week,
        teacher: cs.users ? { id: (cs.users as any).id, name: `${(cs.users as any).first_name} ${(cs.users as any).last_name || ''}`.trim() } : null
      })) || []);
    }
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code, is_elective, description')
      .eq('school_id', school_id)
      .order('name');
    
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subjects' });
  }
};

export const seedDefaultSubjects = async (req: Request, res: Response) => {
  const school_id = (req as any).user?.school_id;
  try {
    const { data: existing } = await supabase.from('subjects').select('name').eq('school_id', school_id);
    const existingNames = new Set((existing || []).map(s => s.name.toLowerCase()));
    const toInsert = DEFAULT_SUBJECTS.filter(s => !existingNames.has(s.name.toLowerCase()))
      .map(s => ({ school_id, name: s.name, code: s.code, is_elective: false }));
    if (toInsert.length === 0) return res.json({ message: 'All default subjects already exist', created: 0 });
    const { data, error } = await supabase.from('subjects').insert(toInsert).select();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: `Created ${data?.length || 0} default subjects`, created: data?.length || 0, subjects: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to seed default subjects' });
  }
};

export const createSubject = async (req: Request, res: Response) => {
  const school_id = (req as any).user?.school_id;
  const { name, code, description, isElective } = req.body;
  if (!name) return res.status(400).json({ error: 'Subject name is required' });
  try {
    const { data, error } = await supabase
      .from('subjects')
      .insert({ school_id, name, code: code || null, description: description || null, is_elective: isElective || false })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create subject' });
  }
};

export const deleteSubject = async (req: Request, res: Response) => {
  const school_id = (req as any).user?.school_id;
  const { id } = req.params;
  try {
    const { error } = await supabase.from('subjects').delete().eq('id', id).eq('school_id', school_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Subject deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
};

export const addSubjectToClass = async (req: Request, res: Response) => {
  const { classId, sectionId, subjectId, teacherId, periodsPerWeek } = req.body;
  const school_id = (req as any).user?.school_id;
  const userId = (req as any).user?.id;

  if (!classId || !sectionId || !subjectId) {
    return res.status(400).json({ error: 'classId, sectionId, and subjectId are required' });
  }
  try {
    // First check if it exists
    const { data: existing } = await supabase
      .from('class_subjects')
      .select('id')
      .eq('section_id', sectionId)
      .eq('subject_id', subjectId)
      .maybeSingle();

    let data;
    let error;

    if (existing) {
      const res = await supabase
        .from('class_subjects')
        .update({
          class_id: classId,
          teacher_id: teacherId || null,
          periods_per_week: periodsPerWeek || 5,
        })
        .eq('id', existing.id)
        .select('*, subjects(name), sections(name, class:classes(name))')
        .single();
      data = res.data;
      error = res.error;
    } else {
      const res = await supabase
        .from('class_subjects')
        .insert({
          class_id: classId,
          section_id: sectionId,
          subject_id: subjectId,
          teacher_id: teacherId || null,
          periods_per_week: periodsPerWeek || 5,
        })
        .select('*, subjects(name), sections(name, class:classes(name))')
        .single();
      data = res.data;
      error = res.error;
    }

    if (error) return res.status(400).json({ error: error.message });

    const subjectName = (data as any).subjects?.name || 'Subject';
    const sectionLabel = `${(data as any).sections?.class?.name || ''} - ${(data as any).sections?.name || ''}`;

    if (teacherId) {
      await notificationService.sendMultiChannel({
        schoolId: school_id,
        userId: teacherId,
        channels: ['email', 'whatsapp'],
        type: 'subject_assigned',
        title: `Assigned to teach ${subjectName}`,
        message: `You have been assigned to teach ${subjectName} for ${sectionLabel}.`,
        sourceType: 'subject_assigned',
        sourceId: data.id,
      });
    }

    await supabase.from('audit_logs').insert({
      school_id,
      user_id: userId,
      action: 'subject_assigned',
      entity_type: 'class_subject',
      entity_id: data.id,
      new_data: { classId, sectionId, subjectId, teacherId },
    });

    return res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign subject to section' });
  }
};

export const removeSubjectFromClass = async (req: Request, res: Response) => {
  const { classSubjectId } = req.params;
  try {
    const { error } = await supabase.from('class_subjects').delete().eq('id', classSubjectId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Subject removed from class' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subject from class' });
  }
};

export const publishTimetable = async (req: Request, res: Response) => {
  const school_id = (req as any).user?.school_id;
  const userId = (req as any).user?.id;
  const { sectionId } = req.body;

  if (!sectionId) return res.status(400).json({ error: 'sectionId is required' });

  try {
    const { data: slots, error: slotsErr } = await supabase
      .from('timetable_slots')
      .select('*')
      .eq('school_id', school_id)
      .eq('section_id', sectionId);

    if (slotsErr) return res.status(400).json({ error: slotsErr.message });

    await supabase
      .from('timetable_slots')
      .update({ is_published: true })
      .eq('school_id', school_id)
      .eq('section_id', sectionId);

    const { count } = await supabase
      .from('timetable_versions')
      .select('*', { count: 'exact', head: true })
      .eq('section_id', sectionId);

    await supabase.from('timetable_versions').insert({
      school_id,
      section_id: sectionId,
      version_number: (count || 0) + 1,
      published_by: userId,
      snapshot: slots || [],
    });

    const { notificationService } = await import('../services/notification.service');
    await notificationService.notifySection({
      schoolId: school_id,
      sectionId,
      type: 'timetable',
      title: 'Timetable Updated',
      message: 'The class timetable has been updated. Please check your schedule in the portal.',
      htmlContent: '<p>Your class timetable has been published. Log in to view the updated schedule.</p>',
      sourceId: sectionId,
    });

    return res.json({ success: true, message: 'Timetable published and notifications sent', slots: slots?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish timetable' });
  }
};

