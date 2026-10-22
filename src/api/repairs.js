import { apiFetch } from "./client";

export const getRepairableOrders = () => apiFetch("/repairs/customer/orders", { cache: "no-store" });
export const getCustomerRepairRequests = () => apiFetch("/repairs/customer", { cache: "no-store" });
export const createCustomerRepairRequest = (payload) => apiFetch("/repairs/customer/requests", { method: "POST", body: JSON.stringify(payload) });
export const respondToRepairQuotation = (repairId, payload) => apiFetch(`/repairs/customer/${encodeURIComponent(repairId)}/quotation-response`, { method: "POST", body: JSON.stringify(payload) });
export const submitRepairPaymentProof = (repairId, payload) => apiFetch(`/repairs/customer/${encodeURIComponent(repairId)}/payment-proof`, { method: "POST", body: JSON.stringify(payload) });
export const getRepairRequests = (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return apiFetch(`/repairs/admin/requests${query.size ? `?${query}` : ""}`, { cache: "no-store" });
};
export const approveWarrantyClaim = (repairId, payload) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/approve-warranty`, { method: "POST", body: JSON.stringify(payload) });
export const rejectWarrantyClaim = (repairId, payload) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/reject-warranty`, { method: "POST", body: JSON.stringify(payload) });
export const issueRepairQuotation = (repairId, payload) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/quotation`, { method: "POST", body: JSON.stringify(payload) });
export const reviewRepairPaymentProof = (repairId, payload) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/payment-proof/review`, { method: "POST", body: JSON.stringify(payload) });
export const scheduleRepair = (repairId, payload) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/schedule`, { method: "POST", body: JSON.stringify(payload) });
export const startRepair = (repairId) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/start`, { method: "POST", body: JSON.stringify({}) });
export const completeRepair = (repairId, payload) => apiFetch(`/repairs/admin/requests/${encodeURIComponent(repairId)}/complete`, { method: "POST", body: JSON.stringify(payload) });
