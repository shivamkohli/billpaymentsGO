import { useEffect, useState } from 'react';
import { Box, Alert, Button } from '@razorpay/blade/components';
import type { BladeFileList } from '@razorpay/blade/components';
import { TopBar, BackLinks, PageHeading } from './components/TopBar';
import { AutofillSection } from './components/AutofillSection';
import { BusinessSection } from './components/BusinessSection';
import { CategoriesSection } from './components/CategoriesSection';
import { BrandingSection } from './components/BrandingSection';
import { IntegrationModeSection } from './components/IntegrationModeSection';
import { DesignSystemSection } from './components/DesignSystemSection';
import { EntryPointSection } from './components/EntryPointSection';
import { CuratedOfferingCard } from './components/CuratedOfferingCard';
import { PreferencesSummaryCard } from './components/PreferencesSummaryCard';
import { NrPotentialCard } from './components/NrPotentialCard';
import { PreviewLinkCard } from './components/PreviewLinkCard';
import { fetchCategories, scrapeWebsite, submitOnboarding } from './api';
import { TIER_TO_USER_BASE } from './format';
import { EMPTY_FORM_STATE } from './types';
import type {
  BillCategoryOption,
  MerchantOnboardingResource,
  OnboardingFormState,
  WebsiteScrapeResult,
} from './types';

const INITIAL_FORM_STATE: OnboardingFormState = { ...EMPTY_FORM_STATE, integrationMode: 'new_app' };

function App(): React.ReactElement {
  const [categories, setCategories] = useState<BillCategoryOption[]>([]);
  const [form, setForm] = useState<OnboardingFormState>(INITIAL_FORM_STATE);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [colorHexCodesRaw, setColorHexCodesRaw] = useState('');
  const [logoFileList, setLogoFileList] = useState<BladeFileList>([]);
  const [estimatedUserBaseHint, setEstimatedUserBaseHint] = useState<string | null>(null);

  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofillResult, setAutofillResult] = useState<WebsiteScrapeResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resource, setResource] = useState<MerchantOnboardingResource | null>(null);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  function patchForm(patch: Partial<OnboardingFormState>): void {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleAutofill(): Promise<void> {
    setAutofillError(null);
    const url = websiteUrl.trim();
    if (!url) {
      setAutofillError('Enter a website URL first.');
      return;
    }

    setIsAutofilling(true);
    try {
      const json = await scrapeWebsite(url);
      setAutofillResult(json);

      // Prefill — never destroys anything the merchant already typed by hand, only fills blanks.
      const nextCategories = new Set(form.categories);
      json.suggested_categories.forEach((s) => nextCategories.add(s.category));

      patchForm({
        businessDescription: form.businessDescription.trim()
          ? form.businessDescription
          : json.business_description || form.businessDescription,
        businessName: form.businessName.trim() ? form.businessName : json.brand_name || form.businessName,
        brandColor: json.brand_color || form.brandColor,
        logoPreviewUrl: json.logo_url || form.logoPreviewUrl,
        sourceUrl: json.source_url,
        estimatedScale: json.estimated_scale,
        categories: Array.from(nextCategories),
      });

      const customersEstimate = json.estimated_scale?.customers;
      if (customersEstimate && customersEstimate.tier !== 'unknown' && customersEstimate.tier in TIER_TO_USER_BASE) {
        if (!form.estimatedUserBase.trim()) {
          patchForm({ estimatedUserBase: String(TIER_TO_USER_BASE[customersEstimate.tier]) });
        }
        setEstimatedUserBaseHint(
          `Prefilled from website signals (${customersEstimate.label}) — this is a rough estimate, edit it if you know the real number.`,
        );
      } else {
        setEstimatedUserBaseHint(null);
      }
    } catch (err) {
      setAutofillError(err instanceof Error ? err.message : 'Could not fetch that website.');
    } finally {
      setIsAutofilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitError(null);

    if (!form.businessDescription.trim()) {
      setSubmitError('Please describe your business in one line.');
      return;
    }
    if (form.categories.length === 0) {
      setSubmitError('Select at least one bill-payment category.');
      return;
    }

    const mode = form.integrationMode ?? 'new_app';

    if (mode === 'existing_app_section') {
      const hasAnyDesignSystemField = Boolean(
        (form.designSystem.design_system_name ?? '').trim() ||
          colorHexCodesRaw.trim() ||
          (form.designSystem.typography_guidelines ?? '').trim() ||
          (form.designSystem.primary_button_style ?? '').trim() ||
          (form.designSystem.component_libraries ?? '').trim(),
      );
      if (!hasAnyDesignSystemField) {
        setSubmitError(
          'Since you\'re embedding within your existing app, fill in at least one field under "5. Match your app\'s look & feel".',
        );
        return;
      }
    }

    const fd = new FormData();
    fd.append('business_description', form.businessDescription.trim());
    form.categories.forEach((c) => fd.append('categories', c));
    fd.append('integration_mode', mode);
    if (form.estimatedUserBase) fd.append('estimated_user_base', form.estimatedUserBase);
    fd.append('brand_color', form.brandColor);
    if (form.businessName.trim()) fd.append('business_name', form.businessName.trim());

    const uploadedLogo = logoFileList[0];
    if (uploadedLogo) {
      fd.append('logo', uploadedLogo);
    } else if (form.logoPreviewUrl) {
      fd.append('logo_url', form.logoPreviewUrl);
    }
    if (form.sourceUrl) fd.append('source_url', form.sourceUrl);
    if (form.estimatedScale) fd.append('estimated_scale', JSON.stringify(form.estimatedScale));

    if (mode === 'existing_app_section') {
      fd.append('deep_link', form.existingApp.deep_link ?? '');
      fd.append('ios_universal_link', form.existingApp.ios_universal_link ?? '');
      fd.append('android_app_link', form.existingApp.android_app_link ?? '');
      fd.append('android_package_name', form.existingApp.android_package_name ?? '');
      fd.append('ios_bundle_id', form.existingApp.ios_bundle_id ?? '');
    }

    // Design system (optional for a new standalone app; required — enforced above — for existing_app_section)
    if (form.designSystem.design_system_name) fd.append('design_system_name', form.designSystem.design_system_name);
    colorHexCodesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((hex) => fd.append('color_hex_codes', hex));
    if (form.designSystem.typography_guidelines) {
      fd.append('typography_guidelines', form.designSystem.typography_guidelines);
    }
    if (form.designSystem.primary_button_style) {
      fd.append('primary_button_style', form.designSystem.primary_button_style);
    }
    if (form.designSystem.component_libraries) {
      fd.append('component_libraries', form.designSystem.component_libraries);
    }

    // Entry point + receipt co-branding (all optional)
    if (form.entryPointLabel) {
      fd.append('entry_point_label', form.entryPointLabel);
      if (form.entryPointLabel === 'Other') fd.append('entry_point_label_other', form.entryPointLabelOther);
    }
    if (form.entryPointPlacement) {
      fd.append('entry_point_placement', form.entryPointPlacement);
      if (form.entryPointPlacement === 'other') {
        fd.append('entry_point_placement_other', form.entryPointPlacementOther);
      }
    }
    if (form.receiptCoBranding !== null) fd.append('receipt_co_branding', String(form.receiptCoBranding));

    setIsSubmitting(true);
    try {
      const json = await submitOnboarding(fd);
      setResource(json);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isExistingApp = form.integrationMode === 'existing_app_section';

  return (
    <Box backgroundColor="surface.background.gray.moderate" minHeight="100vh">
      <TopBar />
      <Box maxWidth="880px" marginX="auto" paddingX="spacing.5" paddingY="spacing.7">
        <BackLinks />
        <PageHeading />

        <AutofillSection
          url={websiteUrl}
          onUrlChange={setWebsiteUrl}
          onAutofill={handleAutofill}
          isLoading={isAutofilling}
          error={autofillError}
          result={autofillResult}
        />

        <form onSubmit={handleSubmit}>
          <BusinessSection
            businessDescription={form.businessDescription}
            onBusinessDescriptionChange={(value) => patchForm({ businessDescription: value })}
            estimatedUserBase={form.estimatedUserBase}
            onEstimatedUserBaseChange={(value) => {
              patchForm({ estimatedUserBase: value });
              if (value.trim()) setEstimatedUserBaseHint(null);
            }}
            estimatedUserBaseHint={estimatedUserBaseHint}
          />

          <CategoriesSection
            categories={categories}
            selected={form.categories}
            onChange={(values) => patchForm({ categories: values })}
          />

          <BrandingSection
            fileList={logoFileList}
            onFileListChange={setLogoFileList}
            onFileRemove={() => setLogoFileList([])}
            scrapedLogoPreviewUrl={form.logoPreviewUrl}
            brandColor={form.brandColor}
            onBrandColorChange={(value) => patchForm({ brandColor: value })}
            businessName={form.businessName}
            onBusinessNameChange={(value) => patchForm({ businessName: value })}
          />

          <IntegrationModeSection
            mode={form.integrationMode ?? 'new_app'}
            onModeChange={(mode) => patchForm({ integrationMode: mode })}
            existingApp={form.existingApp}
            onExistingAppChange={(patch) => patchForm({ existingApp: { ...form.existingApp, ...patch } })}
          />

          <DesignSystemSection
            value={{ ...form.designSystem, color_hex_codes_raw: colorHexCodesRaw }}
            onChange={(patch) => {
              const { color_hex_codes_raw, ...rest } = patch;
              if (color_hex_codes_raw !== undefined) setColorHexCodesRaw(color_hex_codes_raw);
              if (Object.keys(rest).length > 0) patchForm({ designSystem: { ...form.designSystem, ...rest } });
            }}
            isRequired={isExistingApp}
          />

          <EntryPointSection
            label={form.entryPointLabel}
            onLabelChange={(label) => patchForm({ entryPointLabel: label })}
            labelOther={form.entryPointLabelOther}
            onLabelOtherChange={(value) => patchForm({ entryPointLabelOther: value })}
            placement={form.entryPointPlacement}
            onPlacementChange={(placement) => patchForm({ entryPointPlacement: placement })}
            placementOther={form.entryPointPlacementOther}
            onPlacementOtherChange={(value) => patchForm({ entryPointPlacementOther: value })}
            receiptCoBranding={form.receiptCoBranding}
            onReceiptCoBrandingChange={(value) => patchForm({ receiptCoBranding: value })}
          />

          {submitError ? (
            <Box marginBottom="spacing.4">
              <Alert description={submitError} color="negative" isDismissible={false} />
            </Box>
          ) : null}

          <Button type="submit" isLoading={isSubmitting} isFullWidth size="large">
            Get curated offering
          </Button>
        </form>

        {resource ? (
          <Box marginTop="spacing.7">
            <CuratedOfferingCard offering={resource.curated_offering} />
            <PreferencesSummaryCard resource={resource} />
            <NrPotentialCard onboardingId={resource.id} />
            <PreviewLinkCard onboardingId={resource.id} />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

export default App;
