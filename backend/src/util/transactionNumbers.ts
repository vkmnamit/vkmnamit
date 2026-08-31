import { SupabaseClient } from '@supabase/supabase-js';

// ════════════════════════════════════════════════════════════════════════
// Transaction number scheme: {SCHOOL_SHORT}{YY}{MONTH}{SERIAL}
//   e.g. Gyananda Nation Academy, August 2026, 1st receipt => "GNA2681"
//
// The primary path is the DB RPC `generate_receipt_number` / `generate_bill_number`
// (defined in backend/migrations/receipt_number_scheme.sql) which is
// concurrency-safe and resets the serial every month. This module also ships a
// fallback that reproduces the exact same format from scratch so receipts/bills
// keep a consistent look even if the RPC isn't deployed yet.
// ════════════════════════════════════════════════════════════════════════

/** Derive a short name from the school name, e.g. "Gyananda Nation Academy" -> "GNA". */
export function shortNameFromSchoolName(name?: string | null): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'SCH';

  let initials = '';
  for (const word of cleaned.split(/[\s\-]+/)) {
    if (!word) continue;
    const first = word[0];
    if (first && /[a-zA-Z0-9]/.test(first)) {
      initials += first.toUpperCase();
      if (initials.length >= 4) break;
    }
  }

  if (initials) return initials;
  return cleaned.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'SCH';
}

/** Current period: last-two-digit year + non-padded month (Aug -> "8"). */
function periodParts() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const month = String(d.getMonth() + 1); // no leading zero
  return { yy, month };
}

interface NumberContext {
  /** RPC function name, e.g. 'generate_receipt_number'. */
  rpc: string;
  /** Table that stores the numbers (fallback count source). */
  table: 'fee_payments' | 'school_expenses';
  /** Column that stores the numbers (fallback count source). */
  column: 'receipt_number' | 'bill_number';
}

async function generateTransactionNumber(
  supabase: SupabaseClient,
  schoolId: string,
  ctx: NumberContext
): Promise<string> {
  // Primary: DB RPC (per-school / per-month serial, race-safe).
  try {
    const { data } = await supabase.rpc(ctx.rpc, { p_school_id: schoolId });
    if (data) return data as string;
  } catch (err) {
    console.warn(`[transactionNumbers] RPC ${ctx.rpc} failed, using fallback:`, (err as Error)?.message);
  }

  // Fallback: build {SHORT}{YY}{MONTH}{SERIAL} by counting existing numbers
  // for this school in the current month. Fully guarded so number creation
  // never breaks even before the DB migration is applied.
  const { yy, month } = periodParts();
  let prefix = 'SCH';
  try {
    const { data: school } = await supabase
      .from('schools')
      .select('name, short_name')
      .eq('id', schoolId)
      .maybeSingle();
    prefix = shortNameFromSchoolName(
      (school as any)?.short_name || (school as any)?.name
    );
  } catch (err) {
    console.warn(`[transactionNumbers] School fetch failed:`, (err as Error)?.message);
  }

  // If the target table doesn't have the number column yet (migration not run),
  // fall back to a small random serial so bill/receipt creation never breaks.
  try {
    const like = `${prefix}${yy}${month}%`;
    const { count } = await supabase
      .from(ctx.table)
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .like(ctx.column, like);
    return `${prefix}${yy}${month}${(count || 0) + 1}`;
  } catch (err) {
    console.warn(`[transactionNumbers] Fallback count failed:`, (err as Error)?.message);
    return `${prefix}${yy}${month}${Math.floor(100 + Math.random() * 900)}`;
  }
}

/** Fee receipt number in {SHORT}{YY}{MONTH}{SERIAL} format. */
export function generateReceiptNumber(supabase: SupabaseClient, schoolId: string): Promise<string> {
  return generateTransactionNumber(supabase, schoolId, {
    rpc: 'generate_receipt_number',
    table: 'fee_payments',
    column: 'receipt_number',
  });
}

/** Expense bill number in {SHORT}{YY}{MONTH}{SERIAL} format. */
export function generateBillNumber(supabase: SupabaseClient, schoolId: string): Promise<string> {
  return generateTransactionNumber(supabase, schoolId, {
    rpc: 'generate_bill_number',
    table: 'school_expenses',
    column: 'bill_number',
  });
}