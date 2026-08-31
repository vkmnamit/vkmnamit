import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';

export const getEventsData = async (req: Request, res: Response) => {
  const schoolId = (req as any).user?.school_id;

  try {
    const { data: eventsData, error } = await supabase
      .from('events')
      .select('*')
      .eq('school_id', schoolId)
      .order('date', { ascending: true });

    if (error) throw error;

    return res.json({ events: eventsData || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load events data' });
  }
};

export const upsertEvent = async (req: Request, res: Response) => {
  const schoolId = (req as any).user?.school_id;
  const { id, ...eventData } = req.body;

  try {
    const { data, error } = await supabase
      .from('events')
      .upsert({
        ...(id ? { id } : {}),
        ...eventData,
        school_id: schoolId,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save event' });
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  const { id } = req.params;
  const schoolId = (req as any).user?.school_id;

  try {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
};
