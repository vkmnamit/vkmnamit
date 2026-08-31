/**
 * Calculates the percentage of an obtained score relative to a maximum score.
 * Handles division by zero and optional rounding to decimal places.
 */
export function calculatePercentage(obtained: number, max: number, decimals: number = 0): number {
  if (!max || max <= 0) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(((obtained / max) * 100) * factor) / factor;
}
