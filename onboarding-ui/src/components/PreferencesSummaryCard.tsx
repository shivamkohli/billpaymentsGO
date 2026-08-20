import { Box, Text } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { MerchantOnboardingResource } from '../types';

interface PreferencesSummaryCardProps {
  resource: MerchantOnboardingResource;
}

const PLACEMENT_LABELS: Record<string, string> = {
  home_dashboard_button: 'Button on home screen dashboard',
  quick_action_shortcut: 'Quick-action shortcut',
  services_subsection: 'Inside a services/payments sub-section',
};

export function PreferencesSummaryCard({ resource }: PreferencesSummaryCardProps): React.ReactElement {
  const lines: string[] = [];

  const ds = resource.design_system;
  if (ds) {
    if (ds.design_system_name) lines.push(`Design system: ${ds.design_system_name}`);
    if (ds.color_hex_codes && ds.color_hex_codes.length) lines.push(`Colors: ${ds.color_hex_codes.join(', ')}`);
    if (ds.typography_guidelines) lines.push(`Typography: ${ds.typography_guidelines}`);
    if (ds.primary_button_style) lines.push(`Button style: ${ds.primary_button_style}`);
    if (ds.component_libraries) lines.push(`Component libraries: ${ds.component_libraries}`);
  }

  const ep = resource.entry_point;
  if (ep) {
    if (ep.label) lines.push(`Entry point label: "${ep.label === 'Other' ? ep.label_other : ep.label}"`);
    if (ep.placement) {
      const placementLabel = ep.placement === 'other' ? ep.placement_other : PLACEMENT_LABELS[ep.placement];
      lines.push(`Entry point placement: ${placementLabel}`);
    }
  }

  if (typeof resource.receipt_co_branding === 'boolean') {
    lines.push(
      `Receipt co-branding: ${
        resource.receipt_co_branding ? 'merchant logo + BBPS/Bharat Connect logo' : 'merchant branding only'
      }`,
    );
  }

  if (resource.source_url) lines.push(`Autofilled from: ${resource.source_url}`);

  if (resource.estimated_scale) {
    const es = resource.estimated_scale;
    lines.push(`Estimated customers: ${es.customers.label}`);
    lines.push(`Estimated app downloads: ${es.app_downloads.label}`);
    lines.push(`Estimated GMV: ${es.gmv.label}`);
  }

  return (
    <SectionCard title="Preferences on record">
      {lines.length ? (
        <Box display="flex" flexDirection="column" gap="spacing.2">
          {lines.map((l, i) => (
            <Text key={i} size="small" color="surface.text.gray.muted">
              {l}
            </Text>
          ))}
        </Box>
      ) : (
        <Text size="small" color="surface.text.gray.muted">
          No design/placement preferences were provided — our team will propose defaults.
        </Text>
      )}
    </SectionCard>
  );
}
