import { fileURLToPath } from "node:url";

const inlineLogoAttachment = {
  filename: "ACGCLOGO1.png",
  path: fileURLToPath(new URL("../../public/ACGCLOGO1-email.png", import.meta.url)),
  cid: "acgc-logo@acgc.services",
  contentType: "image/png",
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatFieldValue = (value) => String(value ?? "").split("; ").map(escapeHtml).join("<br>");

export const buildCustomerEmailTemplate = ({
  title,
  summary,
  status,
  orderId,
  fields = [],
  nextSteps,
  actionUrl,
  actionLabel,
  supportEmail,
  supportPhone,
  footerMessage = "This is an automated notification from ACGC Services. Please do not reply directly to this email.",
}) => {
  const safeTitle = escapeHtml(title || "ACGC notification");
  const safeOrderId = escapeHtml(orderId || "");
  const fieldRows = fields
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([label, value]) => `<tr><th align="left" style="width:32%;padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#475569;font-size:13px;font-weight:400">${escapeHtml(label)}</th><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px">${formatFieldValue(value)}</td></tr>`)
    .join("");
  const statusBadge = status
    ? `<span style="display:inline-block;padding:6px 10px;background:#fef2f2;color:#991b1b;font-size:12px;font-weight:bold;text-transform:uppercase">${escapeHtml(status)}</span>`
    : "";
  const orderHeading = safeOrderId
    ? `<div style="margin-top:14px;font-size:13px">ORDER ID <strong style="font-size:16px">${safeOrderId}</strong></div>`
    : "";
  const nextStepBlock = nextSteps
    ? `<div style="margin:22px 0 8px;font-weight:bold">Next steps</div><p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#374151">${escapeHtml(nextSteps)}</p>`
    : "";
  const actionButton = actionUrl && actionLabel
    ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#991b1b;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold">${escapeHtml(actionLabel)}</a>`
    : "";
  const supportLine = supportEmail
    ? `<p style="margin:24px 0 0;font-size:13px;color:#475569">Questions? Contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:#991b1b">${escapeHtml(supportEmail)}</a>${supportPhone ? ` or ${escapeHtml(supportPhone)}` : ""}.</p>`
    : "";
  const summaryBlock = summary
    ? `<p style="font-size:15px;line-height:1.6;margin:16px 0 20px">${escapeHtml(summary)}</p>`
    : "";
  const table = fieldRows
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb">${fieldRows}</table>`
    : "";
  const safeFooter = escapeHtml(footerMessage);
  const logoUrl = "cid:acgc-logo@acgc.services";
  const textFields = fields
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([label, value]) => `${label}: ${value}`);
  const text = [
    `ACGC Services | Aluminum & Glass Services | ${title || "ACGC notification"}`,
    orderId ? `Order ID: ${orderId}` : "",
    summary,
    ...textFields,
    nextSteps ? `Next steps: ${nextSteps}` : "",
    actionUrl && actionLabel ? `${actionLabel}: ${actionUrl}` : "",
    supportEmail ? `Questions? Contact ${supportEmail}${supportPhone ? ` or ${supportPhone}` : ""}.` : "",
    safeFooter,
    "Thank you for choosing ACGC.",
  ].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><tr><td style="padding:24px 28px;background-color:#020617;background-image:radial-gradient(circle at 100% 0%,transparent 0 138px,rgba(255,255,255,.10) 139px 140px,transparent 141px 190px,rgba(255,255,255,.08) 191px 192px,transparent 193px),linear-gradient(135deg,#020617 0%,#111827 56%,#450a0a 100%);color:#fff"><table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px"><tr><td valign="middle" style="padding:0"><img src="${logoUrl}" width="64" height="64" alt="ACGC logo" style="display:block;width:64px;height:64px;border:0;filter:drop-shadow(0 0 4px rgba(255,255,255,.7))"></td><td valign="middle" style="padding-left:14px"><div style="font-size:17px;font-weight:bold;letter-spacing:.2px;color:#fff">ACGC Services</div><div style="margin-top:4px;font-size:13px;color:#dbe4f0">Aluminum &amp; Glass Services</div></td></tr></table><div style="font-size:23px;line-height:1.3;font-weight:bold;color:#fff">${safeTitle}</div>${orderHeading}</td></tr><tr><td style="padding:24px 28px">${statusBadge}${summaryBlock}${table}${nextStepBlock}${actionButton}${supportLine}</td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">${safeFooter}<br>Thank you for choosing ACGC.</td></tr></table></td></tr></table></body></html>`;
  return { html, text, attachments: [{ ...inlineLogoAttachment }] };
};

export { escapeHtml as escapeCustomerEmailHtml };
