"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileSignature,
  FileText,
  GripVertical,
  LoaderCircle,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { clearSessionState, loadSessionState, saveSessionState } from "./session-storage";

type SignatureField = {
  id: string;
  page: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fieldType: "SIGNATURE";
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

function PdfPage({ pdf, pageNumber, fields, selectedId, locked, onSelect, onMove, onResize, onDelete }: {
  pdf: PdfDocumentProxy;
  pageNumber: number;
  fields: SignatureField[];
  selectedId: string | null;
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
            className={`signature-box ${selectedId === field.id ? "selected" : ""} ${locked ? "locked" : ""}`}
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
            <span>Chữ ký {index + 1}</span>
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
  const eventSourceRef = useRef<EventSource | null>(null);

  const [form, setForm] = useState(initialForm);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [isBusinessSigning, setIsBusinessSigning] = useState(false);
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
  const [signedAt, setSignedAt] = useState("");
  const [isSignedPreview, setIsSignedPreview] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isReplacingSignedFile, setIsReplacingSignedFile] = useState(false);

  // QR Code Modal States
  const [qrUrl, setQrUrl] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [signToken, setSignToken] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const selected = useMemo(() => fields.find((item) => item.id === selectedId), [fields, selectedId]);
  const isFileLocked = status === "sent" || status === "processing" || status === "rejected" || submitting;

  // Validation: CCCD is optional now!
  const validationErrors = useMemo(() => {
    const errors: Partial<Record<keyof FormState | "file" | "fields", string>> = {};
    if (!form.organizationName.trim()) errors.organizationName = "Vui lòng nhập Gửi từ yêu cầu.";
    const documentName = normalizeDocumentName(form.documentName);
    if (!documentName) errors.documentName = "Vui lòng nhập tên tài liệu.";
    else if (documentName.length < 10) errors.documentName = "Tên tài liệu phải từ 10 ký tự trở lên.";
    else if (documentName.length > 200) errors.documentName = "Tên tài liệu không được vượt quá 200 ký tự.";
    if (isBusinessSigning) {
      const taxCode = form.taxCode.trim();
      if (!taxCode) errors.taxCode = "Vui lòng nhập mã số thuế.";
      else if (!/^\d{10}(?:-\d{3})?$/.test(taxCode)) errors.taxCode = "Mã số thuế gồm 10 số hoặc 10 số-3 số.";
    }
    if (!file) errors.file = "Vui lòng tải lên file PDF.";
    else if (file.size > 20 * 1024 * 1024) errors.file = "File PDF không được vượt quá 20 MB.";
    if (fields.length === 0) errors.fields = "Cần đặt ít nhất một vùng ký.";
    return errors;
  }, [fields.length, file, form, isBusinessSigning]);

  const canSubmit = Object.keys(validationErrors).length === 0 && !isFileLocked;
  const validationHint = Object.values(validationErrors)[0];

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

  const listenForWebhookSSE = (signRequestId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    try {
      const es = new EventSource(`/api/esign/stream/${encodeURIComponent(signRequestId)}`);
      eventSourceRef.current = es;

      es.onmessage = async (event) => {
        if (!event.data || event.data.trim() === ": ok" || event.data.trim() === "ok") return;
        try {
          const signStatus = JSON.parse(event.data) as Record<string, unknown>;
          const nextState = typeof signStatus?.state === "string" ? signStatus.state.toUpperCase() : undefined;
          const targetKey = typeof signStatus?.identityKey === "string" ? signStatus.identityKey : (typeof signStatus?.identity_key === "string" ? signStatus.identity_key : undefined);
          const targetUrl = typeof signStatus?.signedFileUrl === "string" ? signStatus.signedFileUrl : (typeof signStatus?.signed_file_url === "string" ? signStatus.signed_file_url : undefined);

          if (nextState === "COMPLETED") {
            es.close();
            eventSourceRef.current = null;
            const signedTimestamp = (signStatus.signedAt as string) || (signStatus.lastUpdatedAt as string) || new Date().toISOString();

            if (targetKey || targetUrl) {
              setIsReplacingSignedFile(true);
              setStatus("processing");
              setMessage("Đã nhận callback Webhook thành công! Đang tải bản PDF đã ký...");
              try {
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

            // Auto close QR modal on completion
            setTimeout(() => {
              setShowQrModal(false);
            }, 1200);
          } else if (["REJECTED", "FAILED", "CANCELLED", "EXPIRED"].includes(nextState || "")) {
            es.close();
            eventSourceRef.current = null;
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
          }
        } catch (e) {
          console.error("SSE message parse error", e);
        }
      };

      es.onerror = () => {
        es.close();
        if (eventSourceRef.current === es) eventSourceRef.current = null;
      };
    } catch {
      // SSE fallback
    }
  };

  // Restore session from IndexedDB on mount
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const saved = await loadSessionState();
        if (!saved || isCancelled) return;

        if (saved.form) setForm(saved.form);
        if (saved.isBusinessSigning !== undefined) setIsBusinessSigning(saved.isBusinessSigning);
        if (saved.originalFileName) setOriginalFileName(saved.originalFileName);
        if (saved.activeRequestId) {
          setActiveRequestId(saved.activeRequestId);
          if (["sent", "processing"].includes(saved.status)) {
            listenForWebhookSSE(saved.activeRequestId);
          }
        }
        if (saved.status) setStatus(saved.status);
        if (saved.message) setMessage(saved.message);
        if (saved.signedAt) setSignedAt(saved.signedAt);
        if (saved.isSignedPreview !== undefined) setIsSignedPreview(saved.isSignedPreview);
        if (saved.fields) setFields(saved.fields);
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const checkStatusNow = async () => {
    if (!activeRequestId || checkingStatus) return;
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/esign/status/${encodeURIComponent(activeRequestId)}`, { cache: "no-store" });
      if (!response.ok) {
        const errorMsg = await parseResponseErrorMessage(response, "Không thể lấy trạng thái ký.");
        throw new Error(errorMsg);
      }
      const result = (await response.json()) as Record<string, unknown>;
      const signStatus = (result.signRequestStatus || (result.signRequestId || result.state ? result : result.data)) as Record<string, unknown> | undefined;
      const nextState = typeof signStatus?.state === "string" ? signStatus.state.toUpperCase() : undefined;
      const targetKey = typeof signStatus?.identityKey === "string" ? signStatus.identityKey : undefined;
      const targetUrl = typeof signStatus?.signedFileUrl === "string" ? signStatus.signedFileUrl : undefined;
      const signedTimestamp = (signStatus?.signedAt as string) || (signStatus?.lastUpdatedAt as string) || new Date().toISOString();

      if (nextState === "COMPLETED" && (targetKey || targetUrl)) {
        setIsReplacingSignedFile(true);
        setStatus("processing");
        setMessage("Đã ký hoàn tất. Đang cập nhật bản PDF đã ký...");
        try {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await replaceWithSignedPdf({ identityKey: targetKey, url: targetUrl }, activeRequestId);
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
        setTimeout(() => setShowQrModal(false), 1200);
        return;
      }
      if (nextState === "COMPLETED") {
        setStatus("completed");
        setSignedAt(signedTimestamp);
        setMessage("Tài liệu đã ký hoàn tất.");
        await saveSessionState({
          status: "completed",
          signedAt: signedTimestamp,
          message: "Tài liệu đã ký hoàn tất.",
        });
        setTimeout(() => setShowQrModal(false), 1200);
        return;
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
        setTimeout(() => setShowQrModal(false), 1500);
        return;
      }
      setStatus("processing");
      setMessage(`Đang chờ ký${nextState ? ` · ${nextState}` : ""}. Chưa có callback Webhook mới.`);
    } catch (error) {
      setStatus("error");
      setMessage(`${error instanceof Error ? error.message : "Chưa lấy được trạng thái."}`);
    } finally {
      setCheckingStatus(false);
    }
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
      const first = defaultField(1);
      setFields([first]);
      setSelectedId(first.id);
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
        fields: [first],
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

  const createNewRequest = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setOriginalFileName("");
    setFile(null);
    setPdf(null);
    setPageCount(0);
    setFields([]);
    setSelectedId(null);
    setTargetPage(1);
    setStatus("draft");
    setMessage("");
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
      setTouched({ documentName: true, organizationName: true, taxCode: isBusinessSigning });
      setStatus("error");
      setMessage(validationHint || "Vui lòng kiểm tra lại thông tin trước khi gửi.");
      return;
    }
    setSubmitting(true);
    setMessage("");
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
      if (isBusinessSigning) body.append("taxCode", form.taxCode.trim());
      body.append("signatureFields", JSON.stringify(fields.map((field) => ({
        page: field.page,
        xRatio: field.xRatio,
        yRatio: Math.max(0, Math.min(1, 1 - field.yRatio - field.heightRatio)),
        widthRatio: field.widthRatio,
        heightRatio: field.heightRatio,
        fieldType: field.fieldType,
      }))));
      body.append("file", file);

      const response = await fetch("/api/esign", { method: "POST", body });
      if (!response.ok) {
        const errorMsg = await parseResponseErrorMessage(response, "Dịch vụ ký số chưa phản hồi thành công.");
        throw new Error(errorMsg);
      }

      const rawText = await response.text();
      let jsonResult: Record<string, unknown> = {};
      try {
        jsonResult = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        jsonResult = {};
      }

      const pushDoc = (jsonResult.pushSignRequestDocument || jsonResult.requestDocument || (jsonResult.data as Record<string, unknown>)?.pushSignRequestDocument || (jsonResult.data as Record<string, unknown>)?.requestDocument || jsonResult) as Record<string, unknown>;
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
      setMessage("Hồ sơ đã gửi thành công. Vui lòng quét mã QR trên ứng dụng Cas ID để ký.");

      await saveSessionState({
        status: "sent",
        activeRequestId: signRequestId,
        qrContent: qrLink,
        signToken: token,
        qrUrl: generatedQrUrl,
        message: "Hồ sơ đã gửi thành công. Vui lòng quét mã QR trên ứng dụng Cas ID để ký.",
      });

      // Listen for instant Webhook callback via SSE
      listenForWebhookSSE(signRequestId);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không thể gửi yêu cầu ký.");
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
            <label className="wide-field">
              <span>CCCD / CMND <span className="optional-label">Tùy chọn</span></span>
              <input
                disabled={isFileLocked || isSignedPreview}
                value={form.identificationNumber}
                onChange={(e) => setValue("identificationNumber", e.target.value)}
                placeholder="CCCD / CMND (Không bắt buộc)"
              />
            </label>
            <label className="wide-field">
              <span>Tên tài liệu <em>*</em> <span className="optional-label">Tối thiểu 10 ký tự</span></span>
              <input
                maxLength={200}
                disabled={!file || isFileLocked || isSignedPreview}
                className={touched.documentName && validationErrors.documentName ? "invalid" : ""}
                value={form.documentName}
                onBlur={() => { touchField("documentName"); setValue("documentName", normalizeDocumentName(form.documentName)); }}
                onChange={(e) => setValue("documentName", e.target.value)}
                placeholder={file ? "Nhập tên tài liệu (tối thiểu 10 ký tự)" : "Upload PDF để nhập tên tài liệu"}
              />
            </label>
            {touched.documentName && validationErrors.documentName && <small className="field-error wide-field">{validationErrors.documentName}</small>}
            <label className="wide-field">
              <span>Gửi từ <em>*</em></span>
              <input
                disabled={isFileLocked || isSignedPreview}
                className={touched.organizationName && validationErrors.organizationName ? "invalid" : ""}
                value={form.organizationName}
                onBlur={() => touchField("organizationName")}
                onChange={(e) => setValue("organizationName", e.target.value)}
                placeholder="Cas Sign"
              />
            </label>
            {touched.organizationName && validationErrors.organizationName && <small className="field-error wide-field">{validationErrors.organizationName}</small>}
            <label className="business-toggle wide-field">
              <input
                type="checkbox"
                disabled={isFileLocked || isSignedPreview}
                checked={isBusinessSigning}
                onChange={(e) => { setIsBusinessSigning(e.target.checked); if (!e.target.checked) setTouched((prev) => ({ ...prev, taxCode: false })); }}
              />
              <span><strong>Ký doanh nghiệp</strong><small>Yêu cầu mã số thuế</small></span>
            </label>
            {isBusinessSigning && (
              <label className="wide-field tax-field">
                <span>Mã số thuế <em>*</em></span>
                <input
                  disabled={isFileLocked || isSignedPreview}
                  className={touched.taxCode && validationErrors.taxCode ? "invalid" : ""}
                  value={form.taxCode}
                  onBlur={() => touchField("taxCode")}
                  onChange={(e) => setValue("taxCode", e.target.value)}
                  placeholder="0123456789 hoặc 0123456789-001"
                  inputMode="numeric"
                />
              </label>
            )}
            {isBusinessSigning && touched.taxCode && validationErrors.taxCode && <small className="field-error wide-field">{validationErrors.taxCode}</small>}
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
              <button type="button" disabled={isFileLocked} onClick={() => { setFile(null); setPdf(null); setFields([]); setPageCount(0); setIsSignedPreview(false); setSignedAt(""); setOriginalFileName(""); }} aria-label="Bỏ file"><X size={17} /></button>
            </div>
          )}

          {selected && (
            <div className="field-editor">
              <div><strong>Đang chọn: vùng {fields.findIndex((field) => field.id === selected.id) + 1}</strong></div>
              <p>{isFileLocked ? "Vùng ký đã được khoá trong lúc chờ xử lý." : "Kéo cả khung để di chuyển · kéo chấm ở góc phải dưới để đổi kích thước."}</p>
            </div>
          )}

          <div className="submit-area">
            {message && (
              <div className={`notice ${status}`}>
                {status === "completed" || status === "sent" ? (
                  <CheckCircle2 size={17} />
                ) : status === "processing" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : status === "rejected" ? (
                  <XCircle size={17} />
                ) : (
                  <AlertCircle size={17} />
                )}
                <span>{message}</span>
              </div>
            )}

            {["sent", "processing"].includes(status) && qrUrl && (
              <button
                type="button"
                className="view-qr-button"
                onClick={() => setShowQrModal(true)}
              >
                <QrCode size={16} /> Xem lại mã QR ký
              </button>
            )}

            {["sent", "processing"].includes(status) && activeRequestId && !isReplacingSignedFile && (
              <div className="poll-controls">
                <button type="button" disabled={checkingStatus} onClick={checkStatusNow}>
                  {checkingStatus ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
                  {checkingStatus ? "Đang kiểm tra..." : "Cập nhật trạng thái thủ công"}
                </button>
              </div>
            )}

            {status === "completed" && signedAt && <div className="signed-time">Ký lúc {new Date(signedAt).toLocaleString("vi-VN")}</div>}
            {["completed", "rejected"].includes(status) ? (
              <div className="completed-actions">
                {isSignedPreview && <button className="download-signed" type="button" onClick={downloadSignedPdf}><Download size={17} /> Tải file đã ký</button>}
                <button className="submit-button new-request" type="button" onClick={createNewRequest}>
                  <RefreshCw size={18} /> Tạo yêu cầu mới
                </button>
              </div>
            ) : (
              <button className="submit-button" disabled={!canSubmit || submitting} type="submit">
                {submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                {submitting ? "Đang gửi..." : "Gửi yêu cầu ký"}
              </button>
            )}
            {!canSubmit && !["sent", "processing", "completed", "rejected"].includes(status) && validationHint && <div className="validation-hint">{validationHint}</div>}
            <span>Bằng việc tiếp tục, bạn xác nhận thông tin trên là chính xác.</span>
          </div>
        </aside>

        <section className="document-area">
          <div className="document-toolbar">
            <div><span className="step-label">BƯỚC 3</span><h2>Đặt vị trí ký</h2></div>
            {file && !isSignedPreview && (
              <div className="signature-actions">
                <div className="page-picker">
                  <span>Trang đang xem</span>
                  <select disabled={isFileLocked} value={targetPage} onChange={(e) => setTargetPage(Number(e.target.value))}>
                    {Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>Trang {i + 1}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </div>
                <button type="button" disabled={isFileLocked} onClick={addField}><Plus size={16} /> Thêm vùng ký</button>
                <div className="field-count"><span>{fields.length}</span> vùng</div>
              </div>
            )}
            {isSignedPreview && <div className="signed-preview-badge"><CheckCircle2 size={15} /> Bản PDF đã ký</div>}
          </div>

          {isReplacingSignedFile && (
            <div className="replace-file-overlay">
              <LoaderCircle className="spin" size={30} />
              <strong>Đang cập nhật file đã ký</strong>
              <span>Vui lòng chờ trong giây lát...</span>
            </div>
          )}

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

      {/* QR Code Modal Dialog */}
      {showQrModal && (
        <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><QrCode size={18} style={{ color: "var(--green)" }} /> Quét mã để ký trên Cas ID</h3>
              <button className="modal-close" type="button" onClick={() => setShowQrModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {qrUrl ? (
                <div className="qr-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="Mã QR ký tài liệu" className="qr-image" />
                </div>
              ) : (
                <div className="qr-frame" style={{ width: 220, height: 220, display: "grid", placeItems: "center" }}>
                  <LoaderCircle className="spin" size={32} />
                </div>
              )}

              {signToken && (
                <div className="qr-token-pill">
                  Mã ký số: <strong>{signToken}</strong>
                </div>
              )}

              <div className="qr-actions-row">
                <button
                  type="button"
                  className={`qr-btn secondary ${copiedLink ? "copied" : ""}`}
                  onClick={copyQrLink}
                >
                  <Copy size={14} /> {copiedLink ? "Đã sao chép link!" : "Sao chép link ký"}
                </button>
              </div>

              <div className="qr-poll-status waiting">
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                  <LoaderCircle className="spin" size={14} />
                  <span>Đang chờ bạn mở Cas ID và xác nhận ký...</span>
                </div>
                <span style={{ fontSize: 10, color: "#6e6245" }}>
                  Hệ thống tự động cập nhật ngay khi bạn ký xong trên app qua Webhook.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <span style={{ fontSize: 10, color: "#7a8a81" }}>Mã yêu cầu: <code>{activeRequestId}</code></span>
              <button
                type="button"
                className="qr-btn primary"
                style={{ flex: "0 0 auto", height: 32, padding: "0 14px" }}
                onClick={() => setShowQrModal(false)}
              >
                Đóng popup
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
