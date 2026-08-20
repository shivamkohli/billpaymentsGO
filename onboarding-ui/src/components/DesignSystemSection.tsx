import { TextInput } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { DesignSystemPreferences } from '../types';

interface DesignSystemSectionProps {
  value: DesignSystemPreferences & { color_hex_codes_raw: string };
  onChange: (patch: Partial<DesignSystemPreferences & { color_hex_codes_raw: string }>) => void;
  isRequired: boolean;
}

export function DesignSystemSection({ value, onChange, isRequired }: DesignSystemSectionProps): React.ReactElement {
  const subtitle = isRequired
    ? "Share your design system so the bill-payment screens feel native to your app, not bolted on. Since you're embedding into an existing app, fill in at least one field below."
    : 'Share your design system so the bill-payment screens feel native to your app, not bolted on. Everything here is optional — our design team will follow up on anything left blank.';

  return (
    <SectionCard title={`5. Match your app's look & feel ${isRequired ? '(required)' : '(optional)'}`} subtitle={subtitle}>
      <TextInput
        label="UI design system"
        placeholder="e.g. Material 3, Human Interface Guidelines, in-house Blade-based DS"
        value={value.design_system_name ?? ''}
        onChange={({ value: v }) => onChange({ design_system_name: v })}
        marginBottom="spacing.4"
      />
      <TextInput
        label="Color hex codes"
        placeholder="#0f6fde, #ffffff, #1a1a1a (comma-separated)"
        value={value.color_hex_codes_raw}
        onChange={({ value: v }) => onChange({ color_hex_codes_raw: v ?? '' })}
        marginBottom="spacing.4"
      />
      <TextInput
        label="Typography guidelines"
        placeholder="e.g. Primary font: Inter, weights 400/600/700"
        value={value.typography_guidelines ?? ''}
        onChange={({ value: v }) => onChange({ typography_guidelines: v })}
        marginBottom="spacing.4"
      />
      <TextInput
        label="Primary button style"
        placeholder="e.g. Rounded 8px corners, solid fill, 44px height, white label text"
        value={value.primary_button_style ?? ''}
        onChange={({ value: v }) => onChange({ primary_button_style: v })}
        marginBottom="spacing.4"
      />
      <TextInput
        label="Component libraries"
        placeholder="e.g. Material UI, Tailwind, in-house component library"
        value={value.component_libraries ?? ''}
        onChange={({ value: v }) => onChange({ component_libraries: v })}
      />
    </SectionCard>
  );
}
