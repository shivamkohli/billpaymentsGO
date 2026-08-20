import { Box, Text, Button, ArrowRightIcon } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';

interface PreviewLinkCardProps {
  onboardingId: string;
}

export function PreviewLinkCard({ onboardingId }: PreviewLinkCardProps): React.ReactElement {
  return (
    <SectionCard title="Preview your bill-payment experience">
      <Text size="small" color="surface.text.gray.muted" marginBottom="spacing.4">
        A live preview of the customer-facing bill-payment flow, themed with the brand color and logo
        you just submitted, scoped to only the categories you picked above — live ones show the
        billers actually wired up for that category (real production billers, or demo/sample data
        depending on mode), &quot;coming soon&quot; ones show honestly as not-yet-available rather than
        disappearing.
      </Text>
      <Box>
        <Button
          href={`/billpay-widget.html?onboarding_id=${onboardingId}`}
          target="_blank"
          icon={ArrowRightIcon}
          iconPosition="right"
        >
          Open live preview
        </Button>
      </Box>
    </SectionCard>
  );
}
