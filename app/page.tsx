"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  GripVertical,
  Info,
  LoaderCircle,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { clearSessionState, loadSessionState, saveSessionState } from "./session-storage";
import {
  ERROR_CODES,
  FIELD_TYPES,
  TAX_CODE_PATTERN,
  describeErrorCode,
  errorCodeTip,
  floorRatio,
  validateSignatureFields,
  type ApiErrorBody,
  type FieldType,
  type SignType,
} from "../lib/request-document";

type SignatureField = {
  id: string;
  page: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fieldType: FieldType;
};

/** "" = không chỉ định signType, người ký tự chọn loại ký trên Cas ID. */
type SignTypeChoice = "" | SignType;

const SIGN_TYPE_OPTIONS: Array<{ value: SignTypeChoice; label: string; hint: string }> = [
  { value: "", label: "Tự chọn", hint: "Không gửi signType. Người ký tự chọn ký cá nhân hoặc doanh nghiệp trên Cas ID." },
  { value: "PERSONAL", label: "Cá nhân", hint: "Bắt buộc ký bằng chứng thư cá nhân. Người ký không được đổi loại ký." },
  { value: "BUSINESS", label: "Doanh nghiệp", hint: "Bắt buộc ký bằng chứng thư doanh nghiệp. Người ký không được đổi loại ký." },
];

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  SIGNATURE: "Chữ ký",
  INITIAL: "Ký nháy",
  STAMP: "Con dấu",
};

type ErrorDetail = {
  title: string;
  code?: string;
  requestId?: string;
  items: string[];
};

class ApiRequestError extends Error {
  detail: ErrorDetail;
  constructor(detail: ErrorDetail) {
    super(detail.items[0] ? `${detail.title}: ${detail.items.join("; ")}` : detail.title);
    this.detail = detail;
  }
}

/** Read the eSign error body { requestId, errorType, errorCode, errorMessage } into a structured error. */
const parseApiError = async (response: Response, fallbackMessage: string): Promise<ApiRequestError> => {
  const traceId = response.headers.get("x-cas-trace-id") || undefined;
  let body: (ApiErrorBody & { message?: string; traceId?: string }) | null = null;
  try {
    const text = await response.clone().text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!body || (!body.errorCode && !body.errorMessage)) {
    const message = await parseResponseErrorMessage(response, fallbackMessage);
    return new ApiRequestError({ title: message, items: [], requestId: body?.requestId || traceId });
  }
  const code = body.errorCode;
  const rawMessage = (body.errorMessage || "").trim();
  // INVALID_PARAM gộp nhiều lỗi bằng dấu phẩy -> tách thành từng dòng.
  const items = code === ERROR_CODES.INVALID_PARAM
    ? rawMessage.split(",").map((item) => item.trim()).filter(Boolean)
    : rawMessage ? [rawMessage] : [];
  const title = describeErrorCode(code) || (code ? "Hệ thống ký từ chối yêu cầu" : fallbackMessage);
  return new ApiRequestError({ title, code, requestId: body.requestId || body.traceId || traceId, items });
};

type FormState = {
  identificationNumber: string;
  documentName: string;
  organizationName: string;
  taxCode: string;
};

const initialForm: FormState = {
  identificationNumber: "",
  documentName: "",
  organizationName: "Cas Sign",
  taxCode: "",
};

const createSignRequestId = (): string =>
  `CAS-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const normalizeDocumentName = (value: string): string => value
  .replace(/[\u0000-\u001F\u007F]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const formatSignedFileName = (rawFileName: string): string => {
  if (!rawFileName || !rawFileName.trim()) return "cas_sign_signed.pdf";
  const baseName = rawFileName.replace(/\.pdf$/i, "").trim();
  let converted = baseName
    .replace(/[đĐ]/g, (match) => (match === "Đ" ? "D" : "d"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  converted = converted
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!converted) converted = "document";
  return `${converted}_signed.pdf`;
};

const parseResponseErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
  let traceId = response.headers.get("x-cas-trace-id") || "";
  let extractedMsg = "";

  try {
    const text = await response.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (json && typeof json === "object") {
          if (!traceId && json.traceId && typeof json.traceId === "string") {
            traceId = json.traceId;
          } else if (!traceId && json.requestId && typeof json.requestId === "string") {
            traceId = json.requestId;
          } else if (!traceId && json.request_id && typeof json.request_id === "string") {
            traceId = json.request_id;
          }

          if (typeof json.errorMessage === "string" && json.errorMessage.trim()) {
            extractedMsg = json.errorMessage.trim();
          } else if (typeof json.error_message === "string" && json.error_message.trim()) {
            extractedMsg = json.error_message.trim();
          } else if (typeof json.message === "string" && json.message.trim()) {
            extractedMsg = json.message.trim();
          } else if (typeof json.error === "string" && json.error.trim()) {
            extractedMsg = json.error.trim();
          } else if (json.error && typeof json.error === "object") {
            if (typeof json.error.errorMessage === "string" && json.error.errorMessage.trim()) {
              extractedMsg = json.error.errorMessage.trim();
            } else if (typeof json.error.error_message === "string" && json.error.error_message.trim()) {
              extractedMsg = json.error.error_message.trim();
            } else if (typeof json.error.message === "string" && json.error.message.trim()) {
              extractedMsg = json.error.message.trim();
            }
          }
        }
      } catch {
        if (text.length < 300 && !text.includes("<html") && !text.includes("<HTML")) {
          extractedMsg = text.trim();
        }
      }
    }
  } catch {
    // Reading body failed
  }

  if (response.status === 429) extractedMsg = "Hệ thống ký đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau ít phút (HTTP 429).";
  if (extractedMsg) return extractedMsg;
  if (response.status === 400) extractedMsg = "Dữ liệu yêu cầu không hợp lệ (HTTP 400).";
  else if (response.status === 401) extractedMsg = "Không có quyền truy cập. Vui lòng kiểm tra lại thông tin xác thực (HTTP 401).";
  else if (response.status === 403) extractedMsg = "Yêu cầu bị từ chối truy cập (HTTP 403).";
  else if (response.status === 404) extractedMsg = "Không tìm thấy dữ liệu hoặc điểm cuối API (HTTP 404).";
  else if (response.status === 413) extractedMsg = "Dung lượng dữ liệu gửi lên quá lớn (HTTP 413).";
  else if (response.status === 502) extractedMsg = "Máy chủ ký số không phản hồi hoặc gián đoạn kết nối (HTTP 502).";
  else if (response.status === 503) extractedMsg = "Dịch vụ ký số đang tạm thời bảo trì (HTTP 503).";
  else if (response.status === 504) extractedMsg = "Kết nối tới máy chủ ký số quá thời gian phản hồi (HTTP 504).";
  else if (response.status >= 500) extractedMsg = `${fallbackMessage} (Lỗi máy chủ HTTP ${response.status}).`;
  else extractedMsg = fallbackMessage;

  return traceId ? `${extractedMsg} · Trace: ${traceId}` : extractedMsg;
};

const defaultField = (page = 1, index = 0): SignatureField => ({
  id: crypto.randomUUID(),
  page,
  xRatio: 0.52,
  yRatio: Math.min(0.82, 0.7 + (index % 3) * 0.1),
  widthRatio: 0.34,
  heightRatio: 0.1,
  fieldType: "SIGNATURE",
});

/** Normalise one field into API coordinates (origin bottom-left) and make sure it never overflows the page. */
const toPayloadField = (field: SignatureField) => {
  const widthRatio = floorRatio(field.widthRatio);
  const heightRatio = floorRatio(field.heightRatio);
  const xRatio = Math.min(floorRatio(field.xRatio), floorRatio(1 - widthRatio));
  const yRatio = Math.min(floorRatio(1 - field.yRatio - field.heightRatio), floorRatio(1 - heightRatio));
  return { page: field.page, xRatio, yRatio, widthRatio, heightRatio, fieldType: field.fieldType };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
      transform?: number[];
    }) => { promise: Promise<void>; cancel?: () => void };
  }>;
};

function RequestIdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="request-id-chip"
      title="Sao chép mã yêu cầu"
      onClick={() => {
        navigator.clipboard?.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span>Mã yêu cầu</span>
      <code>{id}</code>
      {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
    </button>
  );
}

function PdfPage({ pdf, pageNumber, fields, selectedId, invalidIds, locked, onSelect, onMove, onResize, onDelete }: {
  pdf: PdfDocumentProxy;
  pageNumber: number;
  fields: SignatureField[];
  selectedId: string | null;
  invalidIds: Set<string>;
  locked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | undefined;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(1.35, 760 / base.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) return;
        renderTask = page.render({ canvasContext: context, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
        await renderTask.promise;
      } catch (error) {
        // Huỷ render là bình thường khi đổi file (VD: thay bằng bản đã ký) hoặc unmount trang.
        const name = (error as { name?: string } | null)?.name;
        if (cancelled || name === "RenderingCancelledException") return;
        console.warn(`[pdf] render page ${pageNumber} failed`, error);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pdf, pageNumber]);

  const startDrag = (event: React.PointerEvent, field: SignatureField) => {
    if (locked) return;
    event.preventDefault();
    onSelect(field.id);
    const pageEl = pageRef.current;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - field.xRatio * rect.width;
    const offsetY = event.clientY - rect.top - field.yRatio * rect.height;
    const move = (e: PointerEvent) => {
      const x = Math.max(0, Math.min(1 - field.widthRatio, (e.clientX - rect.left - offsetX) / rect.width));
      const y = Math.max(0, Math.min(1 - field.heightRatio, (e.clientY - rect.top - offsetY) / rect.height));
      onMove(field.id, x, y);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const startResize = (event: React.PointerEvent, field: SignatureField) => {
    if (locked) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(field.id);
    const pageEl = pageRef.current;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const resize = (e: PointerEvent) => {
      const width = Math.max(0.16, Math.min(1 - field.xRatio, (e.clientX - rect.left) / rect.width - field.xRatio));
      const height = Math.max(0.055, Math.min(0.22, (e.clientY - rect.top) / rect.height - field.yRatio));
      onResize(field.id, width, height);
    };
    const stop = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div className="pdf-page-wrap" id={`pdf-page-${pageNumber}`}>
      <div className="page-number">Trang {pageNumber}</div>
      <div className="pdf-page" ref={pageRef}>
        <canvas ref={canvasRef} />
        {fields.map((field, index) => (
          <div
            key={field.id}
            className={`signature-box ${selectedId === field.id ? "selected" : ""} ${locked ? "locked" : ""} ${invalidIds.has(field.id) ? "invalid" : ""} type-${field.fieldType.toLowerCase()}`}
            style={{
              left: `${field.xRatio * 100}%`,
              top: `${field.yRatio * 100}%`,
              width: `${field.widthRatio * 100}%`,
              height: `${field.heightRatio * 100}%`,
            }}
            onPointerDown={(e) => startDrag(e, field)}
            onKeyDown={(e) => { if (!locked && (e.key === "Enter" || e.key === " ")) onSelect(field.id); }}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked}
            aria-label={`Vùng ký ${index + 1} trên trang ${pageNumber}`}
          >
            <GripVertical size={16} />
            <span>{FIELD_TYPE_LABELS[field.fieldType] || "Chữ ký"} {index + 1}</span>
            {!locked && <button className="delete-signature" type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(field.id); }} aria-label={`Xoá vùng ký ${index + 1}`}><X size={13} /></button>}
            <span className="resize-handle" onPointerDown={(e) => startResize(e, field)} aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const documentScrollRef = useRef<HTMLDivElement>(null);
  // SSE effect gọi qua ref để luôn dùng bản doCheckStatus mới nhất (khai báo phía dưới).
  const doCheckStatusRef = useRef<(signRequestId: string) => Promise<boolean>>(async () => false);

  const [form, setForm] = useState(initialForm);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [signType, setSignType] = useState<SignTypeChoice>("");
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [originalFileName, setOriginalFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetPage, setTargetPage] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"draft" | "sent" | "processing" | "completed" | "rejected" | "error">("draft");
  const [message, setMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  // MST bị hệ thống ký từ chối (không tìm thấy DN / CTS) -> tô đỏ ô MST đến khi người dùng sửa.
  const [serverTaxError, setServerTaxError] = useState(false);
  const [signedAt, setSignedAt] = useState("");
  const [isSignedPreview, setIsSignedPreview] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isReplacingSignedFile, setIsReplacingSignedFile] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [keepAfterCancel, setKeepAfterCancel] = useState(true);
  const [checkNote, setCheckNote] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  // Mã yêu cầu đang theo dõi; dùng để bỏ qua kết quả trạng thái trả về sau khi đã huỷ.
  const activeRequestRef = useRef("");
  useEffect(() => {
    activeRequestRef.current = activeRequestId;
  }, [activeRequestId]);

  // QR Code Modal States
  const [qrUrl, setQrUrl] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [signToken, setSignToken] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Esc đóng popup QR
  useEffect(() => {
    if (!showQrModal) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setShowQrModal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showQrModal]);

  const selected = useMemo(() => fields.find((item) => item.id === selectedId), [fields, selectedId]);
  const isFileLocked = status === "sent" || status === "processing" || status === "rejected" || submitting;
  const isFormLocked = isFileLocked || status === "completed";
  const phase: "draft" | "waiting" | "finalizing" | "completed" | "rejected" = isReplacingSignedFile
    ? "finalizing"
    : status === "sent" || status === "processing" ? "waiting"
      : status === "completed" ? "completed"
        : status === "rejected" ? "rejected"
          : "draft";
  const validationErrors = useMemo(() => {
    const errors: Partial<Record<keyof FormState | "file" | "fields", string>> = {};
    if (!form.organizationName.trim()) errors.organizationName = "Vui lòng nhập Gửi từ yêu cầu.";
    const documentName = normalizeDocumentName(form.documentName);
    if (!documentName) errors.documentName = "Vui lòng nhập tên tài liệu.";
    else if (documentName.length < 10) errors.documentName = "Tên tài liệu phải từ 10 ký tự trở lên.";
    else if (documentName.length > 200) errors.documentName = "Tên tài liệu không được vượt quá 200 ký tự.";
    if (signType === "BUSINESS") {
      const taxCode = form.taxCode.trim();
      if (taxCode && !TAX_CODE_PATTERN.test(taxCode)) errors.taxCode = "Mã số thuế gồm 10 số hoặc 10 số-3 số (VD: 0123456789-001).";
    }
    if (!file) errors.file = "Vui lòng tải lên file PDF.";
    else if (file.size > 20 * 1024 * 1024) errors.file = "File PDF không được vượt quá 20 MB.";
    if (fields.length === 0) errors.fields = "Cần đặt ít nhất một vùng ký.";
    else {
      const fieldProblems = validateSignatureFields(fields.map(toPayloadField), pageCount || undefined);
      if (fieldProblems.length) errors.fields = fieldProblems[0];
    }
    return errors;
  }, [fields, file, form, signType, pageCount]);
  const invalidFieldIds = useMemo(() => new Set(
    fields.filter((field) => validateSignatureFields([toPayloadField(field)], pageCount || undefined).length > 0).map((field) => field.id),
  ), [fields, pageCount]);
  const canSubmit = Object.keys(validationErrors).length === 0 && !isFileLocked;
  const validationHint = Object.values(validationErrors)[0];

  // Restore session from IndexedDB on component mount
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const saved = await loadSessionState();
        if (!saved || isCancelled) return;

        if (saved.form) setForm(saved.form);
        if (saved.signType !== undefined) setSignType(saved.signType);
        else if (saved.isBusinessSigning) setSignType("BUSINESS");
        if (saved.originalFileName) setOriginalFileName(saved.originalFileName);
        if (saved.activeRequestId) setActiveRequestId(saved.activeRequestId);
        if (saved.status) setStatus(saved.status);
        if (saved.message) setMessage(saved.message);
        if (saved.signedAt) setSignedAt(saved.signedAt);
        if (saved.isSignedPreview !== undefined) setIsSignedPreview(saved.isSignedPreview);
        if (saved.fields) setFields(saved.fields.map((field) => ({ ...field, fieldType: FIELD_TYPES.includes(field.fieldType) ? field.fieldType : "SIGNATURE" })));
        if (saved.qrContent) setQrContent(saved.qrContent);
        if (saved.signToken) setSignToken(saved.signToken);
        if (saved.qrUrl) setQrUrl(saved.qrUrl);

        if (saved.fileBuffer && saved.fileBuffer.byteLength > 0) {
          setLoadingPdf(true);
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
          const fileObj = new File([saved.fileBuffer], saved.originalFileName || "document.pdf", { type: "application/pdf" });
          const loaded = await pdfjs.getDocument({ data: saved.fileBuffer.slice(0) }).promise;
          if (!isCancelled) {
            setFile(fileObj);
            setPdf(loaded as unknown as PdfDocumentProxy);
            setPageCount(loaded.numPages);
          }
        }
      } catch (e) {
        console.warn("Restore session error", e);
      } finally {
        if (!isCancelled) setLoadingPdf(false);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Real-time SSE listener for instant webhook push updates (no loop polling)
  useEffect(() => {
    if (!activeRequestId || !["sent", "processing"].includes(status) || isReplacingSignedFile) {
      return;
    }

    let eventSource: EventSource | null = null;
    let isCancelled = false;

    try {
      eventSource = new EventSource(`/api/esign/stream/${encodeURIComponent(activeRequestId)}`);
      eventSource.onopen = () => {
        if (!isCancelled) setLiveConnected(true);
      };

      eventSource.onmessage = async (event) => {
        if (isCancelled || !event.data || event.data.trim() === "" || event.data.startsWith(":")) return;
        try {
          const data = JSON.parse(event.data);
          const nextState = String(data.state || "").toUpperCase();
          if (["COMPLETED", "REJECTED"].includes(nextState)) {
            await doCheckStatusRef.current(activeRequestId);
          }
        } catch {
          // ignore non-json ping
        }
      };

      eventSource.onerror = () => {
        if (!isCancelled) setLiveConnected(false);
        if (eventSource) eventSource.close();
      };
    } catch {
      // fallback
    }

    return () => {
      isCancelled = true;
      setLiveConnected(false);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [activeRequestId, status, isReplacingSignedFile]);

  const replaceWithSignedPdf = async (options: { identityKey?: string; url?: string }, signRequestId: string) => {
    const query = options.identityKey
      ? `identityKey=${encodeURIComponent(options.identityKey)}`
      : `url=${encodeURIComponent(options.url || "")}`;
    const response = await fetch(`/api/esign/signed-file?${query}`, { cache: "no-store" });
    if (!response.ok) {
      const errorMsg = await parseResponseErrorMessage(response, "Không thể tải bản PDF đã ký để hiển thị.");
      throw new Error(errorMsg);
    }
    const blob = await response.blob();
    const downloadName = formatSignedFileName(originalFileName || file?.name || form.documentName || signRequestId);
    const signedFile = new File([blob], downloadName, { type: "application/pdf" });
    const buffer = await signedFile.arrayBuffer();

    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const loaded = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;

    setFile(signedFile);
    setPdf(loaded as unknown as PdfDocumentProxy);
    setPageCount(loaded.numPages);
    setFields([]);
    setSelectedId(null);
    setIsSignedPreview(true);

    await saveSessionState({
      fileBuffer: buffer,
      originalFileName: downloadName,
      isSignedPreview: true,
      fields: [],
      status: "completed",
    });
  };

  const doCheckStatus = async (signRequestId: string): Promise<boolean> => {
    if (!signRequestId) return false;
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/esign/status/${encodeURIComponent(signRequestId)}`, { cache: "no-store" });
      if (!response.ok) {
        setCheckNote("Chưa thể kiểm tra trạng thái lúc này. Vui lòng thử lại sau.");
        return false;
      }
      const result = (await response.json()) as Record<string, unknown>;
      if (activeRequestRef.current !== signRequestId) return false; // yêu cầu đã bị huỷ trong lúc chờ phản hồi
      const signStatus = (result.signRequestStatus || (result.signRequestId || result.state ? result : result.data)) as Record<string, unknown> | undefined;
      const nextState = typeof signStatus?.state === "string" ? signStatus.state.toUpperCase() : undefined;
      const targetKey = typeof signStatus?.identityKey === "string" ? signStatus.identityKey : undefined;
      const targetUrl = typeof signStatus?.signedFileUrl === "string" ? signStatus.signedFileUrl : undefined;

      if (nextState === "COMPLETED") {
        const signedTimestamp = (signStatus?.signedAt as string) || (signStatus?.lastUpdatedAt as string) || new Date().toISOString();

        if (targetKey || targetUrl) {
          setIsReplacingSignedFile(true);
          setStatus("processing");
          setMessage("Đã ký hoàn tất. Đang cập nhật bản PDF đã ký...");
          try {
            await new Promise((resolve) => setTimeout(resolve, 300));
            await replaceWithSignedPdf({ identityKey: targetKey, url: targetUrl }, signRequestId);
            setStatus("completed");
            setSignedAt(signedTimestamp);
            setMessage("Tài liệu đã ký hoàn tất. Bản xem trước đã được cập nhật.");
            await saveSessionState({
              status: "completed",
              signedAt: signedTimestamp,
              message: "Tài liệu đã ký hoàn tất. Bản xem trước đã được cập nhật.",
              isSignedPreview: true,
            });
          } catch (error) {
            setStatus("completed");
            setMessage(error instanceof Error ? error.message : "Đã ký xong nhưng chưa thể hiển thị file đã ký.");
          } finally {
            setIsReplacingSignedFile(false);
          }
        } else {
          setStatus("completed");
          setSignedAt(signedTimestamp);
          setMessage("Tài liệu đã ký hoàn tất.");
          await saveSessionState({
            status: "completed",
            signedAt: signedTimestamp,
            message: "Tài liệu đã ký hoàn tất.",
          });
        }

        // Auto close QR popup after completion
        setTimeout(() => {
          setShowQrModal(false);
        }, 1200);

        return true;
      }

      if (["REJECTED", "FAILED", "CANCELLED", "EXPIRED"].includes(nextState || "")) {
        const rejectMsg = nextState === "REJECTED"
          ? `Người ký đã từ chối yêu cầu ký.${signStatus?.rejectedReason ? ` Lý do: ${signStatus.rejectedReason}` : ""}`
          : `Yêu cầu ký đã kết thúc với trạng thái ${nextState}.`;
        setStatus(nextState === "REJECTED" ? "rejected" : "error");
        setMessage(rejectMsg);
        await saveSessionState({
          status: nextState === "REJECTED" ? "rejected" : "error",
          message: rejectMsg,
        });
        setTimeout(() => {
          setShowQrModal(false);
        }, 1500);
        return true;
      }

      setStatus("processing");
      setCheckNote(`Chưa có kết quả ký${nextState ? ` (${nextState})` : ""} · kiểm tra lúc ${new Date().toLocaleTimeString("vi-VN")}`);
      return false;
    } catch {
      setCheckNote("Không thể kết nối máy chủ để kiểm tra trạng thái.");
      return false;
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    doCheckStatusRef.current = doCheckStatus;
  });

  const checkStatusNow = async () => {
    if (!activeRequestId || checkingStatus) return;
    await doCheckStatus(activeRequestId);
  };

  const copyQrLink = () => {
    if (!qrContent) return;
    navigator.clipboard.writeText(qrContent);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const setValue = (key: keyof FormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      saveSessionState({ form: next });
      return next;
    });
    if (!["sent", "processing", "completed", "rejected"].includes(status)) setStatus("draft");
  };

  const touchField = (key: keyof FormState) => setTouched((prev) => ({ ...prev, [key]: true }));

  const loadFile = async (nextFile: File) => {
    if (nextFile.type !== "application/pdf") {
      setStatus("error");
      setMessage("Vui lòng chọn đúng định dạng PDF.");
      return;
    }
    if (nextFile.size > 20 * 1024 * 1024) {
      setStatus("error");
      setMessage("File PDF không được vượt quá 20 MB.");
      return;
    }
    setLoadingPdf(true);
    setStatus("draft");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = await nextFile.arrayBuffer();
      const loaded = await pdfjs.getDocument({ data: data.slice(0) }).promise;
      setOriginalFileName(nextFile.name);
      setFile(nextFile);
      setPdf(loaded as unknown as PdfDocumentProxy);
      setPageCount(loaded.numPages);
      setIsSignedPreview(false);
      setFields([]);
      setSelectedId(null);
      setTargetPage(1);
      const nextForm = { ...form, documentName: nextFile.name.replace(/\.pdf$/i, "") };
      setForm(nextForm);
      setTouched((prev) => ({ ...prev, documentName: true }));

      await saveSessionState({
        fileBuffer: data,
        originalFileName: nextFile.name,
        isSignedPreview: false,
        status: "draft",
        form: nextForm,
        fields: [],
      });
    } catch {
      setStatus("error");
      setMessage("Không thể đọc file PDF này. Vui lòng thử một file khác.");
    } finally {
      setLoadingPdf(false);
    }
  };

  const addField = () => {
    if (!pageCount) return;
    const existingOnPage = fields.filter((field) => field.page === targetPage).length;
    const item = defaultField(targetPage, existingOnPage);
    const nextFields = [...fields, item];
    setFields(nextFields);
    setSelectedId(item.id);
    saveSessionState({ fields: nextFields });
    requestAnimationFrame(() => document.getElementById(`pdf-page-${targetPage}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const updateField = (id: string, patch: Partial<SignatureField>) => {
    const nextFields = fields.map((field) => field.id === id ? { ...field, ...patch } : field);
    setFields(nextFields);
    saveSessionState({ fields: nextFields });
    setStatus("draft");
  };

  const removeField = (id: string) => {
    const nextFields = fields.filter((field) => field.id !== id);
    setFields(nextFields);
    setSelectedId(null);
    saveSessionState({ fields: nextFields });
  };

  /**
   * Thoát khỏi yêu cầu hiện tại (đang chờ ký / bị từ chối) về bản nháp.
   * keepDocument = giữ file, thông tin, vùng ký để chỉnh và gửi lại; ngược lại xoá sạch phiên.
   * Lưu ý: chưa có API huỷ phía server, nên đây chỉ là ngừng theo dõi ở trình duyệt.
   */
  const resetToDraft = async (keepDocument: boolean, note: string) => {
    if (!keepDocument) {
      await createNewRequest();
      setMessage(note);
      return;
    }
    activeRequestRef.current = "";
    setShowCancelConfirm(false);
    setShowQrModal(false);
    setActiveRequestId("");
    setStatus("draft");
    setMessage(note);
    setErrorDetail(null);
    setCheckNote("");
    setCheckingStatus(false);
    setQrUrl("");
    setQrContent("");
    setSignToken("");
    await saveSessionState({ status: "draft", activeRequestId: "", qrUrl: "", qrContent: "", signToken: "", message: note });
  };

  const createNewRequest = async () => {
    activeRequestRef.current = "";
    setShowCancelConfirm(false);
    setForm({
      ...initialForm,
      organizationName: form.organizationName || "Cas Sign",
    });
    setSignType("");
    setTouched({});
    setOriginalFileName("");
    setFile(null);
    setPdf(null);
    setPageCount(0);
    setFields([]);
    setSelectedId(null);
    setTargetPage(1);
    setStatus("draft");
    setMessage("");
    setErrorDetail(null);
    setCheckNote("");
    setKeepAfterCancel(true);
    setSignedAt("");
    setIsSignedPreview(false);
    setActiveRequestId("");
    setCheckingStatus(false);
    setIsReplacingSignedFile(false);
    setQrUrl("");
    setQrContent("");
    setSignToken("");
    setShowQrModal(false);
    if (inputRef.current) inputRef.current.value = "";
    await clearSessionState();
  };

  const downloadSignedPdf = () => {
    if (!file || !isSignedPreview) return;
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = formatSignedFileName(originalFileName || file.name || form.documentName || activeRequestId || "document");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const detectVisiblePage = () => {
    const scrollArea = documentScrollRef.current;
    if (!scrollArea || !pageCount || isSignedPreview) return;
    const viewport = scrollArea.getBoundingClientRect();
    let bestPage = targetPage;
    let bestVisibleHeight = -1;
    for (let page = 1; page <= pageCount; page += 1) {
      const element = document.getElementById(`pdf-page-${page}`);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top));
      if (visibleHeight > bestVisibleHeight) {
        bestVisibleHeight = visibleHeight;
        bestPage = page;
      }
    }
    if (bestPage !== targetPage) setTargetPage(bestPage);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !file) {
      setTouched({ documentName: true, organizationName: true, taxCode: signType === "BUSINESS" });
      setStatus("error");
      setErrorDetail(null);
      setMessage(validationHint || "Vui lòng kiểm tra lại thông tin trước khi gửi.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    setErrorDetail(null);
    setCheckNote("");
    try {
      const signRequestId = createSignRequestId();
      setActiveRequestId(signRequestId);
      const body = new FormData();
      body.append("signRequestId", signRequestId);
      if (form.identificationNumber.trim()) {
        body.append("identificationNumber", form.identificationNumber.trim());
      }
      body.append("documentName", normalizeDocumentName(form.documentName));
      body.append("organizationName", form.organizationName.trim());
      if (signType) body.append("signType", signType);
      // taxCode chỉ gửi khi ký doanh nghiệp: có MST thì bắt buộc ký bằng chứng thư của đúng doanh nghiệp đó.
      if (signType === "BUSINESS" && form.taxCode.trim()) body.append("taxCode", form.taxCode.trim());
      body.append("signatureFields", JSON.stringify(fields.map(toPayloadField)));
      body.append("file", file);

      const response = await fetch("/api/esign", { method: "POST", body });
      if (!response.ok) {
        throw await parseApiError(response, "Dịch vụ ký số chưa phản hồi thành công.");
      }

      const rawText = await response.text();
      let jsonResult: Record<string, unknown> = {};
      try {
        jsonResult = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        jsonResult = {};
      }

      const pushDoc = (jsonResult.pushSignRequestDocument || (jsonResult.data as Record<string, unknown>)?.pushSignRequestDocument || jsonResult) as Record<string, unknown>;
      const qrLink = typeof pushDoc?.qrContent === "string" ? pushDoc.qrContent : (typeof pushDoc?.qrCodeUrl === "string" ? pushDoc.qrCodeUrl : "");
      const token = typeof pushDoc?.signToken === "string" ? pushDoc.signToken : "";
      let generatedQrUrl = "";

      if (qrLink) {
        setQrContent(qrLink);
        setSignToken(token);
        try {
          generatedQrUrl = await QRCode.toDataURL(qrLink, {
            width: 320,
            margin: 2,
            color: { dark: "#0f553b", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          setQrUrl(generatedQrUrl);
          setShowQrModal(true);
        } catch (err) {
          console.error("QR Code generation error", err);
        }
      }

      setStatus("sent");
      setMessage("Hồ sơ đã gửi thành công. Vui lòng quét mã QR trên Cas ID để ký.");

      await saveSessionState({
        status: "sent",
        activeRequestId: signRequestId,
        qrContent: qrLink,
        signToken: token,
        qrUrl: generatedQrUrl,
        message: "Hồ sơ đã gửi thành công. Vui lòng quét mã QR trên Cas ID để ký.",
      });
    } catch (error) {
      setStatus("error");
      if (error instanceof ApiRequestError) {
        setErrorDetail(error.detail);
        setMessage(error.detail.title);
        setServerTaxError(signType === "BUSINESS" && !!form.taxCode.trim()
          && [ERROR_CODES.BUSINESS_NOT_FOUND, ERROR_CODES.CERTIFICATE_NOT_FOUND].includes(error.detail.code as never));
        // Đánh dấu lại các trường liên quan để người dùng thấy ngay chỗ cần sửa.
        const text = `${error.detail.items.join(" ")} ${error.detail.code || ""}`.toLowerCase();
        setTouched((prev) => ({
          ...prev,
          documentName: prev.documentName || text.includes("documentname"),
          organizationName: prev.organizationName || text.includes("organizationname"),
          taxCode: prev.taxCode || text.includes("taxcode"),
        }));
      } else {
        setErrorDetail(null);
        // fetch() ném TypeError khi mất mạng / không tới được máy chủ ("Failed to fetch", "Load failed"...).
        const isNetworkError = error instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
        setMessage(isNetworkError
          ? "Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi bấm Gửi lại. Thông tin và file vẫn được giữ nguyên."
          : error instanceof Error ? error.message : "Không thể gửi yêu cầu ký.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div><strong>CAS Sign</strong><span>Ký tài liệu điện tử</span></div>
        </div>

        <nav className="nav-tabs">
          <Link href="/" className="nav-tab active">
            <FileSignature size={15} /> Ký tài liệu
          </Link>
          <Link href="/lookup" className="nav-tab">
            <ShieldCheck size={15} /> Tra cứu chữ ký
          </Link>
        </nav>

        <div className={`status-pill ${status}`}>
          <span className="status-dot" />
          {status === "completed" ? "Ký hoàn tất" : status === "rejected" ? "Từ chối ký" : status === "processing" ? "Đang xử lý" : status === "sent" ? "Đã gửi yêu cầu" : status === "error" ? "Cần kiểm tra" : "Bản nháp"}
        </div>
      </header>

      <form className="workspace" onSubmit={submit}>
        <aside className="sidebar">
          <div className="side-heading">
            <div><span className="step-label">BƯỚC 1</span><h1>Thông tin ký</h1></div>
            <span className="required-note">* Bắt buộc</span>
          </div>

          <div className="fields-grid">
            <label className="wide-field"><span>CCCD <span className="optional-label">Không bắt buộc</span></span><input disabled={isFormLocked} value={form.identificationNumber} onChange={(e) => setValue("identificationNumber", e.target.value)} placeholder="CCCD / CMND (không bắt buộc)" /></label>
            <label className="wide-field"><span>Tên tài liệu <em>*</em> <span className="optional-label">Tối thiểu 10 ký tự</span></span><input maxLength={200} disabled={!file || isFormLocked || isSignedPreview} className={touched.documentName && validationErrors.documentName ? "invalid" : ""} value={form.documentName} onBlur={() => { touchField("documentName"); setValue("documentName", normalizeDocumentName(form.documentName)); }} onChange={(e) => setValue("documentName", e.target.value)} placeholder={file ? "Nhập tên tài liệu (tối thiểu 10 ký tự)" : "Upload PDF để nhập tên tài liệu"} /></label>
            {touched.documentName && validationErrors.documentName && <small className="field-error wide-field">{validationErrors.documentName}</small>}
            <label className="wide-field"><span>Gửi từ <em>*</em></span><input disabled={isFormLocked} className={touched.organizationName && validationErrors.organizationName ? "invalid" : ""} value={form.organizationName} onBlur={() => touchField("organizationName")} onChange={(e) => setValue("organizationName", e.target.value)} placeholder="Cas Sign" /></label>
            {touched.organizationName && validationErrors.organizationName && <small className="field-error wide-field">{validationErrors.organizationName}</small>}
            <div className="wide-field sign-type-field">
              <span className="sign-type-label">Loại ký <span className="optional-label">Không bắt buộc</span></span>
              <div className="sign-type-group" role="radiogroup" aria-label="Loại ký">
                {SIGN_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value || "AUTO"}
                    type="button"
                    role="radio"
                    aria-checked={signType === option.value}
                    disabled={isFormLocked}
                    className={signType === option.value ? "active" : ""}
                    onClick={() => {
                      setSignType(option.value);
                      setServerTaxError(false);
                      saveSessionState({ signType: option.value, isBusinessSigning: option.value === "BUSINESS" });
                      if (option.value !== "BUSINESS") setTouched((prev) => ({ ...prev, taxCode: false }));
                      if (!["sent", "processing", "completed", "rejected"].includes(status)) setStatus("draft");
                    }}
                  >
                    {option.value === "BUSINESS" ? <Building2 size={13} /> : option.value === "PERSONAL" ? <User size={13} /> : <Users size={13} />}
                    {option.label}
                  </button>
                ))}
              </div>
              <small className="sign-type-hint"><Info size={11} />{SIGN_TYPE_OPTIONS.find((option) => option.value === signType)?.hint}</small>
            </div>
            {signType === "BUSINESS" && <label className="wide-field tax-field"><span>Mã số thuế <span className="optional-label">Không bắt buộc</span></span><input disabled={isFormLocked} className={(touched.taxCode && validationErrors.taxCode) || serverTaxError ? "invalid" : ""} value={form.taxCode} onBlur={() => touchField("taxCode")} onChange={(e) => { setServerTaxError(false); setValue("taxCode", e.target.value); }} placeholder="0123456789 hoặc 0123456789-001" inputMode="numeric" /></label>}
            {signType === "BUSINESS" && touched.taxCode && validationErrors.taxCode && <small className="field-error wide-field">{validationErrors.taxCode}</small>}
            {signType === "BUSINESS" && !validationErrors.taxCode && !serverTaxError && (
              <small className="tax-hint wide-field">
                {form.taxCode.trim()
                  ? <>Người ký <strong>bắt buộc</strong> dùng chứng thư số của doanh nghiệp có MST <strong>{form.taxCode.trim()}</strong>.</>
                  : <>Để trống: người ký dùng chứng thư số của bất kỳ doanh nghiệp nào họ có.</>}
              </small>
            )}
          </div>

          <div className="section-divider" />
          <span className="step-label">BƯỚC 2</span>
          <h2>Tài liệu PDF</h2>
          <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          {!file ? (
            <button className="upload-box" type="button" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const dropped = e.dataTransfer.files[0]; if (dropped) loadFile(dropped); }}>
              {loadingPdf ? <LoaderCircle className="spin" /> : <UploadCloud />}
              <strong>Chọn hoặc thả file PDF</strong>
              <span>Tối đa 20 MB</span>
            </button>
          ) : (
            <div className="file-card">
              <div className="file-icon"><FileText size={20} /></div>
              <div className="file-info"><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB · {pageCount} trang</span></div>
              {phase === "draft" && <button type="button" disabled={submitting} onClick={createNewRequest} aria-label="Bỏ file" title="Bỏ file"><X size={17} /></button>}
            </div>
          )}

          {selected && !isFormLocked && (
            <div className="field-editor">
              <div><strong>Đang chọn: vùng {fields.findIndex((field) => field.id === selected.id) + 1} · Trang {selected.page}</strong></div>
              <div className="field-type-group" role="radiogroup" aria-label="Loại vùng ký">
                {FIELD_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={selected.fieldType === type}
                    disabled={isFileLocked}
                    className={selected.fieldType === type ? "active" : ""}
                    onClick={() => updateField(selected.id, { fieldType: type })}
                  >
                    {FIELD_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <p>Kéo cả khung để di chuyển · kéo chấm ở góc phải dưới để đổi kích thước.</p>
              {invalidFieldIds.has(selected.id) && <p className="field-editor-error">{validateSignatureFields([toPayloadField(selected)], pageCount || undefined)[0]}</p>}
            </div>
          )}

          <div className="submit-area">
            {phase === "draft" && (
              <>
                {message && (
                  <div className={`notice ${status === "error" ? "error" : "info"}`} role={status === "error" ? "alert" : "status"}>
                    {status === "error" ? <AlertCircle size={17} /> : <Info size={17} />}
                    <div className="notice-content">
                      <span>{message}</span>
                      {status === "error" && errorDetail && (
                        <>
                          {errorDetail.items.length > 0 && (
                            <ul className="error-list">
                              {errorDetail.items.map((item, index) => <li key={index}>{item}</li>)}
                            </ul>
                          )}
                          {errorCodeTip(errorDetail.code) && <small className="error-tip">{errorCodeTip(errorDetail.code)}</small>}
                          <div className="error-meta">
                            {errorDetail.code && <code>{errorDetail.code}</code>}
                            {errorDetail.requestId && (
                              <button type="button" className="error-copy" onClick={() => navigator.clipboard?.writeText(errorDetail.requestId || "")} title="Sao chép mã yêu cầu">
                                <Copy size={10} /> {errorDetail.requestId}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <button className="submit-button" disabled={!canSubmit || submitting} type="submit">
                  {submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                  {submitting ? "Đang gửi..." : "Gửi yêu cầu ký"}
                </button>
                {!canSubmit && !submitting && validationHint && <div className="validation-hint">{validationHint}</div>}
                <span>Bằng việc tiếp tục, bạn xác nhận thông tin trên là chính xác.</span>
              </>
            )}

            {phase === "waiting" && (
              <div className="request-card waiting">
                <div className="request-card-head">
                  <span className={`live-dot ${liveConnected ? "on" : ""}`} aria-hidden="true" />
                  <div className="request-card-title">
                    <strong>Đang chờ người ký</strong>
                    <small>{liveConnected ? "Trang sẽ tự cập nhật khi ký xong" : "Bấm làm mới để kiểm tra kết quả ký"}</small>
                  </div>
                  <button type="button" className="icon-btn" disabled={checkingStatus} onClick={checkStatusNow} title="Kiểm tra trạng thái ngay" aria-label="Kiểm tra trạng thái ngay">
                    <RefreshCw size={15} className={checkingStatus ? "spin" : ""} />
                  </button>
                </div>
                {activeRequestId && <RequestIdChip id={activeRequestId} />}
                {checkNote && <small className="request-card-note">{checkNote}</small>}

                {showCancelConfirm ? (
                  <div className="cancel-inline" role="alertdialog" aria-labelledby="cancel-title">
                    <strong id="cancel-title">Huỷ yêu cầu này?</strong>
                    <p>Mã QR đã gửi có thể vẫn ký được trên Cas ID cho đến khi hết hạn.</p>
                    <label className="cancel-keep-option">
                      <input type="checkbox" checked={keepAfterCancel} onChange={(e) => setKeepAfterCancel(e.target.checked)} />
                      <span>Giữ lại tài liệu và vùng ký để chỉnh sửa, gửi lại</span>
                    </label>
                    <div className="cancel-inline-actions">
                      <button type="button" className="btn-danger" onClick={() => resetToDraft(keepAfterCancel, "Đã huỷ yêu cầu ký.")}>Huỷ yêu cầu</button>
                      <button type="button" className="btn-ghost" onClick={() => setShowCancelConfirm(false)}>Không</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {qrUrl && (
                      <button type="button" className="submit-button" onClick={() => setShowQrModal(true)}>
                        <QrCode size={18} /> Hiện mã QR để ký
                      </button>
                    )}
                    <button type="button" className="link-btn danger" onClick={() => setShowCancelConfirm(true)}>Huỷ yêu cầu</button>
                  </>
                )}
              </div>
            )}

            {phase === "finalizing" && (
              <div className="request-card waiting">
                <div className="request-card-head">
                  <LoaderCircle className="spin" size={18} />
                  <div className="request-card-title"><strong>Đã ký xong</strong><small>Đang tải bản PDF đã ký…</small></div>
                </div>
              </div>
            )}

            {phase === "completed" && (
              <div className="request-card done">
                <div className="request-card-head">
                  <CheckCircle2 size={20} />
                  <div className="request-card-title">
                    <strong>Đã ký hoàn tất</strong>
                    <small>{signedAt ? `Ký lúc ${new Date(signedAt).toLocaleString("vi-VN")}` : "Tài liệu đã được ký"}</small>
                  </div>
                </div>
                {activeRequestId && <RequestIdChip id={activeRequestId} />}
                {!isSignedPreview && message && <small className="request-card-note warn">{message}</small>}
                {isSignedPreview && (
                  <button type="button" className="submit-button" onClick={downloadSignedPdf}><Download size={18} /> Tải file đã ký</button>
                )}
                <button type="button" className={isSignedPreview ? "link-btn" : "submit-button"} onClick={createNewRequest}>
                  {!isSignedPreview && <Plus size={18} />} Tạo yêu cầu mới
                </button>
              </div>
            )}

            {phase === "rejected" && (
              <div className="request-card rejected">
                <div className="request-card-head">
                  <XCircle size={20} />
                  <div className="request-card-title"><strong>Người ký đã từ chối</strong><small>{message.replace(/^Người ký đã từ chối yêu cầu ký\.\s*/, "") || "Hệ thống ký chưa trả về lý do từ chối."}</small></div>
                </div>
                {activeRequestId && <RequestIdChip id={activeRequestId} />}
                <button type="button" className="submit-button" onClick={() => resetToDraft(true, "")}><RefreshCw size={18} /> Chỉnh sửa &amp; gửi lại</button>
                <button type="button" className="link-btn" onClick={createNewRequest}>Tạo yêu cầu mới</button>
              </div>
            )}
          </div>
        </aside>

        <section className="document-area">
          <div className="document-toolbar">
            <div><span className="step-label">BƯỚC 3</span><h2>Đặt vị trí ký</h2></div>
            {file && !isSignedPreview && <div className="signature-actions">
              <div className="page-picker"><span>Trang đang xem</span><select disabled={isFileLocked} value={targetPage} onChange={(e) => setTargetPage(Number(e.target.value))}>{Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>Trang {i + 1}</option>)}</select><ChevronDown size={14} /></div>
              <button type="button" disabled={isFileLocked} onClick={addField}><Plus size={16} /> Thêm vùng ký</button>
              <div className="field-count"><span>{fields.length}</span> vùng</div>
            </div>}
            {isSignedPreview && <div className="signed-preview-badge"><CheckCircle2 size={15} /> Bản PDF đã ký</div>}
          </div>
          {isReplacingSignedFile && <div className="replace-file-overlay"><LoaderCircle className="spin" size={30} /><strong>Đang cập nhật file đã ký</strong><span>Vui lòng chờ trong giây lát...</span></div>}
          <div className="document-scroll" ref={documentScrollRef} onScroll={detectVisiblePage}>
            {!pdf ? (
              <div className="empty-preview">
                <div className="empty-file"><FileText size={35} /></div>
                <h3>Chưa có tài liệu</h3>
                <p>Upload file PDF để xem trước và đặt vị trí chữ ký.</p>
                <button type="button" onClick={() => inputRef.current?.click()}><UploadCloud size={17} /> Chọn file PDF</button>
              </div>
            ) : (
              <div className="pdf-stack">
                {Array.from({ length: pageCount }, (_, index) => (
                  <PdfPage
                    key={index + 1}
                    pdf={pdf}
                    pageNumber={index + 1}
                    fields={fields.filter((field) => field.page === index + 1)}
                    selectedId={selectedId}
                    invalidIds={invalidFieldIds}
                    locked={isFileLocked}
                    onSelect={(id) => { setSelectedId(id); setTargetPage(index + 1); }}
                    onMove={(id, x, y) => updateField(id, { xRatio: x, yRatio: y })}
                    onResize={(id, width, height) => updateField(id, { widthRatio: width, heightRatio: height })}
                    onDelete={removeField}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </form>

      {/* QR Code Modal Popup */}
      {showQrModal && qrUrl && (
        <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="modal-card qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close floating" onClick={() => setShowQrModal(false)} aria-label="Đóng">
              <X size={16} />
            </button>
            <div className="qr-modal-body">
              <h3 id="qr-title">Quét mã để ký</h3>
              <p className="qr-caption"><Smartphone size={14} /> Mở app <strong>Cas ID</strong> và quét mã bên dưới</p>
              <div className="qr-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="Mã QR ký tài liệu" className="qr-image" />
              </div>
              {signToken && <div className="qr-token-pill">Mã xác nhận: <strong>{signToken}</strong></div>}
              <div className="qr-live">
                <span className={`live-dot ${liveConnected ? "on" : ""}`} aria-hidden="true" />
                <span>{checkingStatus ? "Đang kiểm tra…" : liveConnected ? "Đang chờ ký · tự cập nhật khi xong" : "Đang chờ ký"}</span>
                <button type="button" className="link-btn inline" disabled={checkingStatus} onClick={checkStatusNow}>Kiểm tra ngay</button>
              </div>
              {checkNote && <small className="request-card-note">{checkNote}</small>}
              <div className="qr-links">
                <button type="button" className="link-btn inline" onClick={copyQrLink}><Copy size={12} /> {copiedLink ? "Đã sao chép" : "Sao chép link ký"}</button>
                <span aria-hidden="true">·</span>
                <a className="link-btn inline" href={qrContent} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Mở trên thiết bị này</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
