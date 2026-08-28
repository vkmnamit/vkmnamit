import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// ── FEE HEADS ───────────────────────────────────────────────

export async function getFeeHeads(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('fee_heads')
      .select('*')
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch fee heads' });
  }
}

export async function createFeeHead(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('fee_heads')
      .insert({ ...req.body, school_id: req.user!.school_id })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create fee head' });
  }
}

// ── FEE STRUCTURE COMPONENTS ───────────────────────────────

export async function getStructureComponents(req: AuthenticatedRequest, res: Response) {
  try {
    const { structureId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('fee_component_values')
      .select(`
        *,
        head:fee_heads(name, is_recurring)
      `)
      .eq('fee_structure_id', structureId);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch components' });
  }
}

export async function addComponentToStructure(req: AuthenticatedRequest, res: Response) {
  try {
    const { structureId, headId, amount } = req.body;

    const { data, error } = await supabaseAdmin
      .from('fee_component_values')
      .insert({
        fee_structure_id: structureId,
        fee_head_id: headId,
        amount
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Note: In a production environment, you would also trigger a recalculation
    // of the total amount in the parent fee_structure table here.

    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add component' });
  }
}
