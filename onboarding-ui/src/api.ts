import type {
  ApiErrorBody,
  BillCategoryOption,
  MerchantOnboardingResource,
  NrPotentialResult,
  WebsiteScrapeResult,
} from './types';

/**
 * Thin fetch wrappers around `/v1/merchant_onboarding/*`. In dev these go
 * through Vite's proxy (see vite.config.ts) to the Express server on :4000;
 * in production (once published into public/onboarding.html) they're
 * same-origin, so relative paths work either way.
 */

async function extractErrorDescription(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as ApiErrorBody;
    return json?.error?.description || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchCategories(): Promise<BillCategoryOption[]> {
  const res = await fetch('/v1/merchant_onboarding/categories');
  if (!res.ok) {
    throw new Error(await extractErrorDescription(res, 'Could not load bill-payment categories.'));
  }
  const json = (await res.json()) as { categories: BillCategoryOption[] };
  return json.categories;
}

export async function scrapeWebsite(url: string): Promise<WebsiteScrapeResult> {
  const res = await fetch('/v1/merchant_onboarding/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(await extractErrorDescription(res, 'Could not fetch that website.'));
  }
  return (await res.json()) as WebsiteScrapeResult;
}

export async function submitOnboarding(formData: FormData): Promise<MerchantOnboardingResource> {
  const res = await fetch('/v1/merchant_onboarding', { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error(await extractErrorDescription(res, 'Submission failed.'));
  }
  return (await res.json()) as MerchantOnboardingResource;
}

export async function fetchNrPotential(onboardingId: string): Promise<NrPotentialResult> {
  const res = await fetch(`/v1/merchant_onboarding/${onboardingId}/nr_potential`);
  const json = (await res.json()) as NrPotentialResult;
  if (!res.ok) {
    throw new Error(json?.message || 'Could not compute a revenue potential estimate for this submission.');
  }
  return json;
}
