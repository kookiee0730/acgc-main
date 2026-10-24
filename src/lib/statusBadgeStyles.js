export const statusBadgeBaseClassName = "inline-flex max-w-full items-center justify-center whitespace-normal break-words rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-tight";

export const getPaymentStatusLabel = (status = {}) => (
  status.key === "pending" ? "Awaiting Payment" : status.label || "Unknown"
);

export const getPaymentStatusBadgeClassName = (statusKey, darkMode = false) => {
  const palettes = {
    paid: darkMode
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: darkMode
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-amber-200 bg-amber-50 text-amber-800",
    partial_downpayment: darkMode
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-amber-200 bg-amber-50 text-amber-800",
    downpayment: darkMode
      ? "border-violet-500/40 bg-violet-500/10 text-violet-200"
      : "border-violet-200 bg-violet-50 text-violet-800",
    partial: darkMode
      ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
      : "border-sky-200 bg-sky-50 text-sky-800",
  };
  return palettes[statusKey] || (darkMode
    ? "border-slate-600 bg-slate-800 text-slate-300"
    : "border-slate-200 bg-slate-50 text-slate-700");
};

export const getContractSignoffBadgeClassName = (darkMode = false) => darkMode
  ? "border-sky-400/40 bg-sky-500/10 text-sky-200"
  : "border-sky-200 bg-sky-50 text-sky-800";

export const isAwaitingContractSignoff = (order = {}) => {
  const contractStatus = String(order.contract_status || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const orderStatus = String(order.status || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (contractStatus === "sent" || orderStatus === "contract sent") return true;
  const acceptedStatus = contractStatus === "accepted" || orderStatus === "contract accepted";
  const acceptedByCustomer = order.acceptedByCustomer === true
    || Boolean(order.contract_signed_date || order.signed_contract_url)
    || order.acceptance_method === "walk_in_signed_contract";
  return Boolean(order.contractSentAt && acceptedStatus && !acceptedByCustomer);
};
