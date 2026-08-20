import { Box, TextArea, TextInput } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';

interface BusinessSectionProps {
  businessDescription: string;
  onBusinessDescriptionChange: (value: string) => void;
  estimatedUserBase: string;
  onEstimatedUserBaseChange: (value: string) => void;
  estimatedUserBaseHint: string | null;
}

export function BusinessSection({
  businessDescription,
  onBusinessDescriptionChange,
  estimatedUserBase,
  onEstimatedUserBaseChange,
  estimatedUserBaseHint,
}: BusinessSectionProps): React.ReactElement {
  return (
    <SectionCard
      title="1. About your business"
      subtitle="One line is enough — this helps us prioritise which billers to provision first."
    >
      <TextArea
        accessibilityLabel="Business description"
        placeholder="e.g. We are a small finance bank with 3 million users, primarily in tier-2/3 cities."
        value={businessDescription}
        onChange={({ value }) => onBusinessDescriptionChange(value ?? '')}
        numberOfLines={3}
        marginBottom="spacing.5"
      />
      <Box maxWidth="320px">
        <TextInput
          label="Estimated user base (optional)"
          placeholder="e.g. 3000000"
          type="number"
          value={estimatedUserBase}
          onChange={({ value }) => onEstimatedUserBaseChange(value ?? '')}
          helpText={estimatedUserBaseHint ?? undefined}
        />
      </Box>
    </SectionCard>
  );
}
