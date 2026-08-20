import { Box, Text, TextInput, Button, Alert } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { WebsiteScrapeResult } from '../types';

interface AutofillSectionProps {
  url: string;
  onUrlChange: (url: string) => void;
  onAutofill: () => void;
  isLoading: boolean;
  error: string | null;
  result: WebsiteScrapeResult | null;
}

export function AutofillSection({
  url,
  onUrlChange,
  onAutofill,
  isLoading,
  error,
  result,
}: AutofillSectionProps): React.ReactElement {
  return (
    <SectionCard
      title="Autofill from your website"
      subtitle="Give us your website URL and we'll pull your brand name, logo, brand color and a business description automatically — everything below stays editable, so fix anything we got wrong."
      isHighlighted
    >
      <Box display="flex" gap="spacing.4" alignItems="flex-end" flexWrap="wrap">
        <Box flex="3" minWidth="240px">
          <TextInput
            accessibilityLabel="Website URL"
            placeholder="https://www.yourbusiness.com"
            type="url"
            value={url}
            onChange={({ value }) => onUrlChange(value ?? '')}
          />
        </Box>
        <Box flex="1" minWidth="140px">
          <Button isFullWidth isLoading={isLoading} onClick={onAutofill}>
            Autofill
          </Button>
        </Box>
      </Box>

      {error ? (
        <Box marginTop="spacing.4">
          <Alert description={error} color="negative" isDismissible={false} />
        </Box>
      ) : null}

      {result ? (
        <Box
          marginTop="spacing.4"
          padding="spacing.4"
          borderRadius="medium"
          backgroundColor="surface.background.gray.subtle"
        >
          <Text size="small">
            Detected <Text as="span" weight="semibold">{result.brand_name || 'your business'}</Text> from{' '}
            {result.source_url}
          </Text>

          {result.warnings.length > 0 ? (
            <Box marginTop="spacing.2">
              {result.warnings.map((w) => (
                <Text key={w} size="small" color="surface.text.gray.muted">
                  ⚠ {w}
                </Text>
              ))}
            </Box>
          ) : null}

          {result.suggested_categories.length > 0 ? (
            <Box marginTop="spacing.3">
              <Text size="small" color="surface.text.gray.muted">
                Pre-selected categories below — deselect anything that doesn&apos;t fit:
              </Text>
              <Box as="div" marginTop="spacing.1" paddingLeft="spacing.5">
                {result.suggested_categories.map((s) => (
                  <Text key={s.category} size="small" color="surface.text.gray.muted">
                    • {s.category} — {s.reason}
                  </Text>
                ))}
              </Box>
            </Box>
          ) : null}

          <Box marginTop="spacing.3">
            <Text size="small" weight="semibold" color="surface.text.gray.muted">
              Rough scale signals (estimated, low confidence — not real figures):
            </Text>
            <ScaleLine label="Customers" estimate={result.estimated_scale.customers} />
            <ScaleLine label="App downloads" estimate={result.estimated_scale.app_downloads} />
            <ScaleLine label="GMV" estimate={result.estimated_scale.gmv} />
          </Box>
        </Box>
      ) : null}
    </SectionCard>
  );
}

function ScaleLine({ label, estimate }: { label: string; estimate: { label: string; basis: string[] } }): React.ReactElement {
  const basisText = estimate.basis.length ? ` — ${estimate.basis.join('; ')}` : '';
  return (
    <Text size="small" color="surface.text.gray.muted">
      <Text as="span" weight="semibold">
        {label}:
      </Text>{' '}
      {estimate.label}
      {basisText}
    </Text>
  );
}
