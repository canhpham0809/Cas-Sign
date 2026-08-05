"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  GripVertical,
  LoaderCircle,
  Plus,
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

const initialForm: FormState = {
  signRequestId: "",
  identificationNumber: "",
  documentName: "",
  organizationName: "",
  taxCode: "",
};

const defaultField = (page = 1): SignatureField => ({
  id: crypto.randomUUID(),
  page,
  xRatio: 0.56,
  yRatio: 0.76,
  widthRatio: 0.3,
  heightRatio: 0.095,
  fieldType: "SIGNATURE",
});

function PdfPage({ pdf, pageNumber, fields, selectedId, onSelect, onMove }: {
  pdf: any;
  pageNumber: number;
  fields: SignatureField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
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

  return (
    <div className="pdf-page-wrap">
      <div className="page-number">Trang {pageNumber}</div>
      <div className="pdf-page" ref={pageRef}>
        <canvas ref={canvasRef} />
        {fields.map((field, index) => (
          <button
            type="button"
            key={field.id}
            className={`signature-box ${selectedId === field.id ? "selected" : ""}`}
            style={{
              left: `${field.xRatio * 100}%`,
              top: `${field.yRatio * 100}%`,
              width: `${field.widthRatio * 100}%`,
              height: `${field.heightRatio * 100}%`,
            }}
            onPointerDown={(e) => startDrag(e, field)}
            aria-label={`Vùng ký ${index + 1} trên trang ${pageNumber}`}
          >
            <GripVertical size={16} />
            <span>Vị trí ký</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"draft" | "sent" | "error">("draft");
  const [message, setMessage] = useState("");

  const selected = useMemo(() => fields.find((item) => item.id === selectedId), [fields, selectedId]);

  const setValue = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus("draft");
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
      const first = defaultField(1);
      setFields([first]);
      setSelectedId(first.id);
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
    const item = defaultField(selected?.page || 1);
    setFields((prev) => [...prev, item]);
    setSelectedId(item.id);
  };

  const updateField = (id: string, patch: Partial<SignatureField>) => {
    setFields((prev) => prev.map((field) => field.id === id ? { ...field, ...patch } : field));
    setStatus("draft");
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((field) => field.id !== id));
    setSelectedId(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || fields.length === 0 || Object.values(form).some((value) => !value.trim())) {
      setStatus("error");
      setMessage("Vui lòng nhập đủ thông tin, chọn PDF và đặt ít nhất một vùng ký.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value.trim()));
      body.append("signatureFields", JSON.stringify(fields.map(({ id: _id, ...field }) => field)));
      body.append("file", file);
      const response = await fetch("/api/esign", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || "Dịch vụ ký số chưa phản hồi thành công.");
      setStatus("sent");
      setMessage("Hồ sơ đã được gửi sang hệ thống ký số.");
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
          {status === "sent" ? "Đã gửi yêu cầu" : status === "error" ? "Cần kiểm tra" : "Bản nháp"}
        </div>
      </header>

      <form className="workspace" onSubmit={submit}>
        <aside className="sidebar">
          <div className="side-heading">
            <div><span className="step-label">BƯỚC 1</span><h1>Thông tin ký</h1></div>
            <span className="required-note">* Bắt buộc</span>
          </div>

          <div className="fields-grid">
            <label>Mã yêu cầu ký <em>*</em><input value={form.signRequestId} onChange={(e) => setValue("signRequestId", e.target.value)} placeholder="VD: C-TEST-019" /></label>
            <label>Số giấy tờ <em>*</em><input value={form.identificationNumber} onChange={(e) => setValue("identificationNumber", e.target.value)} placeholder="CCCD / CMND" inputMode="numeric" /></label>
            <label>Tên tài liệu <em>*</em><input value={form.documentName} onChange={(e) => setValue("documentName", e.target.value)} placeholder="Biên bản đối soát" /></label>
            <label>Tên tổ chức <em>*</em><input value={form.organizationName} onChange={(e) => setValue("organizationName", e.target.value)} placeholder="Công ty TNHH..." /></label>
            <label>Mã số thuế <em>*</em><input value={form.taxCode} onChange={(e) => setValue("taxCode", e.target.value)} placeholder="Nhập mã số thuế" inputMode="numeric" /></label>
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
              <button type="button" onClick={() => { setFile(null); setPdf(null); setFields([]); setPageCount(0); }} aria-label="Bỏ file"><X size={17} /></button>
            </div>
          )}

          {file && <button className="add-signature" type="button" onClick={addField}><Plus size={17} /> Thêm vùng ký</button>}

          {selected && (
            <div className="field-editor">
              <div><strong>Vùng ký đang chọn</strong><button type="button" onClick={() => removeField(selected.id)}><Trash2 size={16} /> Xoá</button></div>
              <label>Đặt tại trang
                <div className="select-wrap"><select value={selected.page} onChange={(e) => updateField(selected.id, { page: Number(e.target.value) })}>{Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>Trang {i + 1}</option>)}</select><ChevronDown size={16} /></div>
              </label>
              <p>Kéo khung màu xanh trên tài liệu để đặt đúng vị trí cần ký.</p>
            </div>
          )}

          <div className="submit-area">
            {message && <div className={`notice ${status}`}><CheckCircle2 size={17} /> <span>{message}</span></div>}
            <button className="submit-button" disabled={submitting} type="submit">
              {submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
              {submitting ? "Đang gửi..." : "Gửi yêu cầu ký"}
            </button>
            <span>Bằng việc tiếp tục, bạn xác nhận thông tin trên là chính xác.</span>
          </div>
        </aside>

        <section className="document-area">
          <div className="document-toolbar">
            <div><span className="step-label">BƯỚC 3</span><h2>Đặt vị trí ký</h2></div>
            {file && <div className="field-count"><span>{fields.length}</span> vùng ký</div>}
          </div>
          <div className="document-scroll">
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
                    onSelect={setSelectedId}
                    onMove={(id, x, y) => updateField(id, { xRatio: x, yRatio: y })}
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
