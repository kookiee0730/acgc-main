import { apiFetch, API_BASE } from "./client";
import { uploadFiles } from "./uploads";

export const searchCustomers = (query) =>
  apiFetch(`/auth/customers?search=${encodeURIComponent(query)}`);

export const getAdminUsers = (params = {}) => {
  const query = new URLSearchParams();
  if (params.role && params.role !== "all") query.set("role", params.role);
  if (params.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/auth/users${suffix}`);
};

export const updateAdminUserAccess = (userId, payload) =>
  apiFetch(`/auth/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const unrestrictCustomerOnlineOrdering = (userId) =>
  apiFetch(`/auth/users/${userId}/unrestrict-online-ordering`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });

export const getSystemSettings = () => apiFetch("/auth/system-settings");
export const getPublicCustomerPermissions = () => apiFetch("/auth/customer-permissions");
export const getCustomerPaymentContact = () => apiFetch("/auth/customer-payment-contact", { cache: "no-store" });

export const updateSystemSettings = (payload) =>
  apiFetch("/auth/system-settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const createSystemBackup = (type) =>
  apiFetch("/auth/system-settings/backups", {
    method: "POST",
    body: JSON.stringify({ type }),
  });

export const setBackupRecoveryPassword = (payload) =>
  apiFetch("/auth/system-settings/backups/recovery-password", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const requestBackupRecoveryPasswordReset = () =>
  apiFetch("/auth/system-settings/backups/recovery-password/forgot", {
    method: "POST",
    body: JSON.stringify({}),
  });

export const verifyBackupRecoveryPasswordResetCode = (code) =>
  apiFetch("/auth/system-settings/backups/recovery-password/forgot/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const resetBackupRecoveryPassword = (payload) =>
  apiFetch("/auth/system-settings/backups/recovery-password/forgot", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const getBackupRecoveryPassword = () =>
  apiFetch("/auth/system-settings/backups/recovery-password", { cache: "no-store" });

export const uploadSystemBackup = (file) => {
  if (import.meta.env.PROD) {
    return uploadFiles([file], undefined, {
      purpose: "backup-import",
      access: "private",
      multipart: file.size > 100 * 1024 * 1024,
    }).then((result) => {
      const uploaded = result.files?.[0];
      // Cloudinary raw uploads can omit `format` when the extension is already
      // part of the public ID. Keep the original backup extension for the
      // authenticated download URL in that case.
      const format = uploaded?.format || file.name.split(".").pop()?.toLowerCase();
      if (!uploaded?.public_id || !format) throw new Error("Backup upload did not return a Cloudinary asset ID.");
      return apiFetch("/auth/system-settings/backups/import-cloudinary", {
        method: "POST",
        body: JSON.stringify({ public_id: uploaded.public_id, format }),
      });
    });
  }

  const body = new FormData();
  body.append("backupFile", file);
  return apiFetch("/auth/system-settings/backups/import", {
    method: "POST",
    body,
  });
};

export const restoreSystemBackup = (backupId, recoveryPassword) =>
  apiFetch(`/auth/system-settings/backups/${encodeURIComponent(backupId)}/restore`, {
    method: "POST",
    body: JSON.stringify({ recovery_password: recoveryPassword }),
  });

export const deleteSystemBackup = (backupId) =>
  apiFetch(`/auth/system-settings/backups/${encodeURIComponent(backupId)}`, {
    method: "DELETE",
  });

export const downloadSystemBackup = async (backupId) => {
  const token = localStorage.getItem("token");
  const response = await fetch(
    `${API_BASE}/auth/system-settings/backups/${encodeURIComponent(backupId)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Unable to download backup.");
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `backup-${backupId}.zip`;
  return { blob: await response.blob(), filename };
};
