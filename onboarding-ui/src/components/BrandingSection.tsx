import { Box, Text, TextInput, FileUpload } from '@razorpay/blade/components';
import type { BladeFileList } from '@razorpay/blade/components';
import { SectionCard } from './SectionCard';

interface BrandingSectionProps {
  fileList: BladeFileList;
  onFileListChange: (fileList: BladeFileList) => void;
  onFileRemove: () => void;
  /** Logo URL pulled from "Autofill from website" — shown as a preview when no file has been manually uploaded yet. */
  scrapedLogoPreviewUrl: string | null;
  brandColor: string;
  onBrandColorChange: (value: string) => void;
  /** Company/brand display name (e.g. "Cred", "Navi") shown alongside the logo in the bill-payment widget's header — pre-filled from "Autofill from website" (og:site_name/<title>), always editable. */
  businessName: string;
  onBusinessNameChange: (value: string) => void;
}

// Size of the scraped-logo preview thumbnail. Previously 48px, which read as
// an illegible speck next to the "Detected from your website" caption —
// bumped up so a merchant can actually tell whether the right logo got
// picked up before deciding whether to replace it.
const LOGO_PREVIEW_SIZE = '96px';

const HEX_RE = /^#[0-9a-f]{6}$/i;

// A small curated palette so a merchant can pick a brand color with one
// click instead of typing a hex code by hand — deliberately NOT backed by
// any `<input type="color">` (see comment below on why).
const PRESET_COLORS = [
  '#0f6fde', // blue (this app's own default)
  '#6c5ce7', // indigo
  '#eb2f96', // magenta
  '#e03131', // red
  '#f76707', // orange
  '#f5a623', // amber
  '#2f9e44', // green
  '#0ca678', // teal
  '#1e293b', // slate
];

export function BrandingSection({
  fileList,
  onFileListChange,
  onFileRemove,
  scrapedLogoPreviewUrl,
  brandColor,
  onBrandColorChange,
  businessName,
  onBusinessNameChange,
}: BrandingSectionProps): React.ReactElement {
  return (
    <SectionCard title="3. Branding" subtitle="Used to theme the bill-payment experience for your customers.">
      <TextInput
        label="Business name"
        helpText='Shown in the bill-payment widget header next to your logo (e.g. "Cred", "Navi") — detected from your website when using "Autofill from website" above, but always yours to edit.'
        placeholder="Your company name"
        value={businessName}
        onChange={({ value }) => onBusinessNameChange(value ?? '')}
        marginBottom="spacing.5"
      />

      <FileUpload
        uploadType="single"
        label="Logo"
        helpText="PNG/JPG/SVG, max 5MB"
        accept=".png,.jpg,.jpeg,.webp,.svg"
        maxSize={5 * 1024 * 1024}
        fileList={fileList}
        onChange={({ fileList: newList }) => onFileListChange(newList)}
        onRemove={() => onFileRemove()}
        marginBottom="spacing.5"
      />

      {fileList.length === 0 && scrapedLogoPreviewUrl ? (
        <Box marginBottom="spacing.5" display="flex" alignItems="center" gap="spacing.3">
          <Box
            as="div"
            width={LOGO_PREVIEW_SIZE}
            height={LOGO_PREVIEW_SIZE}
            flexShrink={0}
            borderRadius="medium"
            overflow="hidden"
            backgroundColor="surface.background.gray.subtle"
          >
            {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative brand-logo preview from autofill */}
            <img src={scrapedLogoPreviewUrl} alt="Detected logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </Box>
          <Text size="small" color="surface.text.gray.muted">
            Detected from your website — upload a file above to replace it.
          </Text>
        </Box>
      ) : null}

      {/*
       * Deliberately NOT using a raw native <input type="color">, and NOT
       * using Blade's own `ColorInput` either — confirmed by hand that
       * `ColorInput`'s swatch is itself just a thin wrapper around a hidden
       * native <input type="color"> (its "Open color picker" trigger
       * renders one directly), so swapping to it did not actually fix
       * anything: clicking the swatch still hands off to the OS/browser's
       * own color-picker chrome, which Blade/CSS has no control over and
       * which was opening on top of the Logo upload area above it.
       *
       * Since this field only ever needs a single hex value (no gradient
       * picking, no alpha channel), the actual fix is to not open any
       * popup/overlay at all: a plain hex text input plus a one-click
       * preset palette, both fully in-page and never covering anything
       * else on the form.
       */}
      <Box maxWidth="320px">
        <Text size="small" weight="semibold" marginBottom="spacing.2">
          Brand color
        </Text>
        <Box display="flex" alignItems="center" gap="spacing.3" marginBottom="spacing.3">
          {/* Box's `backgroundColor`/`borderColor` only accept design-token
           * names, not arbitrary merchant hex values, so this preview swatch
           * (and the preset buttons below) use plain elements + inline style
           * instead — same pattern already used for the scraped-logo <img>
           * above. */}
          <div
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 8,
              border: '1px solid #e3e5ea',
              backgroundColor: HEX_RE.test(brandColor) ? brandColor : '#f5f5f5',
            }}
          />
          <TextInput
            accessibilityLabel="Brand color hex code"
            placeholder="#0f6fde"
            value={brandColor}
            onChange={({ value }) => onBrandColorChange(value ?? '')}
          />
        </Box>
        <Box display="flex" gap="spacing.2" flexWrap="wrap">
          {PRESET_COLORS.map((hex) => {
            const isSelected = brandColor.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                aria-label={`Use ${hex} as brand color`}
                aria-pressed={isSelected}
                onClick={() => onBrandColorChange(hex)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: hex,
                  border: isSelected ? '2px solid #1a1a1a' : '1px solid #e3e5ea',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            );
          })}
        </Box>
      </Box>
    </SectionCard>
  );
}
