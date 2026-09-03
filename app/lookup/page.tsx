"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileSignature,
  Fingerprint,
  LoaderCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from "lucide-react";

type SigningRoundData = {
  requestId?: string;
  signingRound?: {
    device?: {
      model?: string | null;
    };
    signer?: {
      displayName?: string;
    };
    authMethod?: string;
    signedAt?: string;
    certificate?: {
      issuer?: {
        commonName?: string;
        organization?: string;
        country?: string;
      };
      signer?: {
        commonName?: string;
        country?: string;
        taxOrCitizenId?: string;
      };
      documentIntegrity?: string;
      validFrom?: string;
      validTo?: string | null;
      signatureValidity?: string;
      hasTimestamp?: string;
      signedAtLong?: string;
    };
  };
  errorMessage?: string;
  message?: string;
  error?: string;
};

export default function LookupPage() {
  const [orgIdSigned, setOrgIdSigned] = useState("kysoqr.com#vpl2z_");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SigningRoundData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSearch = async (e?: React.FormEvent, customId?: string) => {
    if (e) e.preventDefault();
    const queryId = (customId ?? orgIdSigned).trim();
    if (!queryId) {
      setErrorMsg("Vui lòng nhập mã orgIdSigned cần tra cứu.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setResult(null);

    try {
      const response = await fetch(`/api/esign/signing-round?orgIdSigned=${encodeURIComponent(queryId)}&language=vi`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errorMessage || data.message || data.error || `Tra cứu thất bại (HTTP ${response.status})`);
      }
      if (!data.signingRound) {
        throw new Error(data.errorMessage || data.message || "Không tìm thấy thông tin vòng ký tương ứng.");
      }
      setResult(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Có lỗi xảy ra khi tra cứu.");
    } finally {
      setLoading(false);
    }
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sr = result?.signingRound;
  const cert = sr?.certificate;

  return (
    <div className="lookup-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div><strong>CAS Sign</strong><span>Tra cứu lịch sử ký</span></div>
        </div>

        <nav className="nav-tabs">
          <Link href="/" className="nav-tab">
            <FileSignature size={15} /> Ký tài liệu
          </Link>
          <Link href="/lookup" className="nav-tab active">
            <ShieldCheck size={15} /> Tra cứu chữ ký
          </Link>
        </nav>

        <div className="topbar-spacer" aria-hidden="true" />
      </header>

      <main className="lookup-main">
        <div className="lookup-header">
          <h1>Tra cứu lịch sử chữ ký</h1>
          <p>
            Nhập mã định danh vòng ký <code>orgIdSigned</code> (định dạng <code>organization#id_signed</code>) để xác thực tính hợp pháp, chứng thư số và thông tin người ký.
          </p>
        </div>

        <section className="lookup-box-card">
          <form onSubmit={(e) => handleSearch(e)}>
            <div className="lookup-input-row">
              <input
                type="text"
                value={orgIdSigned}
                onChange={(e) => setOrgIdSigned(e.target.value)}
                placeholder="Nhập mã orgIdSigned (ví dụ: kysoqr.com#vpl2z_)"
                disabled={loading}
              />
              <button type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
                {loading ? "Đang tra cứu..." : "Tra cứu"}
              </button>
            </div>
          </form>

          <div className="quick-samples">
            <span>Mẫu thử nghiệm:</span>
            <button
              type="button"
              className="sample-chip"
              onClick={() => {
                setOrgIdSigned("kysoqr.com#vpl2z_");
                handleSearch(undefined, "kysoqr.com#vpl2z_");
              }}
            >
              kysoqr.com#vpl2z_
            </button>
          </div>
        </section>

        {errorMsg && (
          <div className="notice error">
            <AlertCircle size={18} />
            <div>
              <strong>Không tìm thấy dữ liệu hoặc có lỗi</strong>
              <p style={{ marginTop: 3 }}>{errorMsg}</p>
            </div>
          </div>
        )}

        {result && sr && (
          <div className="lookup-result">
            <div className="result-banner">
              <div className="result-status-block">
                <div className="status-icon-badge">
                  <ShieldCheck size={26} />
                </div>
                <div>
                  <strong>{cert?.signatureValidity || "Chữ ký hợp lệ tại thời điểm ký"}</strong>
                  <span>Mã yêu cầu tra cứu: <code>{result.requestId}</code></span>
                </div>
              </div>

              <div className="result-meta-tags">
                <span className="meta-tag">
                  <Clock size={13} /> {sr.signedAt || cert?.signedAtLong || "Đã ký"}
                </span>
                <span className="meta-tag">
                  <ShieldAlert size={13} /> {cert?.documentIntegrity || "Không bị thay đổi"}
                </span>
                <span className="meta-tag">
                  <Fingerprint size={13} /> Dấu thời gian: {cert?.hasTimestamp || "Có"}
                </span>
              </div>
            </div>

            <div className="lookup-grid">
              <div className="lookup-card">
                <h3><UserCheck size={17} style={{ color: "var(--green)" }} /> Thông tin Người ký</h3>
                <div className="info-list">
                  <div className="info-item">
                    <span className="info-label">Tên hiển thị:</span>
                    <span className="info-value highlight">{sr.signer?.displayName || "—"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Họ tên trên chứng thư:</span>
                    <span className="info-value">{cert?.signer?.commonName || "—"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">CCCD / MST:</span>
                    <span className="info-value">{cert?.signer?.taxOrCitizenId || "—"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Quốc gia:</span>
                    <span className="info-value">{cert?.signer?.country || "VN"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Phương thức xác thực:</span>
                    <span className="info-value">{sr.authMethod || "Xác thực mã PIN trên Cas ID"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Thiết bị ký:</span>
                    <span className="info-value" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Smartphone size={13} /> {sr.device?.model || "Ứng dụng Cas ID"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="lookup-card">
                <h3><ShieldCheck size={17} style={{ color: "var(--green)" }} /> Chứng thư số & Đơn vị cấp (CA)</h3>
                <div className="info-list">
                  <div className="info-item">
                    <span className="info-label">Nhà cung cấp CA:</span>
                    <span className="info-value highlight">{cert?.issuer?.commonName || "—"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Tổ chức cấp:</span>
                    <span className="info-value">{cert?.issuer?.organization || "—"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Hiệu lực từ:</span>
                    <span className="info-value">{cert?.validFrom || "—"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Hiệu lực đến:</span>
                    <span className="info-value">{cert?.validTo || "Vô thời hạn / Đang hoạt động"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Tính toàn vẹn:</span>
                    <span className="info-value highlight">{cert?.documentIntegrity || "Toàn vẹn"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Thời gian ký chi tiết:</span>
                    <span className="info-value">{cert?.signedAtLong || sr.signedAt || "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="raw-json-card">
              <div className="raw-json-header" onClick={() => setShowRawJson(!showRawJson)}>
                <span>Dữ liệu JSON gốc từ API Signing-Round</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); copyJson(); }}>
                    <Copy size={12} /> {copied ? "Đã chép!" : "Sao chép JSON"}
                  </button>
                  {showRawJson ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              {showRawJson && (
                <pre className="raw-json-content">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
