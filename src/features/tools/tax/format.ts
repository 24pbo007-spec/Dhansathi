export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Compact Indian notation: ₹12.5 L, ₹1.2 Cr. */
export function inrShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 1 : 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}
