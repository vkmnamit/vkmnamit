/** Normalize phone to digits only for comparison */
export function normalizePhone(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

/** Check if search term matches phone (partial digit match) */
export function phoneMatches(phone: string | undefined | null, search: string): boolean {
  const normalizedSearch = normalizePhone(search);
  if (!normalizedSearch) return false;
  const normalizedPhone = normalizePhone(phone);
  return normalizedPhone.includes(normalizedSearch);
}

export function textIncludes(value: string | undefined | null, search: string): boolean {
  return (value || '').toLowerCase().includes(search.toLowerCase());
}
