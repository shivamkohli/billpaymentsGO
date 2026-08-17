/**
 * Merchant-onboarding wizard endpoints, consumed by `public/onboarding.html`.
 *
 * Deliberately NOT mounted behind `basicAuth` (unlike the BBPS partner API
 * routes) — in a real build this would sit behind Razorpay dashboard
 * session auth, since it's a merchant configuring their own account from
 * inside the dashboard, not a partner integration calling with a BBPS API
 * key/secret. No such session auth exists in this prototype, so it's left
 * open for demo purposes.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import { listBillCategoryOptions } from "../../mapping/billCategories";
import { createMerchantOnboarding, getMerchantOnboarding } from "../../orchestration/merchantOnboardingService";
import {
  DesignSystemPreferences,
  EntryPointLabel,
  EntryPointPlacement,
  EntryPointPreferences,
  ExistingAppIntegrationDetails,
  IntegrationMode,
  MerchantOnboardingCreateInput,
} from "../../types/onboarding";
import { sendError } from "../errors";

const UPLOADS_DIR = path.join(__dirname, "..", "..", "..", "public", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported image type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

export const merchantOnboardingRouter = Router();

merchantOnboardingRouter.get("/categories", (_req, res) => {
  res.json({ categories: listBillCategoryOptions() });
});

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    // supports either repeated form fields (e.g. `categories`) or a single comma-separated string
    return value.includes(",") ? value.split(",").map((s) => s.trim()).filter(Boolean) : [value];
  }
  return [];
}

const VALID_ENTRY_POINT_LABELS: readonly EntryPointLabel[] = ["Pay Bills", "Bharat Connect", "Other"];
const VALID_ENTRY_POINT_PLACEMENTS: readonly EntryPointPlacement[] = [
  "home_dashboard_button",
  "quick_action_shortcut",
  "services_subsection",
  "other",
];

/** All optional — every field here is a "nice to have" for the design team, never a submission blocker. */
function parseDesignSystem(body: Record<string, unknown>): DesignSystemPreferences | undefined {
  const designSystem: DesignSystemPreferences = {
    design_system_name: (body.design_system_name as string) || undefined,
    color_hex_codes: toStringArray(body.color_hex_codes),
    typography_guidelines: (body.typography_guidelines as string) || undefined,
    primary_button_style: (body.primary_button_style as string) || undefined,
    component_libraries: (body.component_libraries as string) || undefined,
  };
  if (designSystem.color_hex_codes && designSystem.color_hex_codes.length === 0) {
    designSystem.color_hex_codes = undefined;
  }
  const hasAnyValue = Object.values(designSystem).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
  return hasAnyValue ? designSystem : undefined;
}

/** Tri-state: undefined ("no preference") must stay undefined, never collapse to false. */
function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function parseEntryPoint(body: Record<string, unknown>): EntryPointPreferences | undefined {
  const rawLabel = body.entry_point_label as string | undefined;
  const rawPlacement = body.entry_point_placement as string | undefined;
  const label = VALID_ENTRY_POINT_LABELS.includes(rawLabel as EntryPointLabel) ? (rawLabel as EntryPointLabel) : undefined;
  const placement = VALID_ENTRY_POINT_PLACEMENTS.includes(rawPlacement as EntryPointPlacement)
    ? (rawPlacement as EntryPointPlacement)
    : undefined;
  if (!label && !placement) return undefined;
  return {
    label,
    label_other: label === "Other" ? (body.entry_point_label_other as string) || undefined : undefined,
    placement,
    placement_other: placement === "other" ? (body.entry_point_placement_other as string) || undefined : undefined,
  };
}

merchantOnboardingRouter.post(
  "/",
  upload.fields([{ name: "logo", maxCount: 1 }]),
  (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const businessDescription = typeof body.business_description === "string" ? body.business_description.trim() : "";
      const categories = toStringArray(body.categories);
      const integrationMode = body.integration_mode as IntegrationMode;

      if (!businessDescription) {
        sendError(res, 400, {
          code: "BAD_REQUEST_ERROR",
          description: "business_description is required",
          source: "business",
          step: "validation",
          reason: "INVALID_INPUT",
        });
        return;
      }
      if (categories.length === 0) {
        sendError(res, 400, {
          code: "BAD_REQUEST_ERROR",
          description: "Select at least one bill-payment category",
          source: "business",
          step: "validation",
          reason: "INVALID_INPUT",
        });
        return;
      }
      if (integrationMode !== "new_app" && integrationMode !== "existing_app_section") {
        sendError(res, 400, {
          code: "BAD_REQUEST_ERROR",
          description: 'integration_mode must be "new_app" or "existing_app_section"',
          source: "business",
          step: "validation",
          reason: "INVALID_INPUT",
        });
        return;
      }

      let existingApp: ExistingAppIntegrationDetails | undefined;
      if (integrationMode === "existing_app_section") {
        existingApp = {
          deep_link: (body.deep_link as string) || undefined,
          ios_universal_link: (body.ios_universal_link as string) || undefined,
          android_app_link: (body.android_app_link as string) || undefined,
          android_package_name: (body.android_package_name as string) || undefined,
          ios_bundle_id: (body.ios_bundle_id as string) || undefined,
        };
        const hasAnyDetail = Object.values(existingApp).some(Boolean);
        if (!hasAnyDetail) {
          sendError(res, 400, {
            code: "BAD_REQUEST_ERROR",
            description:
              "When embedding within an existing app, provide at least one of: deep_link, ios_universal_link, android_app_link, android_package_name, ios_bundle_id",
            source: "business",
            step: "validation",
            reason: "INVALID_INPUT",
          });
          return;
        }
      }

      const input: MerchantOnboardingCreateInput = {
        business_description: businessDescription,
        categories,
        integration_mode: integrationMode,
        existing_app: existingApp,
        estimated_user_base: body.estimated_user_base ? Number(body.estimated_user_base) : undefined,
        design_system: parseDesignSystem(body),
        entry_point: parseEntryPoint(body),
        receipt_co_branding: parseOptionalBoolean(body.receipt_co_branding),
      };

      const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
      const logoFile = files?.logo?.[0];

      const resource = createMerchantOnboarding(input, {
        logo_url: logoFile ? `/uploads/${logoFile.filename}` : undefined,
        brand_color: (body.brand_color as string) || undefined,
      });

      res.status(201).json(resource);
    } catch (err) {
      next(err);
    }
  }
);

merchantOnboardingRouter.get("/:id", (req, res) => {
  const resource = getMerchantOnboarding(req.params.id);
  if (!resource) {
    sendError(res, 404, {
      code: "BAD_REQUEST_ERROR",
      description: `No onboarding submission found for id "${req.params.id}"`,
      source: "business",
      step: "lookup",
      reason: "ONBOARDING_NOT_FOUND",
    });
    return;
  }
  res.json(resource);
});
