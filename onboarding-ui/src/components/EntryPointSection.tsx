import {
  Box,
  TextInput,
  Dropdown,
  DropdownOverlay,
  SelectInput,
  ActionList,
  ActionListItem,
} from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { EntryPointLabel, EntryPointPlacement } from '../types';

const LABEL_OPTIONS: Array<{ title: string; value: string }> = [
  { title: 'No preference', value: '' },
  { title: '"Pay Bills"', value: 'Pay Bills' },
  { title: '"Bharat Connect"', value: 'Bharat Connect' },
  { title: 'Other', value: 'Other' },
];

const PLACEMENT_OPTIONS: Array<{ title: string; value: string }> = [
  { title: 'No preference', value: '' },
  { title: 'Button on home screen dashboard', value: 'home_dashboard_button' },
  { title: 'Quick-action shortcut', value: 'quick_action_shortcut' },
  { title: 'Inside a services/payments sub-section', value: 'services_subsection' },
  { title: 'Other', value: 'other' },
];

const RECEIPT_CO_BRANDING_OPTIONS: Array<{ title: string; value: string }> = [
  { title: 'No preference', value: '' },
  { title: 'Yes — show merchant logo + BBPS/Bharat Connect logo together', value: 'true' },
  { title: 'No — merchant branding only', value: 'false' },
];

interface EntryPointSectionProps {
  label: EntryPointLabel | null;
  onLabelChange: (label: EntryPointLabel | null) => void;
  labelOther: string;
  onLabelOtherChange: (value: string) => void;
  placement: EntryPointPlacement | null;
  onPlacementChange: (placement: EntryPointPlacement | null) => void;
  placementOther: string;
  onPlacementOtherChange: (value: string) => void;
  receiptCoBranding: boolean | null;
  onReceiptCoBrandingChange: (value: boolean | null) => void;
}

export function EntryPointSection({
  label,
  onLabelChange,
  labelOther,
  onLabelOtherChange,
  placement,
  onPlacementChange,
  placementOther,
  onPlacementOtherChange,
  receiptCoBranding,
  onReceiptCoBrandingChange,
}: EntryPointSectionProps): React.ReactElement {
  const labelValue = label ?? '';
  const placementValue = placement ?? '';
  const receiptValue = receiptCoBranding === null ? '' : String(receiptCoBranding);

  return (
    <SectionCard
      title="6. Entry point & receipt branding (optional)"
      subtitle="Where should customers find bill payments, and what should it be called?"
    >
      <Box marginBottom="spacing.4">
        <Dropdown>
          <SelectInput
            label="Entry point label"
            value={labelValue}
            placeholder="No preference"
            onChange={(args) => {
              const v = args?.values[0] ?? '';
              onLabelChange(v ? (v as EntryPointLabel) : null);
            }}
          />
          <DropdownOverlay>
            <ActionList>
              {LABEL_OPTIONS.map((o) => (
                <ActionListItem key={o.value || 'none'} title={o.title} value={o.value} />
              ))}
            </ActionList>
          </DropdownOverlay>
        </Dropdown>
        {label === 'Other' ? (
          <Box marginTop="spacing.3">
            <TextInput
              label="Custom label"
              value={labelOther}
              onChange={({ value }) => onLabelOtherChange(value ?? '')}
            />
          </Box>
        ) : null}
      </Box>

      <Box marginBottom="spacing.4">
        <Dropdown>
          <SelectInput
            label="Placement"
            value={placementValue}
            placeholder="No preference"
            onChange={(args) => {
              const v = args?.values[0] ?? '';
              onPlacementChange(v ? (v as EntryPointPlacement) : null);
            }}
          />
          <DropdownOverlay>
            <ActionList>
              {PLACEMENT_OPTIONS.map((o) => (
                <ActionListItem key={o.value || 'none'} title={o.title} value={o.value} />
              ))}
            </ActionList>
          </DropdownOverlay>
        </Dropdown>
        {placement === 'other' ? (
          <Box marginTop="spacing.3">
            <TextInput
              label="Describe placement"
              value={placementOther}
              onChange={({ value }) => onPlacementOtherChange(value ?? '')}
            />
          </Box>
        ) : null}
      </Box>

      <Dropdown>
        <SelectInput
          label="Co-branding on confirmation/receipt screen"
          value={receiptValue}
          onChange={(args) => {
            const v = args?.values[0] ?? '';
            onReceiptCoBrandingChange(v === '' ? null : v === 'true');
          }}
        />
        <DropdownOverlay>
          <ActionList>
            {RECEIPT_CO_BRANDING_OPTIONS.map((o) => (
              <ActionListItem key={o.value || 'none'} title={o.title} value={o.value} />
            ))}
          </ActionList>
        </DropdownOverlay>
      </Dropdown>
    </SectionCard>
  );
}
