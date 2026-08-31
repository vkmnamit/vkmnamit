import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';

export const getCompetitionsData = async (req: Request, res: Response) => {
  const schoolId = (req as any).user?.school_id;

  try {
    const { data: competitionsData, error } = await supabase
      .from('competitions')
      .select('*')
      .eq('school_id', schoolId)
      .order('date', { ascending: true });

    if (error) throw error;

    const competitions = competitionsData?.map((c: any) => ({
      ...c,
      name: c.title, // Frontend expects 'name'
      schools: 1, 
    })) || [];

    // In a real app you'd calculate a real leaderboard from competition_results
    const leaderboard = [
      { rank: 1, student: 'Priya Patel', class: '10-A', points: 450, competitions: 8 },
      { rank: 2, student: 'Aryan Sharma', class: '10-A', points: 420, competitions: 7 },
      { rank: 3, student: 'Kavya Reddy', class: '9-A', points: 395, competitions: 6 },
      { rank: 4, student: 'Rohan Gupta', class: '9-B', points: 380, competitions: 7 },
      { rank: 5, student: 'Isha Agarwal', class: '10-B', points: 360, competitions: 5 },
    ];

    res.json({
      competitions,
      leaderboard,
      stats: {
        total: competitions.length,
        upcoming: competitions.filter((c: any) => c.status === 'upcoming').length,
        participants: competitions.reduce((acc: number, c: any) => acc + (c.participants || 0), 0),
        schools: 15 
      }
    });
  } catch (err) {
    console.error('Competitions Error:', err);
    res.status(500).json({ error: 'Failed to load competitions data' });
  }
};

export const upsertCompetition = async (req: Request, res: Response) => {
  const schoolId = (req as any).user?.school_id;
  const { id, ...compData } = req.body;

  try {
    const { data, error } = await supabase
      .from('competitions')
      .upsert({
        ...(id ? { id } : {}),
        ...compData,
        school_id: schoolId,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save competition' });
  }
};

export const deleteCompetition = async (req: Request, res: Response) => {
  const { id } = req.params;
  const schoolId = (req as any).user?.school_id;

  try {
    const { error } = await supabase
      .from('competitions')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete competition' });
  }
};
