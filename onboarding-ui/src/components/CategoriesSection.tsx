import { ChipGroup, Chip, Text } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import type { BillCategoryOption } from '../types';

interface CategoriesSectionProps {
  categories: BillCategoryOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export function CategoriesSection({ categories, selected, onChange }: CategoriesSectionProps): React.ReactElement {
  return (
    <SectionCard
      title="2. Which bill payment categories do you want?"
      subtitle="Select as many as apply — multiple selections allowed."
    >
      {categories.length === 0 ? (
        <Text size="small" color="surface.text.gray.muted">
          Loading categories…
        </Text>
      ) : (
        <ChipGroup
          accessibilityLabel="Bill payment categories"
          selectionType="multiple"
          value={selected}
          onChange={({ values }) => onChange(values)}
        >
          {categories.map((c) => (
            <Chip key={c.key} value={c.key}>
              {c.label}
            </Chip>
          ))}
        </ChipGroup>
      )}
    </SectionCard>
  );
}
