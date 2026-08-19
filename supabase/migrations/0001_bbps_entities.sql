-- BBPS bill_requests + payments persistence.
--
-- Run this once against your Supabase project (SQL editor, or
-- `supabase db push` if you use the CLI locally) before setting
-- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — see src/store/
-- supabaseClient.ts, src/store/billRequestStore.ts, src/store/paymentStore.ts.
--
-- The full merchant-facing JSON resource (exactly what the API returns) is
-- kept in the `resource` jsonb column on each table, so this is always a
-- faithful record of what a partner/customer was shown. A handful of fields
-- are pulled out into real columns purely so they're indexable/queryable —
-- most importantly `customer_mobile`, which is how "everything fetched and
-- paid by this user" (GET /v1/bill_payments/bill_requests?customer_mobile=,
-- GET /v1/bill_payments/payments?customer_mobile=) gets answered without a
-- full-table jsonb scan.
--
-- This server talks to these tables with the service_role key (see
-- src/config/env.ts) and does its own authorization via merchant Basic Auth,
-- so RLS is enabled with no permissive policies — nothing should ever read
-- these tables through the anon/public Supabase client.

create table if not exists bbps_bill_requests (
  id text primary key,                      -- e.g. billreq_xxxxxxxx
  customer_mobile text,
  customer_name text,
  biller_id text not null,
  gateway_biller_id text,
  status text not null,                     -- processing | success | failed
  resource jsonb not null,                  -- full BillRequestResource, as returned to the merchant
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  expires_at timestamptz                    -- bill-fetch results are short-lived; see BILL_REQUEST_TTL_MS
);

create index if not exists bbps_bill_requests_customer_mobile_idx
  on bbps_bill_requests (customer_mobile, created_at desc);

create table if not exists bbps_payments (
  id text primary key,                      -- e.g. pay_xxxxxxxx
  customer_mobile text,
  customer_name text,
  biller_id text,
  gateway_biller_id text,
  status text not null,                     -- processing | success | failed
  bill_pay_amount bigint not null,          -- paise
  currency text not null,
  gateway_transaction_id text,
  txn_reference_id text,                    -- NPCI-internal id; what a CMS complaint (xchangeId 501) is filed against.
                                             -- Not part of the merchant-facing contract, so it's not inside `resource`.
  resource jsonb not null,                  -- full PaymentResource, as returned to the merchant
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists bbps_payments_customer_mobile_idx
  on bbps_payments (customer_mobile, created_at desc);

alter table bbps_bill_requests enable row level security;
alter table bbps_payments enable row level security;
