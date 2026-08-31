import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { generateFeesForAcademicYear } from '../services/fee_promotion.service';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export const getAcademicYears = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .select('*, students(count)')
      .eq('school_id', schoolId)
      .order('start_date', { ascending: false });

    if (error) throw error;

    // Format the response to extract the count
    const formattedData = data?.map((year: any) => ({
      ...year,
      student_count: year.students?.[0]?.count || 0
    }));

    res.json(formattedData || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch academic years' });
  }
};

export const getCurrentAcademicYear = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch current academic year' });
  }
};

export const createAcademicYear = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const { name, start_date, end_date, is_current } = req.body;

    if (!name?.trim() || !start_date || !end_date) {
      return res.status(400).json({ error: 'Academic year name, start date, and end date are required.' });
    }
    const start = new Date(`${start_date}T00:00:00Z`);
    const end = new Date(`${end_date}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'The academic year end date must be after a valid start date.' });
    }

    if (is_current) {
      // Unset current for other academic years
      await supabaseAdmin
        .from('academic_years')
        .update({ is_current: false })
        .eq('school_id', schoolId)
        .eq('is_current', true);
    }

    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .insert([{ school_id: schoolId, name, start_date, end_date, is_current: is_current || false }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create academic year' });
  }
};

export const updateAcademicYear = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const { id } = req.params;
    const { name, start_date, end_date } = req.body;

    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .update({ name, start_date, end_date })
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update academic year' });
  }
};

export const deleteAcademicYear = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('academic_years')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;
    res.json({ message: 'Academic year deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete academic year' });
  }
};

export const setCurrentAcademicYear = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const userId = req.user?.id;
    const { id } = req.params;
    const { auto_rollover = false } = req.body;

    const { data: targetYear, error: targetYearError } = await supabaseAdmin
      .from('academic_years')
      .select('id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .maybeSingle();

    if (targetYearError) throw targetYearError;
    if (!targetYear) return res.status(404).json({ error: 'Academic year not found for this school' });

    // Capture previous current year for rollover from
    const { data: prevCurrentYear } = await supabaseAdmin
      .from('academic_years')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle();

    // Reset current for all
    const { error: resetError } = await supabaseAdmin
      .from('academic_years')
      .update({ is_current: false })
      .eq('school_id', schoolId);

    if (resetError) throw resetError;

    // Set new current
    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .update({ is_current: true })
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) throw error;

    // ── AUTO-ROLLOVER: promote students + copy fees + carry transport ──
    let rolloverSummary: any = null;
    if (auto_rollover && prevCurrentYear) {
      try {
        const { data: log } = await supabaseAdmin.from('rollover_logs').insert({
          school_id: schoolId, from_academic_year_id: prevCurrentYear.id, to_academic_year_id: data.id,
          status: 'pending', created_by: userId
        }).select().single();
        if (!log) throw new Error('No rollover log');

        const { data: toClasses } = await supabaseAdmin.from('classes').select('*, sections(*)').eq('school_id', schoolId).eq('academic_year_id', data.id);
        const byGrade = new Map<number, any>();
        (toClasses || []).forEach((c: any) => byGrade.set(c.grade || 0, c));

        const { data: students } = await supabaseAdmin.from('students')
          .select('id, section:sections(id, class_id, class:classes(grade))')
          .eq('school_id', schoolId).eq('academic_year_id', prevCurrentYear.id).eq('status', 'active');

        let promoted = 0, passedOut = 0, feeCopied = 0;
        const promoRows: any[] = [];
        for (const r of students || []) {
          const s: any = r;
          const g = s.section?.class?.grade;
          if (g === undefined) continue;
          const fromSectionId = s.section?.id;
          if (g === 13 || g === 15) {
            await supabaseAdmin.from('students').update({ status: 'passed_out', passed_out_year: prevCurrentYear.name, section_id: null, academic_year_id: data.id }).eq('id', s.id);
            promoRows.push({ school_id: schoolId, student_id: s.id, from_section_id: fromSectionId || null, to_section_id: null, from_academic_year_id: prevCurrentYear.id, to_academic_year_id: data.id, promotion_type: 'passed_out', created_by: userId });
            passedOut++; continue;
          }
          const nc = byGrade.get(g + 1);
          if (!nc) continue;
          const secName = (await supabaseAdmin.from('sections').select('name').eq('id', s.section?.id).single()).data?.name || 'A';
          let ts = nc.sections?.find((x: any) => x.name === secName) || nc.sections?.[0];
          if (!ts) { const { data: ns } = await supabaseAdmin.from('sections').insert({ class_id: nc.id, name: secName, capacity: 60 }).select().single(); ts = ns; }
          await supabaseAdmin.from('students').update({ section_id: ts?.id, academic_year_id: data.id }).eq('id', s.id);
          promoRows.push({ school_id: schoolId, student_id: s.id, from_section_id: fromSectionId || null, to_section_id: ts?.id, from_academic_year_id: prevCurrentYear.id, to_academic_year_id: data.id, promotion_type: 'promoted', created_by: userId });
          promoted++;
        }
        if (promoRows.length > 0) await supabaseAdmin.from('student_promotions').insert(promoRows);

        const { data: fees } = await supabaseAdmin.from('fee_structures').select('*').eq('school_id', schoolId).eq('academic_year_id', prevCurrentYear.id);
        for (const f of fees || []) {
          const { data: oc } = await supabaseAdmin.from('classes').select('grade').eq('id', f.class_id).single();
          if (!oc || oc.grade === 13 || oc.grade === 15) continue;
          const nc = byGrade.get((oc.grade || 0) + 1);
          if (!nc) continue;
          const { data: ex } = await supabaseAdmin.from('fee_structures').select('id').eq('school_id', schoolId).eq('academic_year_id', data.id).eq('class_id', nc.id).eq('name', f.name).maybeSingle();
          if (ex) continue;
          await supabaseAdmin.from('fee_structures').insert({ school_id: schoolId, academic_year_id: data.id, class_id: nc.id, name: f.name, amount: f.amount, frequency: f.frequency, due_day: f.due_day, is_mandatory: f.is_mandatory }).select().single();
          feeCopied++;
        }

        // ── AUTO-PUSH FEES: generate the new year's fee payments for every
        // promoted student from the (just-copied) fee structures. Dedup-safe
        // and exemption-aware — admin never assigns fees manually. ──
        let feesGenerated = 0, feeSkipped = 0;
        try {
          const feeResult = await generateFeesForAcademicYear(schoolId, data.id, userId);
          feesGenerated = feeResult.generated;
          feeSkipped = feeResult.skipped;
        } catch (feeErr: any) {
          console.warn('Auto fee generation warning:', feeErr.message);
        }

        await supabaseAdmin.from('rollover_logs').update({
          status: 'completed', students_promoted: promoted, students_passed_out: passedOut,
          fee_structures_copied: feeCopied, fees_generated: feesGenerated
        }).eq('id', log.id);
        rolloverSummary = { rolloverId: log.id, promoted, passedOut, feeStructuresCopied: feeCopied, feesGenerated, alreadyBilledSkipped: feeSkipped };
      } catch (e: any) {
        console.warn('Auto-rollover:', e.message);
        rolloverSummary = { error: e.message };
      }
    }

    res.json({ ...data, rolloverReady: !!prevCurrentYear, prevCurrentYear: prevCurrentYear?.name || null, autoRollover: rolloverSummary });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to set current academic year' });
  }
};

/**
 * POST /academic-years/:id/generate-fees
 * Pushes the year's fee structures onto every active student as pending
 * fee_payments. Dedup-safe (skips already-billed pairs) and exemption-aware,
 * so it is safe to run any time — e.g. to bill students promoted before
 * auto-generation existed.
 */
export const generateFeesForYear = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = req.user?.school_id;
    const userId = req.user?.id || req.user?.sub;
    const { id } = req.params;

    const { data: year, error } = await supabaseAdmin
      .from('academic_years')
      .select('id, name')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();
    if (error || !year) return res.status(404).json({ error: 'Academic year not found' });

    const result = await generateFeesForAcademicYear(schoolId, year.id, userId);
    res.json({ message: `Generated ${result.generated} fee payments for ${year.name} (${result.skipped} already billed, month: ${result.monthLabel})`, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate fees' });
  }
};
