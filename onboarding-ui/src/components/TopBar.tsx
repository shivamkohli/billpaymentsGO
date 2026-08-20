import { Box, Text, Link, Heading, ArrowRightIcon } from '@razorpay/blade/components';

export function TopBar(): React.ReactElement {
  return (
    <Box
      display="flex"
      alignItems="center"
      gap="spacing.7"
      paddingX="spacing.7"
      paddingY="spacing.4"
      backgroundColor="surface.background.gray.intense"
    >
      <Box display="flex" alignItems="center" gap="spacing.3">
        <Box
          width="20px"
          height="20px"
          borderRadius="small"
          backgroundColor="surface.background.primary.intense"
        />
        <Text color="surface.text.staticWhite.normal" weight="semibold">
          Razorpay
        </Text>
      </Box>
      <Box display="flex" gap="spacing.6">
        <Text size="small" color="surface.text.gray.muted">
          Home
        </Text>
        <Text size="small" color="surface.text.gray.muted">
          Payments
        </Text>
        <Text size="small" color="surface.text.staticWhite.normal" weight="semibold">
          Bill Payments Setup
        </Text>
      </Box>
    </Box>
  );
}

export function BackLinks(): React.ReactElement {
  return (
    <Box display="flex" gap="spacing.5" marginBottom="spacing.4" flexWrap="wrap">
      <Link href="/" size="small" color="neutral">
        &larr; back to API demo
      </Link>
      <Link
        href="/billpay-widget.html"
        size="small"
        color="primary"
        icon={ArrowRightIcon}
        iconPosition="right"
      >
        preview the customer bill-payment widget
      </Link>
    </Box>
  );
}

export function PageHeading(): React.ReactElement {
  return (
    <Box marginBottom="spacing.7">
      <Heading size="large" marginBottom="spacing.2">
        Set up Bill Payments for your business
      </Heading>
      <Text color="surface.text.gray.muted" size="small">
        Tell us a bit about your business and we&apos;ll curate a BBPS bill-payment offering — which
        categories to enable and how to integrate — for your account.
      </Text>
    </Box>
  );
}
