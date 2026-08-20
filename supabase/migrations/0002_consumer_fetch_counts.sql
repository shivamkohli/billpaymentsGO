-- Durable cap on real production consumer-data fetches.
--
-- Business rule (see CLAUDE.md "Production Razorpay BBPS API — usage
-- constraints"): a given (biller, consumer) pair may have its bill/consumer
-- data fetched against the REAL Razorpay production BBPS API at most 4 times,
-- ever — across all sessions and process restarts, not just per-day or
-- per-deploy. This table is the only source of truth for that count; the
-- in-memory fallback (src/store/consumerFetchCountStore.ts, used when
-- Supabase isn't configured) does NOT satisfy this requirement on its own
-- since it resets on restart — see the loud warning logged there.
--
-- `consumer_identifier` is a canonical string built from the customer/account
-- params carried in the BBPS request (e.g. consumer number), NOT the
-- customer's mobile number — see computeConsumerIdentifier() in
-- src/gateway/productionBbpcuClient.ts.

create table if not exists bbps_consumer_fetch_counts (
  biller_id text not null,              -- gateway_biller_id of the biller fetched against
  consumer_identifier text not null,    -- canonical string of the consumer/account params used for this fetch
  fetch_count integer not null default 0,
  first_fetched_at timestamptz not null default now(),
  last_fetched_at timestamptz not null default now(),
  primary key (biller_id, consumer_identifier)
);

alter table bbps_consumer_fetch_counts enable row level security;
