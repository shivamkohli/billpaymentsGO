import { Box, Text, Badge } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { CuratedOfferingPreview } from '../types';

interface CuratedOfferingCardProps {
  offering: CuratedOfferingPreview;
}

function statusLabel(category: CuratedOfferingPreview['categories'][number]): string {
  if (category.status !== 'live') return 'Coming soon';
  // Only call these "sample billers" when they truly are demo/mock data
  // (BBPS_MODE != production, or a per-category production-fetch fallback) —
  // otherwise this is the real BBPS production catalog and saying "sample"
  // is actively misleading to a merchant deciding whether to integrate.
  return category.catalog_source === 'production' ? 'Live (production billers)' : 'Live (sample billers wired up)';
}

export function CuratedOfferingCard({ offering }: CuratedOfferingCardProps): React.ReactElement {
  return (
    <SectionCard title="Your curated bill-payment offering" subtitle={offering.recommended_next_step}>
      <Box display="flex" flexDirection="column" gap="spacing.3">
        {offering.categories.map((c) => (
          <Box
            key={c.category}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap="spacing.4"
            padding="spacing.4"
            borderRadius="medium"
            backgroundColor="surface.background.gray.subtle"
            flexWrap="wrap"
          >
            <Box>
              <Text weight="semibold">{c.category}</Text>
              <Text size="small" color="surface.text.gray.muted">
                {c.biller_count} {c.catalog_source === 'production' ? 'production' : 'sample'} biller(s)
                {c.biller_ids.length ? `: ${c.biller_ids.join(', ')}` : ''}
              </Text>
            </Box>
            <Badge color={c.status === 'live' ? 'positive' : 'neutral'} emphasis="subtle">
              {statusLabel(c)}
            </Badge>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
