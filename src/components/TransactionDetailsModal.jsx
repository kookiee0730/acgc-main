import { useEffect, useRef } from "react";
import { XCircle } from "lucide-react";
import { formatDateToMMMDDYYYY } from "@/lib/dateUtils";
import { getPaymentSummary } from "@/pages/Transactions/paymentProofUtils";

const getInstallationCompletionDate = (order, item = null) => {
  const stages = item?.progress_stages?.length
    ? item.progress_stages
    : order?.progress_stages || order?.stages || [];
  const installationStage = stages.find((stage) => {
    const key = String(stage.key || "").toLowerCase();
    const name = String(stage.name || "").toLowerCase();
    const isInstallation = (key.includes("installation") || name.includes("installation"))
      && !key.includes("schedul")
      && !name.includes("schedul");
    const isComplete = stage.completed === true
      || ["done", "completed"].includes(String(stage.status || "").toLowerCase());
    return isInstallation && isComplete;
  });
  const stageDate = installationStage?.date || installationStage?.completedAt;
  if (!stageDate) return null;
  const parsedDate = new Date(stageDate);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate <= new Date() ? parsedDate : null;
};

const parseWarrantyPeriod = (value) => {
  if (!value) return null;
  if (typeof value === "number") return { days: value };
  const normalized = value.toString().toLowerCase();
  const yearMatch = normalized.match(/(\d+)\s*year/);
  if (yearMatch) return { days: Number(yearMatch[1]) * 365 };
  const monthMatch = normalized.match(/(\d+)\s*month/);
  if (monthMatch) return { days: Number(monthMatch[1]) * 30 };
  const daysMatch = normalized.match(/(\d+)\s*day/);
  if (daysMatch) return { days: Number(daysMatch[1]) };
  const numericDays = Number(normalized);
  return Number.isFinite(numericDays) ? { days: numericDays } : null;
};

const computeWarrantyExpiryDate = (start, periodValue) => {
  const expiry = new Date(start || new Date());
  const duration = parseWarrantyPeriod(periodValue) || { days: 365 };
  expiry.setDate(expiry.getDate() + duration.days);
  return expiry;
};

function TransactionDetailsModal({ order, onClose, onViewContract, scrollToWarranty = false, darkMode = false, hidePaymentAmounts = false }) {
  const contentRef = useRef(null);
  const warrantyHeadingRef = useRef(null);

  useEffect(() => {
    if (!order || !scrollToWarranty) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      const heading = warrantyHeadingRef.current;
      if (!content || !heading) return;

      const offset = heading.getBoundingClientRect().top - content.getBoundingClientRect().top;
      content.scrollTo({ top: content.scrollTop + offset - 8, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [order?._id, scrollToWarranty]);

  if (!order) return null;

  const previewItems = Array.isArray(order.items) ? order.items : [];
  const primaryWarrantyItem = previewItems[0] || {};
  const perProductWarranty = order.warranty_assignment_mode === "per_product";
  const warrantyStatus = String(primaryWarrantyItem.warranty_status || order.warranty_status || "").toLowerCase();
  const warrantyPeriod = primaryWarrantyItem.warranty_period || (perProductWarranty
    ? ""
    : order.warranty_period || order.warranty_period_value || order.warranty_days || "");
  const isNoWarranty = String(warrantyPeriod).trim().toLowerCase() === "no warranty" || warrantyStatus === "no_warranty";
  const warrantyDays = Number(primaryWarrantyItem.custom_warranty_days || order.custom_warranty_days)
    || parseWarrantyPeriod(warrantyPeriod)?.days
    || 90;
  const installationDate = getInstallationCompletionDate(order, primaryWarrantyItem);
  const storedWarrantyStart = warrantyStatus === "pending"
    ? null
    : order.warranty_start_date || order.warrantyStartDate || order.warranty_start || primaryWarrantyItem.warranty_start_date;
  const savedWarrantyStart = isNoWarranty ? null : storedWarrantyStart || installationDate;
  const derivedWarrantyExpiry = savedWarrantyStart ? new Date(savedWarrantyStart) : null;
  if (derivedWarrantyExpiry) derivedWarrantyExpiry.setDate(derivedWarrantyExpiry.getDate() + warrantyDays);
  const storedWarrantyExpiry = warrantyStatus === "pending"
    ? null
    : order.warranty_expiry_date || order.warrantyExpiryDate || order.warranty_end_date || order.warranty_end || primaryWarrantyItem.warranty_expiry_date;
  const previewWarrantyExpiry = isNoWarranty ? null : storedWarrantyExpiry || derivedWarrantyExpiry;
  const warrantyPeriodText = isNoWarranty ? "No Warranty" : warrantyPeriod || `${warrantyDays}-day warranty`;
  const remainingWarrantyDays = savedWarrantyStart && previewWarrantyExpiry
    ? Math.max(0, Math.ceil((new Date(previewWarrantyExpiry) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;
  const pendingWarrantyLabel = installationDate ? "Pending activation" : "Pending installation";
  const formattedStart = isNoWarranty ? "—" : formatDateToMMMDDYYYY(savedWarrantyStart) || "Pending installation";
  const formattedExpiry = isNoWarranty ? "—" : formatDateToMMMDDYYYY(previewWarrantyExpiry) || pendingWarrantyLabel;
  const warrantyRemainingLabel = isNoWarranty
    ? "No warranty"
    : remainingWarrantyDays === null
      ? pendingWarrantyLabel
      : new Date(previewWarrantyExpiry) <= new Date()
        ? "Expired"
        : `${remainingWarrantyDays} days remaining`;
  const warrantyRemainingBadgeClass = warrantyRemainingLabel === "Expired"
    ? "bg-slate-200 text-slate-700"
    : warrantyRemainingLabel === "No warranty"
      ? "bg-slate-100 text-slate-600"
      : remainingWarrantyDays === null
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-700";
  const contractNo = order.contract_number || order.contractId || order.tracking || order._id || "N/A";
  const createdDate = order.createdAt || order.updatedAt || order.contract_date || new Date();
  const inspectionDate = formatDateToMMMDDYYYY(order.inspection_date) || "TBD";
  const paymentTermsText = order.payment_terms || "50% downpayment, 50% upon completion";
  const hasBatchItems = previewItems.length > 1;
  const getPreviewItemWarranty = (item) => {
    const itemStatus = String(item.warranty_status || order.warranty_status || "").toLowerCase();
    const period = item.warranty_period || (perProductWarranty ? "" : order.warranty_period);
    const isNoWarranty = period === "No Warranty" || itemStatus === "no_warranty";
    const customDays = Number(item.custom_warranty_days || order.custom_warranty_days) || 0;
    const durationDays = period === "Custom"
      ? customDays || 90
      : parseWarrantyPeriod(period)?.days || Number(period) || null;
    const installationDate = getInstallationCompletionDate(order, item);
    const isInstalled = Boolean(installationDate);
    const storedStart = item.warranty_status === "pending" ? null : item.warranty_start_date;
    const startDate = isNoWarranty ? null : storedStart ? new Date(storedStart) : installationDate;
    const storedExpiry = item.warranty_status === "pending" ? null : item.warranty_expiry_date;
    const expiryDate = isNoWarranty || !startDate || !durationDays
      ? null
      : storedExpiry ? new Date(storedExpiry) : computeWarrantyExpiryDate(startDate, durationDays);
    const now = new Date();
    const startsInFuture = Boolean(startDate && startDate > now);
    const hasStartedCoverage = Boolean(startDate && startDate <= now && durationDays);
    const isActive = !isNoWarranty
      && itemStatus !== "expired"
      && (itemStatus === "active" || (isInstalled && hasStartedCoverage))
      && !startsInFuture
      && (!expiryDate || expiryDate > now);
    const statusLabel = isNoWarranty
      ? "No warranty"
      : isActive
        ? "Active"
        : itemStatus === "expired" || (expiryDate && expiryDate <= new Date())
          ? "Expired"
          : isInstalled ? "Pending activation" : "Pending installation";

    return {
      periodLabel: isNoWarranty ? "No Warranty" : durationDays ? `${durationDays} days` : "Not assigned",
      startLabel: isNoWarranty ? "—" : startDate ? formatDateToMMMDDYYYY(startDate) || "TBD" : "Pending installation",
      expiryLabel: isNoWarranty ? "—" : expiryDate ? formatDateToMMMDDYYYY(expiryDate) || "TBD" : isInstalled ? "Pending activation" : "Pending installation",
      statusLabel,
    };
  };
  const paymentSummary = getPaymentSummary(order);
  const orderIdentifier = order.tracking || order._id || order.id || "—";
  const customerName = order.customer_name
    || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim()
    || "Customer";
  const projectStatus = String(order.status || "pending").replace(/_/g, " ");
  const orderType = order.order_type === "walk_in_customer" ? "Walk-in Order" : "Website Order";

  return (
    <div className="mobile-fullscreen-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-3 py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-5">
      <div className="mobile-fullscreen-dialog relative flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-[620px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-[0_18px_50px_rgba(15,23,42,0.22)] sm:max-h-[90dvh]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">TRANSACTION DETAILS</div>
            <div className="mt-1 text-[17px] font-bold leading-tight text-slate-800">{customerName}</div>
            <div className="text-[11px] text-slate-500">Order ID: {orderIdentifier}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
            aria-label="Close transaction details"
          >
            <XCircle size={16} />
          </button>
        </div>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100 p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${paymentSummary.status.key === "paid" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {paymentSummary.status.label}
            </span>
            <span className="rounded-md border border-blue-200 bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">{projectStatus}</span>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700">{orderType}</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-3">
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">CLIENT INFORMATION</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1"><div className="text-[10px] font-semibold text-slate-500">Full Name</div><div className="text-[13px] font-semibold text-slate-800">{customerName}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-semibold text-slate-500">Order ID</div><div className="break-all text-[13px] font-semibold text-slate-800">{orderIdentifier}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-semibold text-slate-500">Email</div><div className="text-[13px] text-slate-700">{order.customer?.email || order.customer_email || "N/A"}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-semibold text-slate-500">Phone</div><div className="text-[13px] text-slate-700">{order.customer?.phone || order.customer_phone || "N/A"}</div></div>
              <div className="space-y-1 md:col-span-2"><div className="text-[10px] font-semibold text-slate-500">Address</div><div className="text-[13px] text-slate-700">{order.shipping_address || order.address || "N/A"}</div></div>
            </div>
          </section>

          <section className="mt-3 rounded-md border border-slate-200 bg-white p-3">
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">MEASUREMENTS &amp; PROGRESS MATRIX</h3>
            {previewItems.length > 0 ? <div className="space-y-2">
              {previewItems.map((item, index) => {
                const itemName = item.name || item.product_name || `Item ${index + 1}`;
                return <div key={`${itemName}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
                  <div className="font-semibold text-slate-800">{itemName}</div>
                  <div className="mt-1 text-slate-600">Size: {item.width || "—"}W x {item.height || "—"}H | Qty: {item.quantity || 1} | Base Rate: {hidePaymentAmounts ? "••••••" : `₱${Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/sqft`}</div>
                </div>;
              })}
            </div> : <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">No item measurements available.</div>}
          </section>

          <section className="mt-3 rounded-md border border-slate-200 bg-white p-3">
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">PAYMENT BREAKDOWN</h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Total Project Amount</span><span className="font-semibold text-slate-800">{hidePaymentAmounts ? "••••••" : `₱${paymentSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span></div>
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Amount Paid</span><span className="font-semibold text-slate-800">{hidePaymentAmounts ? "••••••" : `₱${paymentSummary.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-slate-600">Remaining Balance</span><span className="font-bold text-red-600">{hidePaymentAmounts ? "••••••" : `₱${paymentSummary.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${paymentSummary.totalAmount > 0 ? Math.min((paymentSummary.paidAmount / paymentSummary.totalAmount) * 100, 100) : 0}%` }} /></div>
            </div>
          </section>

          <section className="mt-3 rounded-md border border-slate-200 bg-white p-3">
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">PAYMENT INFORMATION</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><div className="text-[10px] font-semibold text-slate-500">Payment Terms</div><div className="text-[13px] text-slate-700">{paymentTermsText}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-semibold text-slate-500">Payment Date</div><div className="text-[13px] text-slate-700">—</div></div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <h4 className="mb-3 border-b border-slate-200 pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">CONTRACT INFORMATION</h4>
                <div className="space-y-2 text-[13px] text-slate-700">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Contract No.</span><span className="font-semibold text-slate-800">{contractNo}</span></div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Date Created</span><span className="font-semibold text-slate-800">{formatDateToMMMDDYYYY(createdDate)}</span></div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Inspection Date</span><span className="font-semibold text-slate-800">{inspectionDate}</span></div>
                </div>
              </div>

              <div className={`rounded-md border p-3 transition-colors duration-500 ${scrollToWarranty
                ? darkMode
                  ? "border-amber-500/60 bg-slate-800 ring-2 ring-amber-400/20 shadow-sm"
                  : "border-amber-400 bg-amber-50 ring-2 ring-amber-200 shadow-sm"
                : "border-slate-200 bg-slate-50"}`}>
                <h4 ref={warrantyHeadingRef} className={`mb-3 border-b pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] ${scrollToWarranty
                  ? darkMode ? "border-amber-700 text-amber-300" : "border-amber-300 text-amber-900"
                  : "border-slate-200 text-slate-500"}`}>WARRANTY INFORMATION</h4>
                <div className={hasBatchItems ? "space-y-3" : "space-y-2 text-[13px] text-slate-700"}>
                  {hasBatchItems ? previewItems.map((item, index) => {
                    const itemName = item.name || item.product_name || `Product ${index + 1}`;
                    const warranty = getPreviewItemWarranty(item);
                    const statusClass = warranty.statusLabel === "Active" ? "bg-emerald-50 text-emerald-700" : warranty.statusLabel === "Expired" || warranty.statusLabel === "No warranty" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700";
                    return <div key={`${itemName}-warranty-${index}`} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h5 className="break-words text-sm font-semibold text-slate-900">{itemName}</h5><p className="mt-1 text-xs text-slate-500">{warranty.periodLabel}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>{warranty.statusLabel}</span></div>
                      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2"><div className="min-w-0 rounded-md bg-slate-50 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Warranty Start</p><p className="mt-1 break-words text-sm font-medium text-slate-800">{warranty.startLabel}</p></div><div className="min-w-0 rounded-md bg-slate-50 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Warranty End</p><p className="mt-1 break-words text-sm font-medium text-slate-800">{warranty.expiryLabel}</p></div></div>
                    </div>;
                  }) : <>
                    <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Warranty Start</span><span className="font-semibold text-slate-800">{formattedStart}</span></div>
                    <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2"><span className="text-slate-600">Warranty End</span><span className="font-semibold text-slate-800">{formattedExpiry}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-slate-600">Remaining Warranty Days ({warrantyPeriodText})</span><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${warrantyRemainingBadgeClass}`}>{warrantyRemainingLabel}</span></div>
                  </>}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:w-auto sm:py-1.5">Close</button>
          {onViewContract && <button type="button" onClick={onViewContract} className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 sm:w-auto sm:py-1.5">View Contract</button>}
        </div>
      </div>
    </div>
  );
}

export default TransactionDetailsModal;
