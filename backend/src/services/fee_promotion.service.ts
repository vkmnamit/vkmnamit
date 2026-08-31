/**
 * FEE PROMOTION SERVICE
 * ─────────────────────
 * Runs automatically when students are promoted to a new academic year
 * (both paths: manual rollover modal + switch-year auto-rollover).
 *
 * WHY IT DELEGATES TO generateFeesForMonth():
 * The monthly cron (1st of every month) bills every structure with a
 * month-labeled title ("Tuition Fee - Aug 2026") and its dedup only
 * recognizes month-labeled rows. Pushing unlabeled full-year rows here
 * would DOUBLE-BILL promoted students.
 *
 * So promotion-time billing generates the CURRENT month via the central
 * generator:
 *   - same dedup as the cron (students already billed this month are skipped)
 *   - fees are derived from the student's NEW class (post-promotion section)
 *   - exemptions + recurring discounts honoured
 *   - from the 1st of the next month the cron takes over automatically
 */

import { generateFeesForMonth } from './fee_generation.service';

export interface PromotionFeesResult {
    generated: number;
    skipped: number;
    monthLabel: string;
}

export async function generateFeesForAcademicYear(
    schoolId: string,
    academicYearId: string,
    _userId?: string
): Promise<PromotionFeesResult> {
    // Bill the current (real-world) month. Students already billed this
    // month — e.g. under their old class before promotion — are skipped
    // by the shared month-label dedup, so nothing can double-bill.
    const result = await generateFeesForMonth({ schoolId });
    console.log(`[FEE-PROMOTION] school=${schoolId} year=${academicYearId} month=${result.monthLabel}: generated=${result.generated}, skipped=${result.skipped}`);
    return {
        generated: result.generated,
        skipped: result.skipped,
        monthLabel: result.monthLabel,
    };
}
