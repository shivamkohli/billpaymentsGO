import { Card, CardBody, CardHeader, CardHeaderLeading } from '@razorpay/blade/components';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Highlights the card with a primary-color border — used for the "Autofill" card so it stands out as the recommended first step. */
  isHighlighted?: boolean;
}

/** Consistent per-section wrapper used for every numbered card in the wizard. */
export function SectionCard({ title, subtitle, children, isHighlighted }: SectionCardProps): React.ReactElement {
  return (
    <Card marginBottom="spacing.5" padding="spacing.5" borderRadius="medium" isSelected={isHighlighted}>
      <CardHeader>
        <CardHeaderLeading title={title} subtitle={subtitle} />
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}
