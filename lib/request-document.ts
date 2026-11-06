// Shared rules for POST /request-document (used by both the client form and the worker proxy).

export const SIGN_TYPES = ["PERSONAL", "BUSINESS"] as const;
export type SignType = (typeof SIGN_TYPES)[number];

export const FIELD_TYPES = ["SIGNATURE", "INITIAL", "STAMP"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const TAX_CODE_PATTERN = /^\d{10}(?:-\d{3})?$/;

export const ERROR_CODES = {
  INVALID_PARAM: "INVALID_PARAM",
  SIGNATURE_FIELDS_INVALID: "E_SIGN_SIGNATURE_FIELDS_INVALID",
  // Lỗi nghiệp vụ quan sát được trên sandbox (06/11/2026), chưa có trong spec:
  CERTIFICATE_NOT_FOUND: "E_SIGN_CERTIFICATE_NOT_FOUND",
  BUSINESS_NOT_FOUND: "E_SIGN_BUSINESS_NOT_FOUND",
} as const;

export type SignatureFieldPayload = {
  page: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fieldType?: string;
};

/** Error body format returned by the eSign API (always HTTP 400 for validation/business errors). */
export type ApiErrorBody = {
  requestId?: string;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
};

const isRatio = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

// Small epsilon so float noise (0.66 + 0.34 = 1.0000000000000002) never trips the overflow rule.
const EPSILON = 1e-9;

/**
 * Validate signatureFields according to the API rules.
 * Returns a list of human-readable problems (empty = valid).
 * `pageCount` is optional: when known (client side) pages beyond the document are rejected too.
 */
export function validateSignatureFields(input: unknown, pageCount?: number): string[] {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return ["signatureFields phải là chuỗi JSON array hợp lệ"];
    }
  }
  if (!Array.isArray(value)) return ["signatureFields phải là JSON array"];
  if (value.length === 0) return ["Cần ít nhất 1 vùng ký"];

  const problems: string[] = [];
  value.forEach((raw, index) => {
    const label = `Vùng ký ${index + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      problems.push(`${label}: không đúng định dạng object`);
      return;
    }
    const field = raw as Record<string, unknown>;
    const { page, xRatio, yRatio, widthRatio, heightRatio, fieldType } = field;

    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
      problems.push(`${label}: page phải là số nguyên ≥ 1`);
    } else if (pageCount && page > pageCount) {
      problems.push(`${label}: trang ${page} vượt quá số trang của tài liệu (${pageCount})`);
    }

    const ratios = { xRatio, yRatio, widthRatio, heightRatio };
    const badRatios = Object.entries(ratios).filter(([, v]) => !isRatio(v)).map(([k]) => k);
    if (badRatios.length) {
      problems.push(`${label}: ${badRatios.join(", ")} bắt buộc và nằm trong khoảng 0–1`);
    } else {
      if ((xRatio as number) + (widthRatio as number) > 1 + EPSILON) {
        problems.push(`${label}: tràn ngang ra ngoài trang (xRatio + widthRatio > 1)`);
      }
      if ((yRatio as number) + (heightRatio as number) > 1 + EPSILON) {
        problems.push(`${label}: tràn dọc ra ngoài trang (yRatio + heightRatio > 1)`);
      }
    }

    if (fieldType !== undefined && fieldType !== null) {
      if (typeof fieldType !== "string" || !FIELD_TYPES.includes(fieldType.toUpperCase() as FieldType)) {
        problems.push(`${label}: fieldType chỉ nhận SIGNATURE, INITIAL hoặc STAMP`);
      }
    }
  });
  return problems;
}

export function validateSignType(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !SIGN_TYPES.includes(value as SignType)) {
    return "signType chỉ nhận PERSONAL hoặc BUSINESS";
  }
  return null;
}

/** Round a ratio to 6 decimals, never rounding up (so x + w stays ≤ 1). */
export const floorRatio = (value: number): number => Math.max(0, Math.min(1, Math.floor(value * 1e6) / 1e6));

/** Gợi ý cách xử lý cho từng mã lỗi (hiện dưới khung lỗi). */
export const errorCodeTip = (code?: string): string | null => {
  switch (code) {
    case ERROR_CODES.SIGNATURE_FIELDS_INVALID:
      return "Kiểm tra lại vị trí và kích thước các vùng ký ở Bước 3: khung ký phải nằm trọn trong trang.";
    case ERROR_CODES.CERTIFICATE_NOT_FOUND:
      return "Người ký chưa có chứng thư số cho loại ký / doanh nghiệp đã chọn. Kiểm tra lại mã số thuế, hoặc chọn loại ký khác.";
    case ERROR_CODES.BUSINESS_NOT_FOUND:
      return "Mã số thuế không khớp doanh nghiệp nào của người ký. Kiểm tra lại mã số thuế, hoặc để trống.";
    default:
      return null;
  }
};

/** Human labels for API error codes. */
export const describeErrorCode = (code?: string): string | null => {
  switch (code) {
    case ERROR_CODES.INVALID_PARAM:
      return "Dữ liệu gửi lên chưa đúng định dạng";
    case ERROR_CODES.SIGNATURE_FIELDS_INVALID:
      return "Vùng ký không hợp lệ";
    case ERROR_CODES.CERTIFICATE_NOT_FOUND:
      return "Người ký chưa có chứng thư số phù hợp";
    case ERROR_CODES.BUSINESS_NOT_FOUND:
      return "Không tìm thấy doanh nghiệp theo mã số thuế";
    default:
      return null;
  }
};
