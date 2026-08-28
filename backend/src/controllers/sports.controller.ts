import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';

export const getSportsData = async (req: Request, res: Response) => {
  const schoolId = (req as any).user?.school_id;

  try {
    // 1. Fetch Teams
    const { data: teams, error: teamsError } = await supabase
      .from('sports_teams')
      .select('*, coach:users(first_name, last_name), members:sports_team_members(id)')
      .eq('school_id', schoolId);

    // 2. Fetch Sports Inventory
    const { data: inventory, error: invError } = await supabase
      .from('school_inventory')
      .select('*')
      .eq('school_id', schoolId)
      .eq('category', 'Sports');

    // 3. Fetch Sports Competitions
    const { data: competitions, error: compError } = await supabase
      .from('competitions')
      .select('*')
      .eq('school_id', schoolId)
      .eq('category', 'Sports');

    // Check for "relation does not exist" which means migration hasn't run
    const isMissingTable = (err: any) => err?.code === '42P01';

    if (teamsError && !isMissingTable(teamsError)) throw teamsError;
    if (invError && !isMissingTable(invError)) throw invError;
    if (compError && !isMissingTable(compError)) throw compError;

    res.json({
      teams: teams || [],
      inventory: inventory || [],
      competitions: competitions || []
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const upsertTeam = async (req: Request, res: Response) => {
  const schoolId = (req as any).user?.school_id;
  const { id, ...teamData } = req.body;

  try {
    const { data, error } = await supabase
      .from('sports_teams')
      .upsert({
        ...(id ? { id } : {}),
        ...teamData,
        school_id: schoolId,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save team' });
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  const { id } = req.params;
  const schoolId = (req as any).user?.school_id;

  try {
    const { error } = await supabase
      .from('sports_teams')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
};
