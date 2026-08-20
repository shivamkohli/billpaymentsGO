/**
 * TS types mirroring the backend contract at
 * `../src/types/onboarding.ts` and the `/v1/merchant_onboarding/*` routes.
 * Kept in sync by hand — this app has no build-time link to the Express
 * source tree, so if the backend contract changes, update both.
 */

export type IntegrationMode = 'new_app' | 'existing_app_section';

export interface ExistingAppIntegrationDetails {
  deep_link?: string;
  ios_universal_link?: string;
  android_app_link?: string;
  android_package_name?: string;
  ios_bundle_id?: string;
}

export interface DesignSystemPreferences {
  design_system_name?: string;
  color_hex_codes?: string[];
  typography_guidelines?: string;
  primary_button_style?: string;
  component_libraries?: string;
}

export type EntryPointLabel = 'Pay Bills' | 'Bharat Connect' | 'Other';

export type EntryPointPlacement =
  | 'home_dashboard_button'
  | 'quick_action_shortcut'
  | 'services_subsection'
  | 'other';

export interface EntryPointPreferences {
  label?: EntryPointLabel;
  label_other?: string;
  placement?: EntryPointPlacement;
  placement_other?: string;
}

export type ScaleTier = 'unknown' | 'small' | 'medium' | 'large' | 'enterprise';

export interface ScaleEstimate {
  tier: ScaleTier;
  label: string;
  basis: string[];
}

export interface EstimatedScaleSignals {
  customers: ScaleEstimate;
  app_downloads: ScaleEstimate;
  gmv: ScaleEstimate;
}

export interface CategorySuggestion {
  category: string;
  reason: string;
}

export interface WebsiteScrapeResult {
  source_url: string;
  brand_name?: string;
  logo_url?: string;
  brand_color?: string;
  business_description?: string;
  estimated_scale: EstimatedScaleSignals;
  suggested_categories: CategorySuggestion[];
  warnings: string[];
}

export type CategoryCoverageStatus = 'live' | 'coming_soon';

/** Where `biller_ids` actually came from — the real production BBPS catalog, or the local mock/sample registry. */
export type BillerCatalogSource = 'production' | 'sample';

export interface CategoryCoverage {
  category: string;
  status: CategoryCoverageStatus;
  catalog_source: BillerCatalogSource;
  biller_count: number;
  biller_ids: string[];
}

export interface CuratedOfferingPreview {
  categories: CategoryCoverage[];
  total_categories_requested: number;
  categories_with_live_coverage: number;
  recommended_next_step: string;
}

export interface NrPotentialMonthProjection {
  month: number;
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
  category_penetration: number;
  industry_transactions_per_user_per_month: number;
  merchant_category_mau_potential: number;
  months: NrPotentialMonthProjection[];
  fy1_totals: {
    exit_month_users: number;
    transactions: number;
    value: number;
  };
}

export type NrPotentialScenarioKey = 'conservative' | 'base' | 'upside';

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
  entity: 'bill_payment.nr_potential';
  merchant_onboarding_id: string;
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

export interface MerchantBranding {
  logo_url?: string;
  brand_color?: string;
  business_name?: string;
}

export interface MerchantOnboardingResource {
  id: string;
  entity: 'bill_payment.merchant_onboarding';
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

export interface BillCategoryOption {
  key: string;
  label: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
  };
}

/** Client-side form state for the whole wizard, pre-submission. */
export interface OnboardingFormState {
  businessDescription: string;
  /** Company/brand display name shown in the bill-payment widget header (e.g. "Cred"). Pre-filled from `WebsiteScrapeResult.brand_name` on autofill, editable. */
  businessName: string;
  estimatedUserBase: string;
  categories: string[];
  logoFile: File | null;
  logoPreviewUrl: string | null;
  brandColor: string;
  integrationMode: IntegrationMode | null;
  existingApp: ExistingAppIntegrationDetails;
  designSystem: DesignSystemPreferences;
  entryPointLabel: EntryPointLabel | null;
  entryPointLabelOther: string;
  entryPointPlacement: EntryPointPlacement | null;
  entryPointPlacementOther: string;
  receiptCoBranding: boolean | null;
  sourceUrl: string | null;
  estimatedScale: EstimatedScaleSignals | null;
}

export const EMPTY_FORM_STATE: OnboardingFormState = {
  businessDescription: '',
  businessName: '',
  estimatedUserBase: '',
  categories: [],
  logoFile: null,
  logoPreviewUrl: null,
  brandColor: '#0f6fde',
  integrationMode: null,
  existingApp: {},
  designSystem: {},
  entryPointLabel: null,
  entryPointLabelOther: '',
  entryPointPlacement: null,
  entryPointPlacementOther: '',
  receiptCoBranding: null,
  sourceUrl: null,
  estimatedScale: null,
};
