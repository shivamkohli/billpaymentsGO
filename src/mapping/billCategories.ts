/**
 * Curated, illustrative list of standard BBPS biller categories, used to
 * drive the merchant-onboarding category multi-select (`public/onboarding.html`
 * -> `GET /v1/merchant_onboarding/categories`).
 *
 * This is intentionally broader than `billerRegistry.ts`'s 4 sample
 * billers — a merchant should be able to say "we want electricity + tax
 * payment + water" even though we've only mocked one sample biller per
 * category so far. `merchantOnboardingService.ts` is explicit about which
 * categories currently have sample billers behind them vs. which are
 * "coming soon" placeholders, so the onboarding flow never pretends to
 * have real biller coverage it doesn't.
 *
 * This list is NOT a verbatim reproduction of NPCI's official category
 * taxonomy (which runs to ~20+ entries and is revised periodically) — it's
 * a representative sample covering the categories a fintech/SFB merchant
 * would plausibly ask for.
 */
export interface BillCategoryOption {
  key: string;
  label: string;
}

export const BBPS_CATEGORY_OPTIONS: BillCategoryOption[] = [
  { key: "Electricity", label: "Electricity" },
  { key: "Water", label: "Water" },
  { key: "Gas", label: "Piped Gas" },
  { key: "LPG Gas", label: "LPG Gas Booking" },
  { key: "DTH", label: "DTH / Cable TV" },
  { key: "Mobile Postpaid", label: "Mobile Postpaid" },
  { key: "Mobile Prepaid", label: "Mobile Prepaid Recharge" },
  { key: "Broadband", label: "Broadband / Landline" },
  { key: "Credit Card", label: "Credit Card Bill Payment" },
  { key: "Loan Repayment", label: "Loan EMI / Repayment" },
  { key: "Insurance", label: "Insurance Premium" },
  { key: "Tax Payment", label: "Municipal Tax / Tax Payment" },
  { key: "Housing Society", label: "Housing Society Dues" },
  { key: "Education Fees", label: "Education Fees" },
  { key: "Subscription Fees", label: "Subscription Fees" },
  { key: "Club and Association", label: "Club & Association Dues" },
  { key: "Hospital", label: "Hospital & Healthcare" },
  { key: "NCC", label: "NCC Bill Payment" },
  { key: "Recurring Deposit", label: "Recurring Deposit" },
  { key: "FASTag", label: "FASTag Recharge" },
];

export function listBillCategoryOptions(): BillCategoryOption[] {
  return BBPS_CATEGORY_OPTIONS;
}
