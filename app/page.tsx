"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  UploadCloud,
  X,
} from "lucide-react";

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

type SignStatusResponse = {
  signRequestStatus?: {
    signRequestId?: string;
    state?: string;
    lastUpdatedAt?: string;
    signedAt?: string;
    signedFileUrl?: string;
    expiresIn?: number;
    rejectedReason?: string;
  };
};

const initialForm: FormState = {
  identificationNumber: "",
  documentName: "",
  organizationName: "",
  taxCode: "",
};

const createSignRequestId = (): string =>
  `CAS-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const MAX_AUTO_STATUS_CHECKS = 20;

const normalizeDocumentName = (value: string): string => value
  .replace(/[\u0000-\u001F\u007F]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const defaultField = (page = 1, index = 0): SignatureField => ({
  id: crypto.randomUUID(),
  page,
  xRatio: 0.56,
  yRatio: Math.min(0.82, 0.7 + (index % 3) * 0.1),
  widthRatio: 0.3,
  heightRatio: 0.1,
  fieldType: "SIGNATURE",
});

function PdfPage({ pdf, pageNumber, fields, selectedId, locked, onSelect, onMove, onResize, onDelete }: {
  pdf: any;
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
    let renderTask: any;
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
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingIdRef = useRef<string | null>(null);
  const autoPollAttemptsRef = useRef(0);
  const autoPollingStoppedRef = useRef(false);
  const [form, setForm] = useState(initialForm);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [isBusinessSigning, setIsBusinessSigning] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<any>(null);
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
  const [countdown, setCountdown] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isReplacingSignedFile, setIsReplacingSignedFile] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [autoPollingStopped, setAutoPollingStopped] = useState(false);

  const selected = useMemo(() => fields.find((item) => item.id === selectedId), [fields, selectedId]);
  const isFileLocked = status === "sent" || status === "processing" || status === "rejected" || submitting;
  const validationErrors = useMemo(() => {
    const errors: Partial<Record<keyof FormState | "file" | "fields", string>> = {};
    const identification = form.identificationNumber.trim();
    if (!identification) errors.identificationNumber = "Vui lòng nhập số giấy tờ.";
    else if (identification.length < 6) errors.identificationNumber = "Số giấy tờ cần ít nhất 6 ký tự.";
    if (!form.organizationName.trim()) errors.organizationName = "Vui lòng nhập nơi gửi yêu cầu.";
    const documentName = normalizeDocumentName(form.documentName);
    if (!documentName) errors.documentName = "Vui lòng nhập tên tài liệu.";
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

  useEffect(() => () => {
    pollingIdRef.current = null;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  const clearPollSchedule = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    pollTimerRef.current = null;
    countdownTimerRef.current = null;
    setCountdown(0);
  };

  const replaceWithSignedPdf = async (url: string, signRequestId: string) => {
    const response = await fetch(`/api/esign/signed-file?url=${encodeURIComponent(url)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Không thể tải bản PDF đã ký để hiển thị.");
    const blob = await response.blob();
    const signedFile = new File([blob], `${signRequestId}-signed.pdf`, { type: "application/pdf" });
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const loaded = await pdfjs.getDocument({ data: await signedFile.arrayBuffer() }).promise;
    setFile(signedFile);
    setPdf(loaded);
    setPageCount(loaded.numPages);
    setFields([]);
    setSelectedId(null);
    setIsSignedPreview(true);
  };

  const checkStatusNow = async () => {
    if (!activeRequestId || checkingStatus) return;
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/esign/status/${encodeURIComponent(activeRequestId)}`, { cache: "no-store" });
      const result = await response.json() as Record<string, any>;
      if (!response.ok) throw new Error(result.message || result.error || "Không thể lấy trạng thái ký.");
      const signStatus = result.signRequestStatus || (result.signRequestId || result.state ? result : result.data);
      const nextState = signStatus?.state?.toUpperCase();
      if (nextState === "COMPLETED" && signStatus?.signedFileUrl) {
        setIsReplacingSignedFile(true);
        setStatus("processing");
        setMessage("Đã ký hoàn tất. Đang cập nhật bản PDF đã ký...");
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await replaceWithSignedPdf(signStatus.signedFileUrl, activeRequestId);
          setStatus("completed");
          setSignedAt(signStatus.signedAt || signStatus.lastUpdatedAt || "");
          setMessage("Tài liệu đã ký hoàn tất. Bản xem trước đã được cập nhật.");
        } catch (error) {
          setStatus("completed");
          setMessage(error instanceof Error ? error.message : "Đã ký xong nhưng chưa thể hiển thị file đã ký.");
        } finally {
          setIsReplacingSignedFile(false);
        }
        return;
      }
      if (nextState === "COMPLETED") {
        setStatus("completed");
        setSignedAt(signStatus?.signedAt || signStatus?.lastUpdatedAt || "");
        setMessage("Tài liệu đã ký hoàn tất nhưng API chưa trả về đường dẫn file đã ký.");
        return;
      }
      if (["REJECTED", "FAILED", "CANCELLED", "EXPIRED"].includes(nextState || "")) {
        setStatus(nextState === "REJECTED" ? "rejected" : "error");
        setMessage(nextState === "REJECTED"
          ? `Người ký đã từ chối yêu cầu ký.${signStatus?.rejectedReason ? ` Lý do: ${signStatus.rejectedReason}` : ""}`
          : `Yêu cầu ký đã kết thúc với trạng thái ${nextState}.`);
        return;
      }
      setStatus("processing");
      setMessage(`Đang chờ ký${nextState ? ` · ${nextState}` : ""}. Chưa có callback Webhook mới.`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Chưa lấy được trạng thái."}`);
    } finally {
      setCheckingStatus(false);
    }
  };

  const setValue = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      const loaded = await pdfjs.getDocument({ data }).promise;
      setFile(nextFile);
      setPdf(loaded);
      setPageCount(loaded.numPages);
      setIsSignedPreview(false);
      const first = defaultField(1);
      setFields([first]);
      setSelectedId(first.id);
      setTargetPage(1);
      setForm((prev) => ({ ...prev, documentName: nextFile.name.replace(/\.pdf$/i, "") }));
      setTouched((prev) => ({ ...prev, documentName: false }));
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
    setFields((prev) => [...prev, item]);
    setSelectedId(item.id);
    requestAnimationFrame(() => document.getElementById(`pdf-page-${targetPage}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const updateField = (id: string, patch: Partial<SignatureField>) => {
    setFields((prev) => prev.map((field) => field.id === id ? { ...field, ...patch } : field));
    setStatus("draft");
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((field) => field.id !== id));
    setSelectedId(null);
  };

  const createNewRequest = () => {
    pollingIdRef.current = null;
    clearPollSchedule();
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
    autoPollAttemptsRef.current = 0;
    autoPollingStoppedRef.current = false;
    setPollAttempt(0);
    setAutoPollingStopped(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadSignedPdf = () => {
    if (!file || !isSignedPreview) return;
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name || `${activeRequestId || "cas-sign"}-signed.pdf`;
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
      setTouched({ identificationNumber: true, documentName: true, organizationName: true, taxCode: isBusinessSigning });
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
      body.append("identificationNumber", form.identificationNumber.trim());
      body.append("documentName", normalizeDocumentName(form.documentName));
      body.append("organizationName", form.organizationName.trim());
      if (isBusinessSigning) body.append("taxCode", form.taxCode.trim());
      body.append("signatureFields", JSON.stringify(fields.map(({ id: _id, ...field }) => ({
        ...field,
        yRatio: Math.max(0, Math.min(1, 1 - field.yRatio - field.heightRatio)),
      }))));
      body.append("file", file);
      const response = await fetch("/api/esign", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const traceId = response.headers.get("x-cas-trace-id") || result?.traceId;
        const baseMessage = result?.message || result?.error || "Dịch vụ ký số chưa phản hồi thành công.";
        throw new Error(traceId ? `${baseMessage} · Trace: ${traceId}` : baseMessage);
      }
      setStatus("sent");
      setMessage("Hồ sơ đã gửi thành công. Vui lòng thực hiện ký trên Cas ID.");
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
        <div className={`status-pill ${status}`}>
          <span className="status-dot" />
          {status === "completed" ? "Ký hoàn tất" : status === "rejected" ? "Từ chối ký" : status === "processing" ? "Đang xử lý" : status === "sent" ? "Đã gửi yêu cầu" : status === "error" ? "Cần kiểm tra" : "Bản nháp"}
        </div>
        <div className="topbar-spacer" aria-hidden="true" />
      </header>

      <form className="workspace" onSubmit={submit}>
        <aside className="sidebar">
          <div className="side-heading">
            <div><span className="step-label">BƯỚC 1</span><h1>Thông tin ký</h1></div>
            <span className="required-note">* Bắt buộc</span>
          </div>

          <div className="fields-grid">
            <label className="wide-field"><span>Số giấy tờ <em>*</em></span><input className={touched.identificationNumber && validationErrors.identificationNumber ? "invalid" : ""} value={form.identificationNumber} onBlur={() => touchField("identificationNumber")} onChange={(e) => setValue("identificationNumber", e.target.value)} placeholder="CCCD / CMND" /></label>
            {touched.identificationNumber && validationErrors.identificationNumber && <small className="field-error wide-field">{validationErrors.identificationNumber}</small>}
            <label className="wide-field"><span>Tên tài liệu <em>*</em></span><input maxLength={200} disabled={!file || isFileLocked || isSignedPreview} className={touched.documentName && validationErrors.documentName ? "invalid" : ""} value={form.documentName} onBlur={() => { touchField("documentName"); setValue("documentName", normalizeDocumentName(form.documentName)); }} onChange={(e) => setValue("documentName", e.target.value)} placeholder={file ? "Nhập tên tài liệu" : "Upload PDF để nhập tên tài liệu"} /></label>
            {touched.documentName && validationErrors.documentName && <small className="field-error wide-field">{validationErrors.documentName}</small>}
            <label className="wide-field"><span>Nơi gửi <em>*</em></span><input className={touched.organizationName && validationErrors.organizationName ? "invalid" : ""} value={form.organizationName} onBlur={() => touchField("organizationName")} onChange={(e) => setValue("organizationName", e.target.value)} placeholder="Công ty TNHH..." /></label>
            {touched.organizationName && validationErrors.organizationName && <small className="field-error wide-field">{validationErrors.organizationName}</small>}
            <label className="business-toggle wide-field"><input type="checkbox" checked={isBusinessSigning} onChange={(e) => { setIsBusinessSigning(e.target.checked); if (!e.target.checked) setTouched((prev) => ({ ...prev, taxCode: false })); }} /><span><strong>Ký doanh nghiệp</strong><small>Yêu cầu mã số thuế</small></span></label>
            {isBusinessSigning && <label className="wide-field tax-field"><span>Mã số thuế <em>*</em></span><input className={touched.taxCode && validationErrors.taxCode ? "invalid" : ""} value={form.taxCode} onBlur={() => touchField("taxCode")} onChange={(e) => setValue("taxCode", e.target.value)} placeholder="0123456789 hoặc 0123456789-001" inputMode="numeric" /></label>}
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
              <button type="button" disabled={isFileLocked} onClick={() => { setFile(null); setPdf(null); setFields([]); setPageCount(0); setIsSignedPreview(false); setSignedAt(""); }} aria-label="Bỏ file"><X size={17} /></button>
            </div>
          )}

          {selected && (
            <div className="field-editor">
              <div><strong>Đang chọn: vùng {fields.findIndex((field) => field.id === selected.id) + 1}</strong></div>
              <p>{isFileLocked ? "Vùng ký đã được khoá trong lúc chờ xử lý." : "Kéo cả khung để di chuyển · kéo chấm ở góc phải dưới để đổi kích thước."}</p>
            </div>
          )}

          <div className="submit-area">
            {message && <div className={`notice ${status}`}><CheckCircle2 size={17} /> <span>{message}</span></div>}
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
    </main>
  );
}
