#!/usr/bin/env bash
# Script test webhook local cho CAS Sign

PORT=${1:-3001}
TOKEN="82f6e4f0437b7f5b406356a8f148e16dd9c7c8853173f313d12763e47da9122a"
BASE_URL="http://localhost:$PORT/api/esign"

echo "==========================================="
echo "  TEST WEBHOOK LOCAL (Port $PORT)"
echo "==========================================="

echo -e "\n1. [GET] Ping kiểm tra webhook hoạt động:"
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/webhook?token=$TOKEN"

echo -e "\n2. [POST] Giả lập BankHub gửi callback COMPLETED:"
SIGN_ID="test-local-$(date +%s)"
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$BASE_URL/webhook?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"webhookType\":\"SIGN\",\"webhookCode\":\"DEFAULT_UPDATE\",\"signRequestId\":\"$SIGN_ID\",\"state\":\"COMPLETED\"}"

echo -e "\n3. [GET] Kiểm tra trạng thái đã được lưu trong DB/Cache local ($SIGN_ID):"
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/status/$SIGN_ID"

echo -e "\n==========================================="
echo "  Hoàn tất kiểm tra!"
echo "==========================================="
