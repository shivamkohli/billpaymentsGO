import { Box, RadioGroup, Radio, TextInput, Text } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { ExistingAppIntegrationDetails, IntegrationMode } from '../types';

interface IntegrationModeSectionProps {
  mode: IntegrationMode;
  onModeChange: (mode: IntegrationMode) => void;
  existingApp: ExistingAppIntegrationDetails;
  onExistingAppChange: (patch: Partial<ExistingAppIntegrationDetails>) => void;
}

export function IntegrationModeSection({
  mode,
  onModeChange,
  existingApp,
  onExistingAppChange,
}: IntegrationModeSectionProps): React.ReactElement {
  return (
    <SectionCard title="4. Where should this live?">
      <RadioGroup
        label="Integration mode"
        name="integrationMode"
        value={mode}
        onChange={({ value }) => onModeChange(value as IntegrationMode)}
      >
        <Radio value="new_app" helpText="We'll help you launch a dedicated bill-payments app/mini-app.">
          Build a new standalone app
        </Radio>
        <Radio
          value="existing_app_section"
          helpText="Embed bill payments inside your current app via deep link / SDK section."
        >
          Add as a section within our existing app
        </Radio>
      </RadioGroup>

      {mode === 'existing_app_section' ? (
        <Box
          marginTop="spacing.4"
          padding="spacing.5"
          borderRadius="medium"
          backgroundColor="surface.background.gray.subtle"
        >
          <TextInput
            label="Deep link (custom URI scheme)"
            placeholder="myapp://billpay"
            value={existingApp.deep_link ?? ''}
            onChange={({ value }) => onExistingAppChange({ deep_link: value })}
            marginBottom="spacing.4"
          />
          <Box display="flex" gap="spacing.4" marginBottom="spacing.4" flexWrap="wrap">
            <Box flex="1" minWidth="220px">
              <TextInput
                label="iOS Universal Link"
                placeholder="https://myapp.com/billpay"
                type="url"
                value={existingApp.ios_universal_link ?? ''}
                onChange={({ value }) => onExistingAppChange({ ios_universal_link: value })}
              />
            </Box>
            <Box flex="1" minWidth="220px">
              <TextInput
                label="Android App Link"
                placeholder="https://myapp.com/billpay"
                type="url"
                value={existingApp.android_app_link ?? ''}
                onChange={({ value }) => onExistingAppChange({ android_app_link: value })}
              />
            </Box>
          </Box>
          <Box display="flex" gap="spacing.4" marginBottom="spacing.4" flexWrap="wrap">
            <Box flex="1" minWidth="220px">
              <TextInput
                label="Android package name"
                placeholder="com.mybank.app"
                value={existingApp.android_package_name ?? ''}
                onChange={({ value }) => onExistingAppChange({ android_package_name: value })}
              />
            </Box>
            <Box flex="1" minWidth="220px">
              <TextInput
                label="iOS bundle ID"
                placeholder="com.mybank.app"
                value={existingApp.ios_bundle_id ?? ''}
                onChange={({ value }) => onExistingAppChange({ ios_bundle_id: value })}
              />
            </Box>
          </Box>
          <Text size="small" color="surface.text.gray.muted">
            Provide at least one — we&apos;ll use this to route customers straight to the bill-payment section.
          </Text>
        </Box>
      ) : null}
    </SectionCard>
  );
}
