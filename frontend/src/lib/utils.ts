import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * High-fidelity utility for merging Tailwind CSS classes.
 * Ensures that overlapping classes are handled correctly.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculatePercentage(obtained: number, max: number, decimals: number = 0): number {
  if (!max || max <= 0) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(((obtained / max) * 100) * factor) / factor;
}
