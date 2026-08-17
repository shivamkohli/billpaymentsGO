#!/usr/bin/env bash
#
# Walks the full merchant-partner flow — list billers -> create bill_request
# (fetch) -> pay -> file a complaint -> poll complaint status — against a
# locally running bbps-go server in BBPS_MODE=mock.
#
# Usage:
#   npm run dev &        # or: npm run build && npm start
#   ./scripts/demo.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
KEY_ID="${RZP_BILLPAY_KEY_ID:-rzp_test_billpay_key}"
KEY_SECRET="${RZP_BILLPAY_KEY_SECRET:-rzp_test_billpay_secret}"
AUTH=(-u "${KEY_ID}:${KEY_SECRET}")

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 1; }; }
need curl
need jq

step() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

step "Health check"
curl -s "$BASE_URL/health" | jq .

step "List billers (GET /v1/bill_payments/billers)"
curl -s "${AUTH[@]}" "$BASE_URL/v1/bill_payments/billers" | jq .

step "Create a bill_request for MSEDCL (fetch-required biller) (POST /v1/bill_payments/bill_requests)"
BILL_REQUEST=$(curl -s "${AUTH[@]}" -X POST "$BASE_URL/v1/bill_payments/bill_requests" \
  -H 'Content-Type: application/json' \
  -d '{
        "biller_id": "MSEB00000NAT01",
        "customer": { "name": "Demo User", "mobile": "9876543210", "email": "demo@example.com" },
        "device": { "initiating_channel": "INT", "ip": "127.0.0.1" }
      }')
echo "$BILL_REQUEST" | jq .
BILL_REQUEST_ID=$(echo "$BILL_REQUEST" | jq -r .id)
BILL_AMOUNT=$(echo "$BILL_REQUEST" | jq -r '.bills[0].amount')

step "Fetch the bill_request back (GET /v1/bill_payments/bill_requests/{id})"
curl -s "${AUTH[@]}" "$BASE_URL/v1/bill_payments/bill_requests/$BILL_REQUEST_ID" | jq .

step "Pay the bill (POST /v1/bill_payments/payments)"
PAYMENT=$(curl -s "${AUTH[@]}" -X POST "$BASE_URL/v1/bill_payments/payments" \
  -H 'Content-Type: application/json' \
  -d "{
        \"bill_request_id\": \"$BILL_REQUEST_ID\",
        \"bill_pay_amount\": $BILL_AMOUNT,
        \"currency\": \"INR\",
        \"fees\": { \"app_convenience_fee\": 0, \"biller_convenience_fee\": 0 },
        \"payments\": [{ \"id\": \"leg_1\", \"provider\": \"razorpay\", \"amount\": $BILL_AMOUNT, \"currency\": \"INR\", \"method\": \"upi\", \"upi\": { \"vpa\": \"demo@upi\" } }],
        \"bills\": [{ \"bill_number\": \"MOCKBILL0\", \"amount\": $BILL_AMOUNT, \"currency\": \"INR\" }],
        \"customer\": { \"name\": \"Demo User\", \"mobile\": \"9876543210\" },
        \"biller_id\": \"MSEB00000NAT01\"
      }")
echo "$PAYMENT" | jq .
PAYMENT_ID=$(echo "$PAYMENT" | jq -r .id)

step "Trigger a DECLINED payment on purpose (mock decline rule: amount ending in '13')"
curl -s "${AUTH[@]}" -X POST "$BASE_URL/v1/bill_payments/payments" \
  -H 'Content-Type: application/json' \
  -d '{
        "bill_request_id": "'"$BILL_REQUEST_ID"'",
        "bill_pay_amount": 13,
        "currency": "INR",
        "fees": { "app_convenience_fee": 0, "biller_convenience_fee": 0 },
        "payments": [{ "id": "leg_2", "provider": "razorpay", "amount": 13, "currency": "INR", "method": "upi", "upi": { "vpa": "demo@upi" } }],
        "bills": [{ "bill_number": "MOCKBILL0", "amount": 13, "currency": "INR" }],
        "customer": { "name": "Demo User", "mobile": "9876543210" },
        "biller_id": "MSEB00000NAT01"
      }' | jq .

step "File a complaint against the successful payment (POST /v1/bill_payments/complaints)"
COMPLAINT=$(curl -s "${AUTH[@]}" -X POST "$BASE_URL/v1/bill_payments/complaints" \
  -H 'Content-Type: application/json' \
  -d "{
        \"biller_id\": \"MSEB00000NAT01\",
        \"bill_payment_id\": \"$PAYMENT_ID\",
        \"complaint_type\": \"Erroneously paid in wrong account\",
        \"complaint_description\": \"Demo complaint from scripts/demo.sh\"
      }")
echo "$COMPLAINT" | jq .
COMPLAINT_ID=$(echo "$COMPLAINT" | jq -r .id)

step "Poll the complaint status (GET /v1/bill_payments/complaints/{id}) — re-runs CMS status enquiry each time"
for i in 1 2 3; do
  curl -s "${AUTH[@]}" "$BASE_URL/v1/bill_payments/complaints/$COMPLAINT_ID" | jq .
  sleep 0.3
done

step "Done"
echo "bill_request: $BILL_REQUEST_ID"
echo "payment:      $PAYMENT_ID"
echo "complaint:    $COMPLAINT_ID"
