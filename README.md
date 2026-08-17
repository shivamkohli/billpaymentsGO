# bbps-go

A backend that lets merchant partners integrate against a stable Razorpay
BBPS REST/JSON API today, while the actual downstream connection to NPCI's
BBPCU (Bharat Bill Pay Central Unit) is still being provisioned. It is built
around one design goal:

> The moment Razorpay is issued a real BBPS API key/secret, flipping
> `BBPS_MODE=live` + filling in `.env` is the **only** change required.
> No mapping, orchestration, or route code changes.

## Why this exists

The NPCI **BBPS API Specifications v14.0** define a signed-XML wire protocol
between a Customer BBPOU (Razorpay, as a COU), BBPCU, and the Biller BBPOU.
That protocol is not what merchant partners should have to speak — they want
a simple, stable REST/JSON API (`bill_requests` / `payments` / `complaints`),
matching Razorpay's existing API conventions.

This repo is the translation layer between those two worlds, plus a mock
BBPCU responder so the whole flow is demoable end-to-end without any real
NPCI credentials.

## Architecture

```
merchant JSON  <-->  mapping/*.mapper.ts  <-->  types/npci.ts (domain)  <-->  xml/{builder,parser,signer}.ts  <-->  gateway/*  <-->  BBPCU / mock
   (types/merchant.ts)                                                                                          (BbpcuClient)
```

- **`src/types/`** — two independent sets of plain TS interfaces:
  - `merchant.ts`: the Razorpay-facing REST DTOs (`bill_payment.bill_request`,
    `bill_payment.payment`, `bill_payment.complaint`, `BillerResource`, the
    standard `{error:{...}}` envelope).
  - `npci.ts`: clean domain mirrors of the NPCI XML message contracts
    (`NpciBillFetchRequest`, `NpciBillPaymentResponse`,
    `NpciTxnStatusComplainReq`, ...). Nothing outside `xml/` knows these are
    ultimately XML — no `@_`-attribute encoding leaks past this boundary.

- **`src/ids/generator.ts`** — NPCI Section 20 BBPS ID generation (Message
  ID / Reference ID / Transaction Reference ID / Complaint ID / Agent ID, all
  with embedded Julian-date components), plus a merchant-facing entity-id
  helper (`billreq_...`, `pay_...`, `complaint_...`).

- **`src/xml/`** — the only code that touches raw XML:
  - `builder.ts` / `parser.ts`: `NpciXxx` domain object <-> XML string, both
    directions (so the same builders/parsers serve outbound requests *and*
    the mock's synthesized responses).
  - `signer.ts`: `XmlSigner` interface. `NoopSigner` (default, logs a loud
    warning, used in mock mode) vs. a stubbed `RsaSha256XmlDsigSigner` that
    throws until real signing certs exist — see "Going live" below.

- **`src/mapping/`** — the actual merchant-JSON <-> NPCI-domain translation:
  - `billerRegistry.ts`: sample Biller MDM data + the fetch/validate/adhoc
    routing decision (`decideBillRequestKind`).
  - `common.ts`: shared `<Head>`/id-generation helpers and NPCI-`<Reason>` ->
    merchant-error-envelope translation.
  - `billRequest.mapper.ts`, `payment.mapper.ts`, `complaint.mapper.ts`: one
    pair of functions per resource — `xxxInputToNpciRequest()` and
    `npciResponseToXxxResource()`.

- **`src/gateway/`** — `BbpcuClient` interface (operates on already-built,
  already-signed XML strings — “the BBPS network”, whatever’s behind it):
  - `mockBbpcuClient.ts`: simulates BBPCU + Biller BBPOU in-process,
    deterministically, for demo/tests.
  - `npciHttpBbpcuClient.ts`: real implementation, intentionally left
    throwing until BBPCU/aggregator onboarding gives us endpoint paths + auth
    scheme.
  - `index.ts`: `getBbpcuClient()` — the single seam that picks Mock vs. Live
    based on `config.bbpsMode`.

- **`src/orchestration/`** — one service per resource
  (`billRequestService.ts`, `paymentService.ts`, `complaintService.ts`):
  generates the entity id, calls the mapper -> builds/signs XML -> calls the
  gateway client -> parses the response -> maps back -> persists in
  `src/store/memoryStore.ts` (in-memory stand-in for a real DB).

- **`src/http/`** — Express app: Basic-Auth middleware
  (`RZP_BILLPAY_KEY_ID`/`SECRET`), routes under `/v1/bill_payments/*`, and the
  standard `{error:{...}}` envelope for failures.

- **`src/config/credentials.ts`** — `CredentialsProvider` interface. Nothing
  else in the codebase reads `process.env` for BBPS_* values directly; they
  all go through this. `EnvCredentialsProvider` returns `null` until every
  required `BBPS_*` env var is populated, which is what makes
  `getBbpcuClient()` and the signer selection safely fail back to mock/Noop
  today.

## Endpoints

All under `/v1/bill_payments`, Basic Auth (`curl -u KEY_ID:KEY_SECRET`):

| Method & path | Purpose |
|---|---|
| `GET /billers` | List the biller catalogue (`?category=` filter) |
| `GET /billers/categories` | List biller categories |
| `GET /billers/:id` | Get one biller |
| `POST /bill_requests` | Fetch/validate a bill (routes to NPCI `BillFetch`/`BillValidation` per biller config, or `adhoc_only` if unsupported) |
| `GET /bill_requests/:id` | Poll a bill_request |
| `POST /payments` | Pay a bill (NPCI `BillPaymentRequest`) |
| `GET /payments/:id` | Poll a payment |
| `POST /complaints` | Register a complaint (NPCI CMS xchangeId 501) |
| `GET /complaints/:id` | Poll a complaint — re-runs a live CMS status enquiry (xchangeId 506) each call |

`GET /health` is unauthenticated and reports the current `BBPS_MODE`.

### Merchant onboarding wizard (dashboard prototype)

`/v1/merchant_onboarding` is a separate, unauthenticated-in-this-prototype
namespace backing a small onboarding wizard (`public/onboarding.html`) styled
to loosely resemble the Razorpay dashboard — the idea being a merchant fills
this in *inside* dashboard.razorpay.com (behind normal dashboard session
auth, not a BBPS API key) to describe their business, pick which bill-payment
categories they want, upload a logo, and say whether they want a new
standalone app or an embedded section within their existing app (with deep
link / iOS Universal Link / Android App Link / package name / bundle ID).

It also asks a few optional questions so the eventual UI can feel native and
gets placed sensibly rather than bolted on:
- **Design system** — design system name, color hex codes, typography
  guidelines, primary button style, component libraries.
- **Entry point** — preferred label ("Pay Bills" / "Bharat Connect" /
  custom) and placement (home-dashboard button / quick-action shortcut /
  buried in a services sub-section / custom).
- **Receipt co-branding** — whether the confirmation/receipt screen should
  show the merchant's logo alongside the BBPS/Bharat Connect logo.

All three are optional — every field defaults to "no preference" (kept as
`undefined` in the response, never silently defaulted to a value) rather
than forcing an answer.

| Method & path | Purpose |
|---|---|
| `GET /v1/merchant_onboarding/categories` | List the BBPS category taxonomy for the multi-select |
| `POST /v1/merchant_onboarding` | Submit the wizard (`multipart/form-data`: `business_description`, repeated `categories`, `integration_mode`, optional `logo` file + `brand_color`; if `integration_mode=existing_app_section` then `deep_link`/`ios_universal_link`/`android_app_link`/`android_package_name`/`ios_bundle_id`; optionally `design_system_name`, repeated `color_hex_codes`, `typography_guidelines`, `primary_button_style`, `component_libraries`, `entry_point_label`(+`_other`), `entry_point_placement`(+`_other`), `receipt_co_branding`) |
| `GET /v1/merchant_onboarding/:id` | Fetch a submitted onboarding config back |

The response includes a `curated_offering` block that's honest about
coverage: each requested category is marked `live_sample_billers` (matches
one of the 4 sample billers in `billerRegistry.ts`) or `coming_soon` — it
never claims coverage that doesn't exist yet. This is a standalone prototype
only; it is not wired into the real Razorpay dashboard frontend, and does
not sit behind real dashboard session auth.

### Customer-facing bill-payment widget (prototype)

`public/billpay-widget.html` is what the *end customer* actually taps
through — as opposed to `onboarding.html`, which is what a *merchant*
fills in once, from inside the dashboard, to configure their account.
It's a narrow (~440px), chrome-light widget built to be dropped into a
merchant partner's existing app as an embedded section (per the
`integration_mode=existing_app_section` option in the onboarding wizard) —
via iframe or in-app WebView — rather than a full page with its own nav.

It drives the full customer journey against the real merchant-facing REST
API in this repo (same routes documented above, called client-side,
same-origin, Basic Auth): search/browse billers -> enter customer + any
biller-specific params (rendered dynamically from `customer_params`) ->
`POST bill_requests` -> review the fetched bill (or, for adhoc-only billers
like the sample Indane Gas biller, enter an amount directly) -> `POST
payments` (UPI or card, mocked) -> receipt -> `POST complaints` +
live status polling on failure.

No real BBPS/Bharat Connect brand guidelines exist yet, so every visual
token a brand guideline would dictate (primary color, radius, font,
logo, receipt co-branding) is a `--bbps-*` CSS custom property, overridable
three ways without touching markup: URL query params
(`?primary_color=...&merchant_logo=...`), a `postMessage({type:"bbps:theme",
theme:{...}})` call from a host page embedding it in an iframe, or the
in-page "Demo settings" gear (bottom-right) for clicking through a re-skin
live. When real guidelines land, only the CSS custom-property values at the
top of the file's `<style>` block change — same "flip a setting, not the
code" principle as `BBPS_MODE=live`.

Like the onboarding wizard, this is a standalone prototype: no host-app
integration exists, embedding a Basic Auth key/secret directly in browser
JS is demo-only (a production embed would have the host app's backend proxy
the call), and there's no CORS middleware configured (fine same-origin, as
served here from `public/`, but would need `cors` added to
`src/http/app.ts` for a genuinely cross-origin iframe embed).

## Running it

```bash
npm install
cp .env.example .env        # BBPS_MODE defaults to "mock"
npm run dev                 # ts-node-dev, hot reload
# or: npm run build && npm start
```

Open `http://localhost:4000/` for the API click-through demo,
`http://localhost:4000/onboarding.html` for the merchant onboarding wizard,
or `http://localhost:4000/billpay-widget.html` for the customer-facing
bill-payment widget.

Then either run the demo script (needs `curl` + `jq`):

```bash
./scripts/demo.sh
```

or call it directly:

```bash
curl -u rzp_test_billpay_key:rzp_test_billpay_secret \
  -X POST http://localhost:4000/v1/bill_payments/bill_requests \
  -H 'Content-Type: application/json' \
  -d '{"biller_id":"MSEB00000NAT01","customer":{"name":"Test User","mobile":"9876543210"},"device":{"initiating_channel":"INT"}}'
```

### Tests

```bash
npm test
```

Covers: BBPS id-generation format/length assertions (`test/ids.test.ts`),
merchant-JSON -> NPCI-XML -> merchant-JSON round-trips per resource
(`test/mapping.test.ts`), and a full supertest-driven HTTP flow against
`MockBbpcuClient` — bill_request -> payment (success + mock decline) ->
complaint -> status poll (`test/e2e.test.ts`).

## Going live

No BBPS API key/secret has been issued yet. When it is:

1. Fill in `.env` (`BBPS_ORIG_INST`, `BBPS_BBPOU_ID`, `BBPCU_BASE_URL`,
   `BBPS_API_KEY`, `BBPS_API_SECRET`, `BBPS_SIGNING_CERT_PATH`,
   `BBPS_SIGNING_KEY_PATH`, and `BBPS_MTLS_CA_PATH` if required).
2. Set `BBPS_MODE=live`.
3. Implement the two remaining stubs (both are written to throw a clear,
   actionable error until then, rather than silently doing the wrong thing):
   - `src/xml/signer.ts`'s `RsaSha256XmlDsigSigner` — wire in `xml-crypto`
     per the algorithm parameters documented in that file's comments
     (xml-c14n-20010315, rsa-sha256, sha256 digest, enveloped-signature
     transform, per NPCI spec Section 13).
   - `src/gateway/npciHttpBbpcuClient.ts` — fill in the actual HTTP calls
     once BBPCU/aggregator onboarding provides endpoint paths + auth scheme.

Everything upstream of those two files — mapping, orchestration, HTTP
routes — needs zero changes.

## Known simplifications (hackathon scope)

- `src/mapping/billerRegistry.ts` is a static sample dataset standing in for
  NPCI's `<BBPSPlanMDMPush>` feed.
- `src/store/memoryStore.ts` is in-process and non-persistent — restart the
  server and all bill_requests/payments/complaints are gone.
- `src/mapping/common.ts`'s NPCI-response-code -> merchant-error mapping
  intentionally does not hardcode NPCI's full ~90-code response table; it
  degrades to a generic error carrying the raw NPCI code/reason as metadata.
- `MockBbpcuClient`'s decline rule ("amount ends in 13") and complaint status
  progression are deliberately simple/deterministic for demoing and testing,
  not a simulation of real BBPCU decision logic.
- The merchant onboarding wizard (`/v1/merchant_onboarding`, `public/onboarding.html`)
  is an unauthenticated standalone prototype, not a real dashboard integration —
  see the note in `src/http/routes/merchantOnboarding.ts`. Uploaded logos are
  written to `public/uploads/` on local disk, not object storage.
- The customer bill-payment widget (`public/billpay-widget.html`) embeds a
  Basic Auth key/secret in client-side JS and calls the API same-origin with
  no CORS middleware configured — both fine for this same-origin prototype,
  neither is the pattern a real cross-origin embed would use (see the note
  at the top of that file). Its "brand guideline" theming is placeholder
  values pending the real BBPS/Bharat Connect guidelines.
