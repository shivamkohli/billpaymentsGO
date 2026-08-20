import { useEffect, useState } from 'react';
import {
  Box,
  Text,
  Heading,
  Link,
  ExternalLinkIcon,
  Tabs,
  TabList,
  TabItem,
  TabPanel,
  Collapsible,
  CollapsibleLink,
  CollapsibleBody,
  ProgressBar,
} from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';
import { fetchNrPotential } from '../api';
import { fmtCr, fmtCount, fmtAbbrev, fmtCrValue, CATEGORY_ICONS } from '../format';
import type { NrPotentialResult, NrPotentialScenarioKey, NrPotentialScenarioResult } from '../types';

interface NrPotentialCardProps {
  onboardingId: string;
}

export function NrPotentialCard({ onboardingId }: NrPotentialCardProps): React.ReactElement | null {
  const [result, setResult] = useState<NrPotentialResult | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [scenario, setScenario] = useState<NrPotentialScenarioKey>('base');

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setUnavailableMessage(null);
    fetchNrPotential(onboardingId)
      .then((json) => {
        if (cancelled) return;
        if (!json.available || !json.scenarios) {
          setUnavailableMessage(json.message || 'Could not compute a revenue potential estimate for this submission.');
          return;
        }
        setResult(json);
        setScenario('base');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setUnavailableMessage('Network error while computing revenue potential: ' + err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [onboardingId]);

  if (unavailableMessage) {
    return (
      <SectionCard title="Year-1 revenue potential">
        <Text size="small" color="surface.text.gray.muted">
          {unavailableMessage}
        </Text>
      </SectionCard>
    );
  }

  if (!result || !result.scenarios) {
    return (
      <SectionCard title="Year-1 revenue potential">
        <Text size="small" color="surface.text.gray.muted">
          Crunching the numbers…
        </Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Year-1 revenue potential">
      <Box marginBottom="spacing.4">
        <Link
          href="https://www.bharat-connect.com/statistics/billers/"
          target="_blank"
          rel="noopener noreferrer"
          size="small"
          color="neutral"
          icon={ExternalLinkIcon}
          iconPosition="right"
        >
          Source: Bharat Connect published statistics
        </Link>
      </Box>
      <Box marginBottom="spacing.5">
        <Tabs value={scenario} onChange={(v) => setScenario(v as NrPotentialScenarioKey)}>
          <TabList>
            {Object.values(result.scenarios).map((sc) => (
              <TabItem key={sc.scenario} value={sc.scenario}>
                {sc.label}
              </TabItem>
            ))}
          </TabList>
          {Object.values(result.scenarios).map((sc) => (
            <TabPanel key={sc.scenario} value={sc.scenario}>
              <ScenarioBody scenario={sc} />
            </TabPanel>
          ))}
        </Tabs>
      </Box>

      {result.notes.length > 0 ? (
        <Box marginTop="spacing.4" display="flex" flexDirection="column" gap="spacing.1">
          {result.notes.map((n, i) => (
            <Text key={i} size="xsmall" color="surface.text.gray.muted">
              {n}
            </Text>
          ))}
        </Box>
      ) : null}
    </SectionCard>
  );
}

function ScenarioBody({ scenario: s }: { scenario: NrPotentialScenarioResult }): React.ReactElement {
  const kpis: Array<[string, string]> = [
    ['Year-1 active users', fmtCount(s.year1_active_users)],
    ['Year-1 transactions', fmtCount(s.year1_transactions)],
    ['Year-1 bill-pay GMV', fmtCr(s.year1_gmv)],
    ['Exit monthly GMV (run-rate)', fmtCr(s.exit_monthly_gmv)],
  ];

  const maxGmv = Math.max(...s.categories.map((c) => c.fy1_totals.value), 1);
  const rankedCategories = [...s.categories].sort((a, b) => b.fy1_totals.value - a.fy1_totals.value);

  return (
    <Box paddingTop="spacing.4">
      <Box marginBottom="spacing.5">
        <Heading size="xlarge" marginBottom="spacing.1">
          {fmtCr(s.year1_nr)}
        </Heading>
        <Text size="small" color="surface.text.gray.muted">
          Exit run-rate {fmtCr(s.exit_monthly_nr)}/month · NR = 0.3% of GMV · {s.label} scenario
        </Text>
      </Box>

      <Box display="flex" flexWrap="wrap" gap="spacing.4" marginBottom="spacing.6">
        {kpis.map(([label, value]) => (
          <Box
            key={label}
            flex="1"
            minWidth="180px"
            padding="spacing.4"
            borderRadius="medium"
            backgroundColor="surface.background.gray.subtle"
          >
            <Text size="xsmall" color="surface.text.gray.muted" marginBottom="spacing.1">
              {label}
            </Text>
            <Text weight="semibold" size="large">
              {value}
            </Text>
          </Box>
        ))}
      </Box>

      <Box display="flex" flexDirection="column" gap="spacing.3">
        {rankedCategories.map((c) => {
          const barPct = Math.max((c.fy1_totals.value / maxGmv) * 100, 2);
          const icon = CATEGORY_ICONS[c.category] || '🧾';
          return (
            <Box
              key={c.category}
              padding="spacing.4"
              borderRadius="medium"
              backgroundColor="surface.background.gray.subtle"
            >
              <Box display="flex" alignItems="flex-start" gap="spacing.3">
                <Text as="span" size="large">
                  {icon}
                </Text>
                <Box flex="1">
                  <Box display="flex" justifyContent="space-between" gap="spacing.3" flexWrap="wrap">
                    <Text weight="semibold" size="small">
                      {c.label}
                    </Text>
                    <Text size="small" color="surface.text.gray.muted">
                      {fmtCr(c.fy1_totals.value)} FY1 GMV
                    </Text>
                  </Box>
                  <Box marginTop="spacing.2" marginBottom="spacing.2">
                    <ProgressBar
                      variant="linear"
                      value={barPct}
                      accessibilityLabel={`${c.label} share of FY1 revenue`}
                      showPercentage={false}
                    />
                  </Box>
                  <Box display="flex" gap="spacing.4" flexWrap="wrap">
                    <Text size="xsmall" color="surface.text.gray.muted">
                      {fmtCount(c.merchant_category_mau_potential)} potential users
                    </Text>
                    <Text size="xsmall" color="surface.text.gray.muted">
                      {fmtCount(c.fy1_totals.transactions)} FY1 txns
                    </Text>
                    <Text size="xsmall" color="surface.text.gray.muted">
                      Penetration {(c.category_penetration * 100).toFixed(0)}%
                    </Text>
                    <Text size="xsmall" color="surface.text.gray.muted">
                      ATV ₹{fmtAbbrev(c.avg_transaction_value)}
                    </Text>
                  </Box>
                </Box>
              </Box>

              <Box marginTop="spacing.3">
                <Collapsible>
                  <CollapsibleLink>View month-by-month breakdown</CollapsibleLink>
                  <CollapsibleBody>
                    <Box paddingTop="spacing.3">
                      <Box display="flex" flexDirection="column" gap="spacing.1">
                        <Box display="flex" gap="spacing.3">
                          {['Month', 'Ramp', 'Users', 'Transactions', 'Value'].map((h) => (
                            <Box key={h} flex="1">
                              <Text as="span" size="xsmall" weight="semibold">
                                {h}
                              </Text>
                            </Box>
                          ))}
                        </Box>
                        {c.months.map((m) => (
                          <Box key={m.month} display="flex" gap="spacing.3">
                            <Box flex="1">
                              <Text as="span" size="xsmall">
                                M{m.month}
                              </Text>
                            </Box>
                            <Box flex="1">
                              <Text as="span" size="xsmall">
                                {m.ramp_pct.toFixed(0)}%
                              </Text>
                            </Box>
                            <Box flex="1">
                              <Text as="span" size="xsmall">
                                {fmtCount(m.users)}
                              </Text>
                            </Box>
                            <Box flex="1">
                              <Text as="span" size="xsmall">
                                {fmtCount(m.transactions)}
                              </Text>
                            </Box>
                            <Box flex="1">
                              <Text as="span" size="xsmall">
                                ₹{fmtAbbrev(m.value)}
                              </Text>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                      <Text size="xsmall" color="surface.text.gray.muted" marginTop="spacing.3">
                        NPCI reference: {fmtCrValue(c.npci_monthly_value_cr)} /{' '}
                        {fmtAbbrev(c.npci_monthly_volume_mn * 1e6)} txns per month (as of {c.npci_as_of}). Industry
                        MAU basis: {c.mau_basis}
                      </Text>
                    </Box>
                  </CollapsibleBody>
                </Collapsible>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
