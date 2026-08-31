import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function currentMonthLabel() {
  const now = new Date();
  return now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
  return { start, end, dueDate, label: currentMonthLabel(), daysInMonth };
}

/**
 * When students are assigned to a route that has a monthly_fee > 0,
 * immediately create the current-month fee_payment for them if not already existing.
 */
/**
 * Generate current-month transport fee for the given students on a route.
 * Logic:
 *   - If todayDay <= 5  → auto-push immediately (start of month, expected)
 *   - If todayDay > 5   → only push if admin explicitly set pushImmediately = true
 */
async function assignCurrentMonthlyRouteFees(
  schoolId: string,
  routeId: string,
  studentIds: string[],
  pushImmediately: boolean = false
) {
  const todayDay = new Date().getDate();
  const shouldPush = todayDay <= 5 || pushImmediately === true;
  if (!shouldPush) {
    console.log(`[TRANSPORT FEE] Day ${todayDay} > 5 and pushImmediately=false — skipping current-month fee generation`);
    return;
  }

  // Fetch the route to get fee amount
  const { data: route, error: routeErr } = await supabaseAdmin
    .from('transport_routes')
    .select('id, name, monthly_fee, fee_amount')
    .eq('id', routeId)
    .maybeSingle();
  if (routeErr || !route) return;

  // Use monthly_fee if available, else fall back to fee_amount
  const monthlyFee = Number(route.monthly_fee ?? route.fee_amount ?? 0);
  if (monthlyFee <= 0) return;

  const { start, end, dueDate, label } = currentMonthBounds();
  const title = `${route.name} - Monthly Transport Fee - ${label}`;

  // Check who already has this month's transport fee
  const { data: existing } = await supabaseAdmin
    .from('fee_payments')
    .select('student_id')
    .eq('transport_route_id', routeId)
    .eq('title', title)
    .gte('created_at', start)
    .lt('created_at', end);

  const existingIds = new Set((existing || []).map((p: any) => p.student_id));

  const payments = studentIds
    .filter(id => !existingIds.has(id))
    .map(studentId => ({
      school_id: schoolId,
      student_id: studentId,
      fee_structure_id: null,
      academic_year_id: null,
      transport_route_id: routeId,
      title,
      amount: monthlyFee,
      paid_amount: 0,
      status: 'pending',
      payment_method: 'unpaid',
      due_date: dueDate,
      late_fee: 0,
      remarks: `Transport fee for ${label}`,
    }));

  if (payments.length > 0) {
    const { error } = await supabaseAdmin.from('fee_payments').insert(payments);
    if (error) console.error('[TRANSPORT FEE] Failed to insert monthly fees:', error.message);
    else console.log(`[TRANSPORT FEE] Created ${payments.length} monthly fee payments for route "${route.name}" (${label})`);
  }
}

// ─────────────────────────────────────────────────────────────
// TRANSPORT VEHICLES
// ─────────────────────────────────────────────────────────────

export async function getVehicles(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin.from('transport_vehicles').select('*').eq('school_id', req.user!.school_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error) { return res.status(500).json({ error: 'Failed' }); }
}

export async function createVehicle(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin.from('transport_vehicles').insert({ ...req.body, school_id: req.user!.school_id }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error) { return res.status(500).json({ error: 'Failed' }); }
}

// ─────────────────────────────────────────────────────────────
// ROUTES — GET (with student counts)
// ─────────────────────────────────────────────────────────────

export async function getRoutes(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('transport_routes')
      .select('*, vehicle:transport_vehicles(*)')
      .eq('school_id', req.user!.school_id)
      .order('name');
    if (error) return res.status(400).json({ error: error.message });

    const routeIds = (data || []).map((r: any) => r.id);
    const counts: Record<string, number> = {};
    if (routeIds.length > 0) {
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('transport_route_id')
        .in('transport_route_id', routeIds);
      (students || []).forEach((s: any) => {
        counts[s.transport_route_id] = (counts[s.transport_route_id] || 0) + 1;
      });
    }
    const enriched = (data || []).map((r: any) => ({
      ...r,
      student_count: counts[r.id] || 0,
      // Normalize: monthly_fee -> fee_amount fallback for display
      monthly_fee: Number(r.monthly_fee ?? r.fee_amount ?? 0),
    }));
    return res.json(enriched);
  } catch (error) { return res.status(500).json({ error: 'Failed' }); }
}

// ─────────────────────────────────────────────────────────────
// ROUTES — CREATE
// Only requires columns that exist in the base schema (name, fee_amount, etc.)
// Tries to also set monthly_fee if the column exists.
// ─────────────────────────────────────────────────────────────

export async function createRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, description, monthly_fee, pickup_points, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'Route name is required' });

    // Prevent duplicate route names within the same school (case-insensitive)
    const normalizedName = String(name).trim();
    const { data: existingRoute } = await supabaseAdmin
      .from('transport_routes')
      .select('id, name')
      .eq('school_id', req.user!.school_id)
      .or(`name.ilike.${encodeURIComponent(normalizedName)},route_name.ilike.${encodeURIComponent(normalizedName)}`)
      .limit(1);
    if (existingRoute && existingRoute.length > 0) {
      return res.status(409).json({ error: `A transport route named "${existingRoute[0].name}" already exists. Please use a different name.` });
    }

    const monthlyAmount = Number(monthly_fee) || 0;

    // Base payload — columns that ALWAYS exist
    const basePayload: any = {
      school_id: req.user!.school_id,
      name: name.trim(),
      route_name: name.trim(),
      description: (description || '').trim() || null,
      fee_amount: monthlyAmount,
      pickup_points: (pickup_points || '').trim() || null,
      is_active: is_active !== false,
    };

    // Try to insert with new fee columns (needs migration run)
    const { data, error } = await supabaseAdmin
      .from('transport_routes')
      .insert({ ...basePayload, monthly_fee: monthlyAmount })
      .select()
      .single();

    if (error) {
      // If new column doesn't exist yet, fall back to base-only payload
      if (error.message?.includes('monthly_fee') || error.message?.includes('column')) {
        const { data: fallbackData, error: fallbackError } = await supabaseAdmin
          .from('transport_routes')
          .insert(basePayload)
          .select()
          .single();
        if (fallbackError) return res.status(400).json({ error: fallbackError.message });
        return res.status(201).json({ ...fallbackData, monthly_fee: monthlyAmount });
      }
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ ...data, monthly_fee: monthlyAmount });
  } catch (error: any) {
    console.error('[CREATE ROUTE] Error:', error);
    return res.status(500).json({ error: 'Failed to create route' });
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTES — UPDATE
// ─────────────────────────────────────────────────────────────

export async function updateRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, monthly_fee, pickup_points, is_active } = req.body;
    const monthlyAmount = Number(monthly_fee) || 0;

    // Prevent renaming to a name already used by another route in this school (case-insensitive)
    if (name && String(name).trim()) {
      const normalizedName = String(name).trim();
      const { data: existingRoute } = await supabaseAdmin
        .from('transport_routes')
        .select('id, name')
        .eq('school_id', req.user!.school_id)
        .or(`name.ilike.${encodeURIComponent(normalizedName)},route_name.ilike.${encodeURIComponent(normalizedName)}`)
        .neq('id', id)
        .limit(1);
      if (existingRoute && existingRoute.length > 0) {
        return res.status(409).json({ error: `A transport route named "${existingRoute[0].name}" already exists. Please use a different name.` });
      }
    }

    const baseUpdate: any = {
      name: name?.trim(),
      route_name: name?.trim(),
      description: description?.trim() || null,
      fee_amount: monthlyAmount,
      pickup_points: pickup_points?.trim() || null,
      is_active: is_active !== false,
    };

    // Try with monthly_fee column
    const { data, error } = await supabaseAdmin
      .from('transport_routes')
      .update({ ...baseUpdate, monthly_fee: monthlyAmount })
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) {
      if (error.message?.includes('monthly_fee') || error.message?.includes('column')) {
        const { data: fallbackData, error: fallbackError } = await supabaseAdmin
          .from('transport_routes')
          .update(baseUpdate)
          .eq('id', id)
          .eq('school_id', req.user!.school_id)
          .select()
          .single();
        if (fallbackError) return res.status(400).json({ error: fallbackError.message });
        return res.json({ ...fallbackData, monthly_fee: monthlyAmount });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ...data, monthly_fee: monthlyAmount });
  } catch (error: any) {
    console.error('[UPDATE ROUTE] Error:', error);
    return res.status(500).json({ error: 'Failed to update route' });
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTE STUDENTS — GET
// ─────────────────────────────────────────────────────────────

export async function getRouteStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const school_id = req.user!.school_id;
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id, admission_number, transport_route_id, user:users(first_name, last_name), section:sections(name, class:classes(name))')
      .eq('school_id', school_id)
      .eq('transport_route_id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (error) { return res.status(500).json({ error: 'Failed to get route students' }); }
}

// ─────────────────────────────────────────────────────────────
// UNASSIGNED STUDENTS — GET (with class/section filter)
// ─────────────────────────────────────────────────────────────

export async function getUnassignedStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const school_id = req.user!.school_id;
    const { class_id, section_id } = req.query;

    let sectionIds: string[] | null = null;
    if (!section_id && class_id) {
      const { data: secs } = await supabaseAdmin.from('sections').select('id').eq('class_id', class_id as string);
      sectionIds = secs?.map((s: any) => s.id) || [];
      if (sectionIds.length === 0) return res.json([]);
    }

    let query = supabaseAdmin
      .from('students')
      .select('id, admission_number, transport_route_id, user:users(first_name, last_name), section:sections(name, class:classes(id, name))')
      .eq('school_id', school_id)
      .eq('is_active', true)
      .is('transport_route_id', null);

    if (section_id) query = query.eq('section_id', section_id as string);
    else if (sectionIds) query = query.in('section_id', sectionIds);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (error) { return res.status(500).json({ error: 'Failed to get unassigned students' }); }
}

// ─────────────────────────────────────────────────────────────
// BULK ASSIGN STUDENTS TO ROUTE
// After assigning, immediately generates current month's fee dues
// ─────────────────────────────────────────────────────────────

export async function bulkAssignStudentsToRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentIds, routeId, pushImmediately } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No student IDs provided' });
    }

    const schoolId = req.user!.school_id;
    const todayDay = new Date().getDate();
    const willPushFees = routeId && (todayDay <= 5 || pushImmediately === true);

    // Verify the route belongs to this school
    if (routeId) {
      const { data: route, error: routeError } = await supabaseAdmin
        .from('transport_routes')
        .select('id')
        .eq('id', routeId)
        .eq('school_id', schoolId)
        .maybeSingle();
      if (routeError) return res.status(400).json({ error: routeError.message });
      if (!route) return res.status(404).json({ error: 'Transport route not found' });
    }

    // Update students
    const { error: updateError } = await supabaseAdmin
      .from('students')
      .update({ transport_route_id: routeId ?? null })
      .in('id', studentIds)
      .eq('school_id', schoolId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    // Generate current-month fee dues (respects date-5 rule)
    if (routeId) {
      setImmediate(() => assignCurrentMonthlyRouteFees(schoolId, routeId, studentIds, pushImmediately === true));
    }

    const message = willPushFees
      ? `${studentIds.length} student(s) assigned and current month transport fee generated.`
      : `${studentIds.length} student(s) assigned. Current month fees will be generated at the start of next month.`;

    return res.json({ message, count: studentIds.length, feesGenerated: willPushFees });
  } catch (error: any) {
    console.error('[BULK ASSIGN] Error:', error);
    return res.status(500).json({ error: 'Failed to bulk assign students' });
  }
}

// ─────────────────────────────────────────────────────────────
// LEGACY: single assign
// ─────────────────────────────────────────────────────────────

export async function assignStudentToRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, routeId, pushImmediately } = req.body;
    const { error } = await supabaseAdmin
      .from('students')
      .update({ transport_route_id: routeId || null })
      .eq('id', studentId)
      .eq('school_id', req.user!.school_id);
    if (error) return res.status(400).json({ error: error.message });
    if (routeId) setImmediate(() => assignCurrentMonthlyRouteFees(req.user!.school_id, routeId, [studentId], pushImmediately === true));
    return res.json({ message: 'Success' });
  } catch (error) { return res.status(500).json({ error: 'Failed' }); }
}

// ─────────────────────────────────────────────────────────────
// TRANSPORT DASHBOARD
// ─────────────────────────────────────────────────────────────

export async function getTransportDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const school_id = req.user!.school_id;
    const { data: vehicles } = await supabaseAdmin.from('transport_vehicles').select('*').eq('school_id', school_id);
    const { data: routes } = await supabaseAdmin.from('transport_routes').select('*, vehicle:transport_vehicles(driver_name)').eq('school_id', school_id);
    const { count: studentCount } = await supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('school_id', school_id).not('transport_route_id', 'is', null);

    return res.json({
      stats: {
        totalVehicles: vehicles?.length || 0,
        activeRoutes: routes?.length || 0,
        assignedStudents: studentCount || 0,
        operationalStatus: '100%'
      },
      vehicles: vehicles || [],
      routes: routes || []
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE ROUTE
// ─────────────────────────────────────────────────────────────

export async function deleteTransportRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('transport_routes').delete().eq('id', id).eq('school_id', req.user!.school_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Route deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete route' });
  }
}

export async function getLiveTracking(req: AuthenticatedRequest, res: Response) {
  return res.json({
    lat: 28.6139 + (Math.random() - 0.5) * 0.01,
    lng: 77.2090 + (Math.random() - 0.5) * 0.01,
    speed: 40,
    lastUpdated: new Date().toISOString()
  });
}

export async function getBusAbsentees(req: AuthenticatedRequest, res: Response) {
  return res.json({ absentees: [] });
}

export async function updateLocation(req: AuthenticatedRequest, res: Response) {
  return res.json({ success: true });
}
