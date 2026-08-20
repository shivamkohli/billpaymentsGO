/**
 * Rounded, Indian-shorthand number formatting for the NR-potential
 * infographic — ported 1:1 from the original `public/onboarding.html`.
 * Precision beyond this (e.g. "19,55,629" or "₹2,383.99 Cr") is false
 * confidence for numbers that are themselves rough projections, so
 * everything here rounds to one decimal at most and abbreviates
 * lakhs/crores like a headline figure.
 */

function trimOneDecimal(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export function fmtAbbrev(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (abs >= 1e7) return sign + trimOneDecimal(abs / 1e7) + ' Cr';
  if (abs >= 1e5) return sign + trimOneDecimal(abs / 1e5) + ' L';
  if (abs >= 1e3) return sign + trimOneDecimal(abs / 1e3) + ' K';
  return sign + abs.toLocaleString('en-IN');
}

export function fmtCount(n: number): string {
  return fmtAbbrev(n);
}

export function fmtRupees(rupees: number): string {
  return '₹' + fmtAbbrev(rupees);
}

export function fmtCrValue(crores: number): string {
  const abs = Math.abs(crores);
  let val: string;
  if (abs >= 100) val = Math.round(crores).toLocaleString('en-IN');
  else if (abs >= 1) val = trimOneDecimal(crores);
  else val = (Math.round(crores * 100) / 100).toString();
  return '₹' + val + ' Cr';
}

export function fmtCr(rupees: number): string {
  return fmtCrValue(rupees / 1e7);
}

/** Best-effort visual accent per category — purely decorative, no bearing on the numbers. */
export const CATEGORY_ICONS: Record<string, string> = {
  Electricity: '⚡',
  Water: '💧',
  Gas: '🔥',
  'LPG Gas': '🛢️',
  DTH: '📺',
  'Mobile Postpaid': '📱',
  'Mobile Prepaid': '📱',
  Broadband: '🌐',
  'Credit Card': '💳',
  'Loan Repayment': '🏦',
  Insurance: '🛡️',
  'Tax Payment': '🏛️',
  'Housing Society': '🏢',
  'Education Fees': '🎓',
  'Subscription Fees': '🔔',
  'Club and Association': '🎟️',
  Hospital: '🏥',
  NCC: '📄',
  'Recurring Deposit': '📈',
  FASTag: '🚗',
};

/**
 * The "customers" tier is a coarse bucket (see websiteScraperService.ts),
 * not a real number — this is just a representative midpoint per bucket so
 * the numeric field isn't left empty. Always overridable, and always
 * flagged as a rough estimate right under the field.
 */
export const TIER_TO_USER_BASE: Record<string, number> = {
  small: 10000,
  medium: 250000,
  large: 2000000,
  enterprise: 10000000,
};
