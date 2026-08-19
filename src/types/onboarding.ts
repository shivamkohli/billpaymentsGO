/**
 * Merchant onboarding / bill-payment-offer configurator.
 *
 * Distinct from `types/merchant.ts` (the BBPS partner REST API merchants
 * integrate against once live) — this is the one-time setup flow a
 * Razorpay merchant fills in from *inside the dashboard* to describe their
 * business and let us curate which billers/categories + which integration
 * shape (standalone app vs. embedded section) applies to them. In a real
 * build this would sit behind dashboard session auth, not the BBPS
 * `RZP_BILLPAY_KEY_ID`/`SECRET` Basic Auth used elsewhere in this repo.
 */

export type IntegrationMode = "new_app" | "existing_app_section";

export interface ExistingAppIntegrationDetails {
  /** Generic custom-URI-scheme deep link, e.g. "myapp://billpay". */
  deep_link?: string;
  /** iOS Universal Link, e.g. "https://myapp.com/billpay". */
  ios_universal_link?: string;
  /** Android App Link, e.g. "https://myapp.com/billpay" (verified via assetlinks.json). */
  android_app_link?: string;
  /** Android application id, e.g. "com.mybank.app". */
  android_package_name?: string;
  /** iOS bundle identifier, e.g. "com.mybank.app". */
  ios_bundle_id?: string;
}

export interface MerchantBranding {
  logo_url?: string;
  /** Hex color, e.g. "#0f6fde". */
  brand_color?: string;
}

/**
 * Optional design-system inputs so the embedded bill-payment UI can match a
 * merchant's existing app's native look and feel, rather than looking like
 * a bolted-on widget. All free-text/optional — there's no fixed schema for
 * "describe your design system," so we capture what's given and let the
 * design team follow up for anything under-specified.
 */
export interface DesignSystemPreferences {
  /** e.g. "Material 3", "Human Interface Guidelines", "in-house Blade-based DS". */
  design_system_name?: string;
  /** Free-form list of hex codes, e.g. ["#0f6fde", "#ffffff", "#1a1a1a"]. */
  color_hex_codes?: string[];
  /** e.g. "Primary font: Inter, weights 400/600/700". */
  typography_guidelines?: string;
  /** e.g. "Rounded 8px corners, solid fill, 44px height, white label text". */
  primary_button_style?: string;
  /** e.g. "Material UI, Tailwind, in-house component library". */
  component_libraries?: string;
}

export type EntryPointLabel = "Pay Bills" | "Bharat Connect" | "Other";

export type EntryPointPlacement =
  | "home_dashboard_button"
  | "quick_action_shortcut"
  | "services_subsection"
  | "other";

/**
 * Where/how the merchant wants the bill-payment entry point surfaced inside
 * their app, and under what label. Both optional — if unset, we default to
 * proposing a home-dashboard "Pay Bills" button during design review.
 */
export interface EntryPointPreferences {
  label?: EntryPointLabel;
  /** Required detail when label === "Other". */
  label_other?: string;
  placement?: EntryPointPlacement;
  /** Required detail when placement === "other". */
  placement_other?: string;
}

export interface MerchantOnboardingCreateInput {
  business_description: string;
  /** Category keys from `mapping/billCategories.ts` (`BBPS_CATEGORY_OPTIONS`). Multi-select. */
  categories: string[];
  integration_mode: IntegrationMode;
  existing_app?: ExistingAppIntegrationDetails;
  estimated_user_base?: number;
  design_system?: DesignSystemPreferences;
  entry_point?: EntryPointPreferences;
  /** Merchant logo + BBPS/Bharat Connect logo shown together on the digital confirmation/receipt screen. */
  receipt_co_branding?: boolean;
  /** Website the merchant used with "Autofill from website" — set only when that path was used. */
  source_url?: string;
  /** Rough, low-confidence scale signals derived from the website scrape — see `websiteScraperService.ts`. */
  estimated_scale?: EstimatedScaleSignals;
}

/**
 * Coarse, non-authoritative size signal used only because there is no
 * reliable public data source for an arbitrary merchant's real customer
 * count / app downloads / GMV. Always surfaced to the merchant as
 * "estimated" and always carries `basis` so it's clear this is a guess
 * derived from a handful of page signals, not a real number — see
 * `websiteScraperService.ts` for how it's computed.
 */
export type ScaleTier = "unknown" | "small" | "medium" | "large" | "enterprise";

export interface ScaleEstimate {
  tier: ScaleTier;
  /** Human-readable, always includes an "(estimated)" qualifier — see websiteScraperService.ts. */
  label: string;
  /** The specific signals that drove this tier, e.g. "Found both App Store and Play Store links". Empty when tier is "unknown". */
  basis: string[];
}

export interface EstimatedScaleSignals {
  customers: ScaleEstimate;
  app_downloads: ScaleEstimate;
  gmv: ScaleEstimate;
}

/**
 * A bill-payment category (key from `mapping/billCategories.ts`) suggested
 * for pre-selection, plus the literal evidence for it — so "we picked this
 * for you" is always checkable, not a black box. See
 * `websiteScraperService.ts#inferCategories`.
 */
export interface CategorySuggestion {
  category: string;
  reason: string;
}

/** Result of scraping a merchant's website — feeds the onboarding form's autofill, never submitted verbatim without the merchant seeing/editing it first. */
export interface WebsiteScrapeResult {
  source_url: string;
  brand_name?: string;
  logo_url?: string;
  /** Hex color, e.g. "#0f6fde". */
  brand_color?: string;
  business_description?: string;
  estimated_scale: EstimatedScaleSignals;
  /** Bill-payment categories worth pre-selecting, each with the evidence that suggested it. Merchant can freely add/remove. */
  suggested_categories: CategorySuggestion[];
  /** Non-fatal issues encountered while scraping (e.g. "Could not fetch favicon"), surfaced to the merchant for transparency. */
  warnings: string[];
}

export type CategoryCoverageStatus = "live_sample_billers" | "coming_soon";

export interface CategoryCoverage {
  category: string;
  status: CategoryCoverageStatus;
  sample_biller_count: number;
  sample_biller_ids: string[];
}

export interface CuratedOfferingPreview {
  categories: CategoryCoverage[];
  total_categories_requested: number;
  categories_with_live_coverage: number;
  recommended_next_step: string;
}

/**
 * "NR (Net Revenue) potential" projection shown on the onboarding results
 * screen, below branding — see `orchestration/nrPotentialService.ts` for
 * the full model and `mapping/npciCategoryStats.ts` for the sourced
 * reference data it runs on. Chain: merchant active users -> category
 * adoption (penetration x 12-month ramp) -> monthly transacting users ->
 * transactions -> GMV -> NR (0.3% of GMV).
 */
export interface NrPotentialMonthProjection {
  /** 1-12, month 1 = first month live. */
  month: number;
  /** Effective % of the category's potential users activated by this month, for this scenario (0-100). */
  ramp_pct: number;
  users: number;
  transactions: number;
  value: number;
}

export interface NrPotentialCategoryProjection {
  category: string;
  label: string;
  npci_monthly_value_cr: number;
  npci_monthly_volume_mn: number;
  npci_as_of: string;
  avg_transaction_value: number;
  industry_category_mau_mn: number;
  mau_basis: string;
  /** industry_category_mau_mn / industry overall digital MAU, capped at 1. */
  category_penetration: number;
  industry_transactions_per_user_per_month: number;
  /** Steady-state ceiling for this scenario: merchant_active_users x penetration x affinity_factor. */
  merchant_category_mau_potential: number;
  months: NrPotentialMonthProjection[];
  fy1_totals: {
    exit_month_users: number;
    transactions: number;
    value: number;
  };
}

export type NrPotentialScenarioKey = "conservative" | "base" | "upside";

export interface NrPotentialScenarioResult {
  scenario: NrPotentialScenarioKey;
  label: string;
  ramp_multiplier: number;
  affinity_factor: number;
  year1_active_users: number;
  year1_transactions: number;
  year1_gmv: number;
  exit_monthly_gmv: number;
  year1_nr: number;
  exit_monthly_nr: number;
  categories: NrPotentialCategoryProjection[];
}

export interface NrPotentialResult {
  entity: "bill_payment.nr_potential";
  merchant_onboarding_id: string;
  /** false when there isn't enough input (no estimated_user_base, or no categories) to project anything. */
  available: boolean;
  message?: string;
  merchant_active_users?: number;
  industry_overall_digital_mau_mn: number;
  industry_overall_digital_mau_basis: string;
  ramp_curve_pct: number[];
  nr_rate_of_gmv: number;
  scenarios?: Record<NrPotentialScenarioKey, NrPotentialScenarioResult>;
  notes: string[];
}

export interface MerchantOnboardingResource {
  id: string;
  entity: "bill_payment.merchant_onboarding";
  business_description: string;
  categories: string[];
  integration_mode: IntegrationMode;
  existing_app?: ExistingAppIntegrationDetails;
  estimated_user_base?: number;
  design_system?: DesignSystemPreferences;
  entry_point?: EntryPointPreferences;
  receipt_co_branding?: boolean;
  source_url?: string;
  estimated_scale?: EstimatedScaleSignals;
  branding: MerchantBranding;
  curated_offering: CuratedOfferingPreview;
  created_at: number;
  updated_at?: number;
}
