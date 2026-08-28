import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../config/supabase';
import { notificationService } from '../services/notification.service';

// ==========================================
// MORNING ASSEMBLIES
// ==========================================

export async function createAssembly(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { title, date, startTime, endTime, venue, type, theme, dressCode, instructions, activities } = req.body;

    const { data: assembly, error } = await supabaseAdmin
      .from('assemblies' as any)
      .insert({
        school_id: schoolId,
        title, date, start_time: startTime, end_time: endTime,
        venue, type: type || 'regular', theme, dress_code: dressCode, instructions,
        status: 'scheduled'
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    if (activities && activities.length > 0) {
      const activityPayload = activities.map((act: any, idx: number) => ({
        assembly_id: assembly.id,
        sequence_order: idx,
        activity_name: act.name,
        assigned_to_type: act.assignedToType,
        assigned_to_id: act.assignedToId || null,
        assigned_to_name: act.assignedToName || null,
        status: 'pending'
      }));

      await supabaseAdmin.from('assembly_activities' as any).insert(activityPayload);
    }

    // Trigger notifications asynchronously
    notifyAssemblyParticipants(schoolId, assembly, activities).catch(console.error);

    return res.status(201).json(assembly);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create assembly' });
  }
}

async function notifyAssemblyParticipants(schoolId: string, assembly: any, activities: any[]) {
  try {
    // Notify specific performing students
    if (activities && activities.length > 0) {
      const studentActivities = activities.filter((act: any) => act.assignedToType === 'student' && act.assignedToId);
      for (const act of studentActivities) {
        const { data: student } = await supabaseAdmin
          .from('students')
          .select('user_id, user:users(email, phone), parents:parent_students(parent:parents(user_id, user:users(email, phone)))')
          .eq('id', act.assignedToId)
          .single();
          
        if (student?.user_id) {
          const parent = (student.parents as any)?.[0]?.parent;
          
          await notificationService.sendMultiChannel({
            schoolId, 
            userId: student.user_id,
            channels: ['push', 'email'],
            type: 'assembly_role',
            title: `Assembly Role Assigned: ${act.name}`,
            message: `You have been selected to perform ${act.name} in the ${assembly.title} assembly on ${assembly.date}.`,
            emailAddress: (student.user as any)?.email,
            sourceType: 'assembly', 
            sourceId: assembly.id
          }).catch(() => {});
          
          if (parent?.user_id) {
            await notificationService.sendMultiChannel({
              schoolId, 
              userId: parent.user_id,
              channels: ['push', 'email'],
              type: 'assembly_role_parent',
              title: `Assembly Role Assigned: ${act.name}`,
              message: `Your child has been selected to perform ${act.name} in the ${assembly.title} assembly on ${assembly.date}.`,
              emailAddress: parent?.user?.email,
              sourceType: 'assembly', 
              sourceId: assembly.id
            }).catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    console.error('Error in notifyAssemblyParticipants:', e);
  }
}

export async function getAssemblies(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { startDate, endDate } = req.query;

    let query = supabaseAdmin
      .from('assemblies' as any)
      .select(`
        *,
        activities:assembly_activities(*)
      `)
      .eq('school_id', schoolId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (startDate) query = query.gte('date', startDate as string);
    if (endDate) query = query.lte('date', endDate as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch assemblies' });
  }
}

export async function updateAssembly(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { title, date, startTime, endTime, venue, type, theme, dressCode, instructions, status, activities } = req.body;

    const payload: any = {};
    if (title !== undefined) payload.title = title;
    if (date !== undefined) payload.date = date;
    if (startTime !== undefined) payload.start_time = startTime;
    if (endTime !== undefined) payload.end_time = endTime;
    if (venue !== undefined) payload.venue = venue;
    if (type !== undefined) payload.type = type;
    if (theme !== undefined) payload.theme = theme;
    if (dressCode !== undefined) payload.dress_code = dressCode;
    if (instructions !== undefined) payload.instructions = instructions;
    if (status !== undefined) payload.status = status;

    const { data, error } = await supabaseAdmin
      .from('assemblies' as any)
      .update(payload)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Handle activities update if provided
    if (activities) {
      // Simplest approach: Delete existing and re-insert
      await supabaseAdmin.from('assembly_activities' as any).delete().eq('assembly_id', id);
      const activityPayload = activities.map((act: any, idx: number) => ({
        assembly_id: id,
        sequence_order: idx,
        activity_name: act.name || act.activity_name,
        assigned_to_type: act.assignedToType || act.assigned_to_type,
        assigned_to_id: act.assignedToId || act.assigned_to_id || null,
        assigned_to_name: act.assignedToName || act.assigned_to_name || null,
        status: act.status || 'pending',
        remarks: act.remarks || null
      }));
      await supabaseAdmin.from('assembly_activities' as any).insert(activityPayload);
      
      // Send notifications for updated activities
      notifyAssemblyParticipants(req.user!.school_id, data, activities).catch(console.error);
    } else {
      // If no activities provided but assembly details changed, we could still notify if needed, 
      // but current notify logic requires activities array.
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update assembly' });
  }
}

export async function deleteAssembly(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    
    // First delete activities (though cascading delete might be set up in db)
    await supabaseAdmin.from('assembly_activities' as any).delete().eq('assembly_id', id);
    
    const { error } = await supabaseAdmin
      .from('assemblies' as any)
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ message: 'Assembly deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete assembly' });
  }
}
