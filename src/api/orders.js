import { apiFetch, API_BASE } from "./client";

export const getOrders = () => apiFetch("/orders", { cache: "no-store" });

const inFlightAdminOrderRequests = new Map();
const inFlightAdminOrderDetails = new Map();

export const getAdminOrders = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const path = `/orders/admin/list${query ? `?${query}` : ""}`;
  const existingRequest = inFlightAdminOrderRequests.get(path);
  if (existingRequest) return existingRequest;

  const request = apiFetch(path, { cache: "no-store" }).finally(() => {
    inFlightAdminOrderRequests.delete(path);
  });
  inFlightAdminOrderRequests.set(path, request);
  return request;
};

export const downloadTransactionReport = async (filters = {}) => {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString();
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE}/orders/admin/reports${query ? `?${query}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || "Unable to generate transaction report.");
    error.data = errorData;
    throw error;
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "ACGC_Transactions.xlsx";
  return { blob: await response.blob(), filename };
};

export const getAdminOrder = (orderId, module) => {
  const query = module ? `?module=${encodeURIComponent(module)}` : "";
  const path = `/orders/admin/${encodeURIComponent(orderId)}${query}`;
  const existingRequest = inFlightAdminOrderDetails.get(path);
  if (existingRequest) return existingRequest;

  const request = apiFetch(path, { cache: "no-store" }).finally(() => {
    inFlightAdminOrderDetails.delete(path);
  });
  inFlightAdminOrderDetails.set(path, request);
  return request;
};

export const getProductReviews = (productId) => apiFetch(`/orders/reviews/product/${encodeURIComponent(productId)}`);
export const getCustomerFeedbackSummary = () => apiFetch("/orders/reviews/summary", { cache: "no-store" });
export const getProductReviewSummary = (productId) =>
  apiFetch(`/orders/reviews/product/${encodeURIComponent(productId)}/summary`);

export const updateOrderStatus = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const updateOrderInspection = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/inspection`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const updateOrderProgress = (orderId, payload) =>
  apiFetch(`/orders/admin/${orderId}/progress`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const respondToContract = (orderId, payload) =>
  apiFetch(`/orders/${orderId}/contract`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const acceptContract = (orderId) => respondToContract(orderId, { action: "accept" });
export const declineContract = (orderId) => respondToContract(orderId, { action: "decline" });
export const respondToInstallationSchedule = (orderId, payload) =>
  apiFetch(`/orders/${orderId}/installation-schedule`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const createOrder = (payload) =>
  apiFetch("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createInspection = (payload) =>
  apiFetch("/orders/admin/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const trackOrder = (tracking) => apiFetch(`/orders/track/${encodeURIComponent(tracking)}`);

export const generateContract = (orderId, payload = {}) =>
  apiFetch(`/orders/admin/${orderId}/contract`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const submitOrderReview = (orderId, payload = {}) =>
  apiFetch(`/orders/${orderId}/review`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteOrderReview = (orderId, itemIndex) =>
  apiFetch(`/orders/admin/${orderId}/review${Number.isInteger(itemIndex) ? `?itemIndex=${itemIndex}` : ""}`, {
    method: "DELETE",
  });

export const setOrderReviewVisibility = (orderId, { itemIndex, hiddenFromCustomers }) =>
  apiFetch(`/orders/admin/${orderId}/review/visibility`, {
    method: "PUT",
    body: JSON.stringify({ itemIndex, hiddenFromCustomers }),
  });

export const respondToCustomerReview = (orderId, { itemIndex, response }) =>
  apiFetch(`/orders/admin/${orderId}/review/response`, {
    method: "PUT",
    body: JSON.stringify({ itemIndex, response }),
  });

export const cancelCustomerOrder = (orderId, payload = {}) =>
  apiFetch(`/orders/${orderId}/cancel`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const sendWalkInApprovalEmail = (orderId, payload = {}) =>
  apiFetch(`/orders/admin/${orderId}/send-contract-email`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
