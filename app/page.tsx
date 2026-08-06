"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Trash2,
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
  signRequestId: string;
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
  };
};

const initialForm: FormState = {
  signRequestId: "",
  identificationNumber: "",
  documentName: "",
  organizationName: "",
  taxCode: "",
};

const defaultField = (page = 1, index = 0): SignatureField => ({
  id: crypto.randomUUID(),
  page,
  xRatio: 0.56,
  yRatio: Math.min(0.82, 0.7 + (index % 3) * 0.1),
  widthRatio: 0.3,
  heightRatio: 0.1,
  fieldType: "SIGNATURE",
});

function PdfPage({ pdf, pageNumber, fields, selectedId, locked, onSelect, onMove, onResize }: {
  pdf: any;
  pageNumber: number;
  fields: SignatureField[];
  selectedId: string | null;
  locked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
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
          <button
            type="button"
            key={field.id}
            className={`signature-box ${selectedId === field.id ? "selected" : ""} ${locked ? "locked" : ""}`}
            style={{
              left: `${field.xRatio * 100}%`,
              top: `${field.yRatio * 100}%`,
              width: `${field.widthRatio * 100}%`,
              height: `${field.heightRatio * 100}%`,
            }}
            onPointerDown={(e) => startDrag(e, field)}
            disabled={locked}
            aria-label={`Vùng ký ${index + 1} trên trang ${pageNumber}`}
          >
            <GripVertical size={16} />
            <span>Chữ ký {index + 1}</span>
            <span className="resize-handle" onPointerDown={(e) => startResize(e, field)} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const documentScrollRef = useRef<HTMLDivElement>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [form, setForm] = useState(initialForm);
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

  const selected = useMemo(() => fields.find((item) => item.id === selectedId), [fields, selectedId]);
  const isFileLocked = status === "sent" || status === "processing" || submitting;

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

  const checkStatus = async () => {
    const signRequestId = form.signRequestId.trim();
    if (!signRequestId) return;
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/esign/status/${encodeURIComponent(signRequestId)}`, { cache: "no-store" });
      const result = await response.json() as Record<string, any>;
      if (!response.ok) throw new Error(result.message || result.error || "Không thể lấy trạng thái ký.");
      const signStatus = result.signRequestStatus || (result.signRequestId || result.state ? result : result.data);
      const nextState = signStatus?.state?.toUpperCase();
      if (nextState === "COMPLETED" && signStatus?.signedFileUrl) {
        try {
          await replaceWithSignedPdf(signStatus.signedFileUrl, signRequestId);
          setStatus("completed");
          setSignedAt(signStatus.signedAt || signStatus.lastUpdatedAt || "");
          setMessage("Tài liệu đã ký hoàn tất. Bản xem trước đã được cập nhật.");
        } catch (error) {
          setStatus("completed");
          setMessage(error instanceof Error ? error.message : "Đã ký xong nhưng chưa thể hiển thị file đã ký.");
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
        setMessage(nextState === "REJECTED" ? "Người ký đã từ chối yêu cầu ký." : `Yêu cầu ký đã kết thúc với trạng thái ${nextState}.`);
        return;
      }
      setStatus("processing");
      setMessage(`Đang chờ ký${nextState ? ` · ${nextState}` : ""}. Kiểm tra lúc ${new Date().toLocaleTimeString("vi-VN")}.`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Chưa lấy được trạng thái."}`);
    } finally {
      setCheckingStatus(false);
    }
  };

  const setValue = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (!["sent", "processing", "completed"].includes(status)) setStatus("draft");
  };

  const loadFile = async (nextFile: File) => {
    if (nextFile.type !== "application/pdf") {
      setStatus("error");
      setMessage("Vui lòng chọn đúng định dạng PDF.");
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
      if (!form.documentName) setForm((prev) => ({ ...prev, documentName: nextFile.name.replace(/\.pdf$/i, "") }));
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
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadSignedPdf = () => {
    if (!file || !isSignedPreview) return;
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name || `${form.signRequestId}-signed.pdf`;
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
    const requiredValues = [form.signRequestId, form.identificationNumber, form.documentName, form.organizationName];
    if (!file || fields.length === 0 || requiredValues.some((value) => !value.trim())) {
      setStatus("error");
      setMessage("Vui lòng nhập đủ thông tin, chọn PDF và đặt ít nhất một vùng ký.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        const trimmed = value.trim();
        if (trimmed) body.append(key, trimmed);
      });
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
      setMessage("Hồ sơ đã gửi thành công. Đang chờ BankHub gửi callback Webhook để hoàn tất.");
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
            <label><span>Mã yêu cầu <em>*</em></span><input value={form.signRequestId} onChange={(e) => setValue("signRequestId", e.target.value)} placeholder="VD: C-TEST-019" /></label>
            <label><span>Số giấy tờ <em>*</em></span><input value={form.identificationNumber} onChange={(e) => setValue("identificationNumber", e.target.value)} placeholder="CCCD / CMND" inputMode="numeric" /></label>
            <label className="wide-field"><span>Tên tài liệu <em>*</em></span><input value={form.documentName} onChange={(e) => setValue("documentName", e.target.value)} placeholder="Biên bản đối soát" /></label>
            <label className="wide-field"><span>Đơn vị gửi <em>*</em></span><input value={form.organizationName} onChange={(e) => setValue("organizationName", e.target.value)} placeholder="Công ty TNHH..." /></label>
            <label className="wide-field"><span>Mã số thuế <small className="optional-label">Không bắt buộc</small></span><input value={form.taxCode} onChange={(e) => setValue("taxCode", e.target.value)} placeholder="Có thể để trống" inputMode="numeric" /></label>
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
              <div><strong>Đang chọn: vùng {fields.findIndex((field) => field.id === selected.id) + 1}</strong><button type="button" disabled={isFileLocked} onClick={() => removeField(selected.id)}><Trash2 size={16} /> Xoá</button></div>
              <p>{isFileLocked ? "Vùng ký đã được khoá trong lúc chờ xử lý." : "Kéo cả khung để di chuyển · kéo chấm ở góc phải dưới để đổi kích thước."}</p>
            </div>
          )}

          <div className="submit-area">
            {message && <div className={`notice ${status}`}><CheckCircle2 size={17} /> <span>{message}</span></div>}
            {status === "completed" && signedAt && <div className="signed-time">Ký lúc {new Date(signedAt).toLocaleString("vi-VN")}</div>}
            {(status === "sent" || status === "processing") && (
              <div className="poll-controls">
                <button type="button" disabled={checkingStatus} onClick={checkStatus}>
                  {checkingStatus ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
                  {checkingStatus ? "Đang kiểm tra..." : "Cập nhật trạng thái thủ công"}
                </button>
              </div>
            )}
            {["completed", "rejected"].includes(status) ? (
              <div className="completed-actions">
                {isSignedPreview && <button className="download-signed" type="button" onClick={downloadSignedPdf}><Download size={17} /> Tải file đã ký</button>}
                <button className="submit-button new-request" type="button" onClick={createNewRequest}>
                  <RefreshCw size={18} /> Tạo yêu cầu mới
                </button>
              </div>
            ) : (
              <button className="submit-button" disabled={submitting} type="submit">
                {submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                {submitting ? "Đang gửi..." : "Gửi yêu cầu ký"}
              </button>
            )}
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
