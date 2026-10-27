import { FileText, X } from "lucide-react";
import logo from "@/assets/images/ACGCLOGO1.png";
import approvedStamp from "@/assets/approved.png";
import { formatDateToMMMDDYYYY } from "@/lib/dateUtils";
import { getFinalProjectCost, getRequiredDownpayment } from "@/lib/orderPricing";
import { getContractBladeDetails } from "@/pages/SiteInspection/contractState";

function ContractModal({ isOpen, onClose, inspection, contractData, onAccept, onDecline, onRegenerate, isLoading, actionError, onDownload, onDownloadPNG, onPrint, onSendToCustomer, isSendingToCustomer = false, notificationRecordId = null, transparentBackdrop = false, acceptedOverride, awaitingResponseOverride, hidePaymentAmounts = false }) {
  if (!isOpen || !inspection || !contractData) return null;

  const darkMode = false;

  const formatCurrency = (value) => hidePaymentAmounts ? "••••••" : new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

  const shellClass = darkMode
    ? "mobile-fullscreen-dialog flex h-[94dvh] max-h-[94dvh] w-[min(100%,210mm)] flex-col overflow-hidden rounded-2xl border border-slate-600 bg-[#0d1f2f] shadow-2xl"
    : "mobile-fullscreen-dialog flex h-[94dvh] max-h-[94dvh] w-[min(100%,210mm)] flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl";
  const headerClass = darkMode ? "sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-600 bg-[#11293a] px-4 py-3" : "sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3";
  const titleClass = darkMode ? "text-xl font-bold text-slate-100" : "text-xl font-bold text-slate-900";
  const buttonShellClass = darkMode ? "rounded-lg border border-slate-600 bg-[#1b3045] px-3 py-2 text-sm text-slate-100 hover:bg-[#233d57]" : "rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";
  const closeButtonClass = darkMode ? "rounded-lg p-2 text-slate-200 hover:bg-slate-700" : "rounded-lg p-2 text-slate-600 hover:bg-slate-100";
  const contentClass = "contract-paper contract-fixed-light relative mx-0 my-0 w-full max-w-none bg-white px-0 py-0 text-[12px] text-slate-800 shadow-none";
  const infoCardClass = "grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-4 text-[10px] text-slate-700 sm:grid-cols-3 sm:px-6 sm:py-5";
  const infoLabelClass = "text-[9px] font-black uppercase tracking-[0.16em] text-[#7f1d1d]";
  const infoValueClass = "mt-1 font-bold text-slate-900";
  const noticeClass = darkMode ? "mb-4 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100" : "mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800";
  const sectionLabelClass = "text-[10px] font-black uppercase tracking-[0.16em] text-[#68141b]";
  const tableTopClass = "bg-[#68141b] text-white";
  const panelClass = "border-y border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5";
  const minorPanelClass = "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-900";
  const footerClass = "mt-6 border-t border-slate-200 pt-4 text-center text-[9px] text-slate-500";

  const formatDate = (value, fallback = "N/A") => {
    if (!value) return fallback;
    return formatDateToMMMDDYYYY(value) || value;
  };

  const orderStatus = String(contractData.orderStatus || inspection.status || contractData.status || "").toLowerCase();
  const contractStatus = String(contractData.rawContractStatus || contractData.contractStatus || inspection.contract_status || "").toLowerCase();
  const isAccepted = acceptedOverride ?? (orderStatus === "contract_accepted" || contractStatus === "accepted");
  const isAwaitingCustomerResponse = awaitingResponseOverride ?? (orderStatus === "contract_sent" || (orderStatus === "site_inspection" && contractStatus === "sent") || contractStatus === "sent");
  const isWalkInCustomer = inspection.order_type === "walk_in_customer" || inspection.acceptance_method === "walk_in_signed_contract";
  const actionsAllowed = Boolean(onAccept || onDecline) && isAwaitingCustomerResponse && !isAccepted && !isWalkInCustomer;
  const totalAmount = getFinalProjectCost({ ...inspection, ...contractData, final_project_cost: inspection.final_project_cost });
  const isFullPaymentMethod = String(inspection.payment_terms || "").trim() === "full_payment";
  const downPayment = getRequiredDownpayment({ ...inspection, ...contractData, final_project_cost: totalAmount });
  const contractItems = contractData.items || [];
  const sourceItems = inspection.items || [];
  const getItemWarrantyPeriod = (item, index) => (
    item.warrantyPeriod ?? sourceItems[index]?.warranty_period ?? inspection.warranty_period
  );
  const itemWarrantyPeriods = contractItems.map((item, index) => getItemWarrantyPeriod(item, index));
  const hasDifferentItemWarranties = new Set(itemWarrantyPeriods.map((period) => String(period ?? ""))).size > 1;
  const isPerProductWarranty = contractItems.length > 1 && (
    inspection.warranty_assignment_mode === "per_product" || hasDifferentItemWarranties
  );
  const isNoWarranty = inspection.warranty_period === "No Warranty";
  const hasCustomWarranty = !isNoWarranty && (inspection.warranty_period === "Custom" || (
    Number.isFinite(Number(inspection.warranty_period)) &&
    Number(inspection.warranty_period) > 0 &&
    ![30, 90].includes(Number(inspection.warranty_period))
  ));
  const warrantyPeriod = hasCustomWarranty
    ? Number(inspection.custom_warranty_days || inspection.warranty_period || 90)
    : Number(inspection.warranty_period ?? inspection.custom_warranty_days ?? 90) || 90;
  const warrantyPeriodLabel = isPerProductWarranty
    ? "Assigned per product below"
    : isNoWarranty ? "No Warranty" : `${warrantyPeriod} days`;
  const getItemWarrantyDetails = (item, index) => {
    const sourceItem = sourceItems[index] || {};
    const period = getItemWarrantyPeriod(item, index);
    const customDays = item.warrantyCustomDays ?? sourceItem.custom_warranty_days ?? inspection.custom_warranty_days;
    const periodText = period === "No Warranty"
      ? "No Warranty"
      : period === "Custom"
        ? `${Number(customDays) || 90} days`
        : Number.isFinite(Number(period))
          ? `${Number(period)} days`
          : String(period || `${warrantyPeriod} days`);
    const start = item.warrantyStartDate ?? sourceItem.warranty_start_date;
    const expiry = item.warrantyExpiryDate ?? sourceItem.warranty_expiry_date;
    return { periodText, start, expiry, hasCoverage: period !== "No Warranty" };
  };
  const inspectionDate = contractData.siteInspectionDate || formatDate(inspection.inspection_date, "TBD");
  const installationDate = formatDate(inspection.estimated_installation_date, "TBD");
  const customerName = contractData.customerName || inspection.customer_name || "Customer";
  const siteAddress = contractData.projectLocation || inspection.shipping_address || "N/A";
  const paymentTerms = contractData.paymentTerms || inspection.payment_terms || (isFullPaymentMethod
    ? "Full payment is required before project commences."
    : "50% downpayment, 50% upon completion");
  const siteNotes = inspection.inspection_notes || inspection.site_notes || "No additional site notes provided.";
  const paymentReceivedLabel = isFullPaymentMethod ? "Full Payment Required" : "Required Downpayment";
  const balanceLabel = isFullPaymentMethod ? "Balance Due" : "Balance Upon Completion";
  const agreedPaymentDate = contractData.agreedPaymentDate || formatDate(inspection.agreed_payment_date, null);
  return (
    <div className={`${transparentBackdrop ? "customer-modal-overlay" : ""} mobile-fullscreen-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-1.5`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Service Contract"
        data-notification-record-id={notificationRecordId || undefined}
        data-notification-target={notificationRecordId ? "contract" : undefined}
        className={`${shellClass} ${notificationRecordId ? "notification-target-highlight" : ""}`}
      >
        <div className={headerClass}>
          <div>
            <h2 className={titleClass}>Service Contract</h2>
            {actionError && <p className={`mt-1 text-sm font-medium ${darkMode ? "text-red-300" : "text-red-600"}`}>{actionError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onDownload && (
              <button type="button" onClick={onDownload} className={`${buttonShellClass} inline-flex items-center gap-2`}>
                <FileText size={15} />
                Download PDF
              </button>
            )}
            {onDownloadPNG && <button type="button" onClick={onDownloadPNG} className={buttonShellClass}>Download PNG</button>}
            {onPrint && <button type="button" onClick={onPrint} className={buttonShellClass}>Print Contract</button>}
            {onRegenerate && contractData.contractNeedsRegeneration && !isAccepted && (
              <button type="button" onClick={onRegenerate} disabled={isLoading} className={`${buttonShellClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                Generate New Version
              </button>
            )}
            {onSendToCustomer && !isAccepted && (
              <button type="button" onClick={onSendToCustomer} disabled={isSendingToCustomer || isAwaitingCustomerResponse} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isSendingToCustomer ? "Sending..." : isAwaitingCustomerResponse ? "Sent" : "Send Contract to Customer"}
              </button>
            )}
            {isAccepted && <span className={`rounded-lg px-3 py-2 text-sm font-bold ${darkMode ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>✓ Contract Accepted &amp; Signed</span>}
            {actionsAllowed && onAccept && <button type="button" onClick={onAccept} disabled={isLoading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{isLoading ? "Signing..." : "Accept & Sign Contract"}</button>}
            {actionsAllowed && onDecline && <button type="button" onClick={onDecline} disabled={isLoading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{isLoading ? "Declining..." : "Decline"}</button>}
            <button type="button" onClick={onClose} aria-label="Close contract" className={closeButtonClass}><X size={22} /></button>
          </div>
        </div>

        {contractStatus === "declined" && inspection.contractDeclineReason && (
          <div className={`border-b px-5 py-3 text-sm ${darkMode ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
            <span className="font-bold">Contract declined:</span> {inspection.contractDeclineReason}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div id="contract-content" className={contentClass}>
          {isAccepted && <img src={approvedStamp} alt="Approved stamp" className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-4/5 -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] opacity-20" />}

          <header className="contract-brand-header relative isolate grid grid-cols-1 items-center gap-4 overflow-hidden px-5 py-5 text-white shadow-lg sm:grid-cols-[1.2fr_1fr] sm:px-8 sm:py-6">
            <div className="pointer-events-none absolute -right-12 -top-28 -z-10 h-64 w-64 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-5 -top-20 -z-10 h-48 w-48 rounded-full border border-white/10" />
            <div className="flex items-center gap-3">
              <img src={logo} alt="ACGC" className="h-16 w-16 shrink-0 object-contain drop-shadow-[0_0_7px_rgba(255,255,255,0.85)]" />
              <div>
                <p className="text-sm font-black text-white sm:text-base">ACGC Glass &amp; Aluminum Services</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-200 sm:text-xs">Glass and Aluminum Specialists</p>
              </div>
            </div>
            <h1 className="text-left text-xl font-black uppercase tracking-[0.08em] text-white sm:text-right sm:text-2xl">Service Contract</h1>
          </header>

          <div className={infoCardClass}>
            <div><span className={infoLabelClass}>Contract No.</span><p className={infoValueClass}>{inspection.contractId || contractData.contractNumber || "N/A"}</p></div>
            <div><span className={infoLabelClass}>Contract Version</span><p className={infoValueClass}>{inspection.contractVersion || contractData.currentContractVersion || 1}</p></div>
            <div><span className={infoLabelClass}>Generated Date</span><p className={infoValueClass}>{inspection.contractGeneratedAt ? formatDate(inspection.contractGeneratedAt) : contractData.contractDate || "N/A"}</p></div>
            <div><span className={infoLabelClass}>Customer</span><p className={infoValueClass}>{customerName}</p></div>
            <div><span className={infoLabelClass}>Order ID</span><p className={`${infoValueClass} break-all`}>{inspection.tracking || inspection._id || inspection.id || contractData.orderNumber || "N/A"}</p></div>
            <div className="min-w-0"><span className={infoLabelClass}>Site Address</span><p className={`${infoValueClass} break-words leading-relaxed`}>{siteAddress}</p></div>
          </div>

          <section className="border-b border-slate-200 bg-rose-50/70 px-4 py-4 sm:px-6 sm:py-5">
            <h2 className={sectionLabelClass}>Contracts, Terms, Cancellation &amp; Warranty Policies</h2>
            <ol className="mt-3 space-y-2 text-[10px] leading-relaxed text-slate-700 sm:text-[11px]">
              <li><span className="font-bold text-slate-900">1. Non-Refundable Downpayment.</span> Once a downpayment has been made, it is strictly non-refundable and the order cannot be cancelled.</li>
              <li><span className="font-bold text-slate-900">2. Material Turnover After Cancellation Request.</span> If the customer insists on cancelling after paying the downpayment, no cash or monetary refund will be given. Only the materials already purchased for the order may be turned over to the customer.</li>
              <li><span className="font-bold text-slate-900">3. Repairs Outside the Warranty Period.</span> Service or repair requested after the warranty period has ended is subject to a service/repair fee. The applicable fee will be communicated before the repair work begins.</li>
            </ol>
          </section>

          <section className="px-4 py-4 sm:px-6 sm:py-5">
            <h2 className={`${sectionLabelClass} border-b border-slate-200 pb-2`}>Scope of Work</h2>
            <p className={`mt-1 whitespace-pre-wrap text-[10px] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{siteNotes}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-200 bg-slate-50 px-3 py-3 text-[10px] sm:grid-cols-4">
              <p><span className="font-bold">Inspection Date:</span> {inspectionDate}</p>
              <p><span className="font-bold">Est. Install Date:</span> {installationDate}</p>
              <p><span className="font-bold">Client Type:</span> {inspection.order_type === "walk_in_customer" ? "Walk-in" : "Online"}</p>
              <p><span className="font-bold">Warranty:</span> {warrantyPeriodLabel}</p>
            </div>
          </section>

          <section className="mt-2">
            <div className="overflow-x-auto border-y border-slate-200">
            <table className="w-full border-collapse text-[10px] sm:text-[11px]">
              <thead className={`${tableTopClass} text-left uppercase tracking-wider`}>
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Product / Description</th>
                  <th className="px-3 py-3 text-center">W x H (Unit)</th>
                  <th className="px-3 py-3 text-center">Qty</th>
                  <th className="px-3 py-3 text-right">Rate</th>
                  {isPerProductWarranty && <th className="px-3 py-3 text-center">Warranty</th>}
                  <th className="px-3 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {contractItems.map((item, index) => {
                  const warranty = getItemWarrantyDetails(item, index);
                  const sourceItem = sourceItems[index] || {};
                  const bladeDetails = getContractBladeDetails(item, sourceItem);
                  return (
                  <tr key={`${item.name || "item"}-${index}`} className={darkMode ? "border-b border-slate-600" : "border-b border-slate-200 even:bg-slate-50/70"}>
                    <td className="px-3 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold">
                      {item.name || "Item"}
                      {bladeDetails.isBlade && !bladeDetails.hasPriceOverride && (
                        <div className={`mt-1 text-[10px] font-normal ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                          <div>{bladeDetails.glassName || "Glass"} · {bladeDetails.bladeCount} blades × {formatCurrency(bladeDetails.bladeRate)}/blade</div>
                          {bladeDetails.saleMode === "frame" && (
                            <div>Frame: {bladeDetails.frameName || "Selected frame"}{bladeDetails.framePrice > 0 ? ` · ${formatCurrency(bladeDetails.framePrice)}` : ""}</div>
                          )}
                        </div>
                      )}
                      {bladeDetails.isBlade && bladeDetails.hasPriceOverride && (
                        <div className={`mt-1 text-[10px] font-normal ${darkMode ? "text-slate-300" : "text-slate-500"}`}>Product price override</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">{item.width || 0} x {item.height || 0} ({item.unit || sourceItem.measurement_unit || "in"})</td>
                    <td className="px-3 py-3 text-center">{item.quantity || 1}</td>
                    <td className="px-3 py-3 text-right">{bladeDetails.isBlade && !bladeDetails.hasPriceOverride ? <>{formatCurrency(bladeDetails.bladeRate)} / blade{bladeDetails.framePrice > 0 ? <div className="text-[10px]">+ {formatCurrency(bladeDetails.framePrice)} frame</div> : null}</> : formatCurrency(item.unitPrice)}</td>
                    {isPerProductWarranty && (
                      <td className="px-3 py-3 text-center text-[10px]">
                        <div className="font-bold">{warranty.periodText}</div>
                        {warranty.hasCoverage && (
                          <div className={`mt-1 ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                            <div>Start: {formatDate(warranty.start, "TBD")}</div>
                            <div>End: {formatDate(warranty.expiry, "TBD")}</div>
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-bold">{formatCurrency(item.amount)}</td>
                  </tr>
                  );
                })}
                {(inspection.project_additional_charges || []).map((charge, index) => <tr key={`project-charge-${index}`} className="border-b border-slate-200 bg-amber-50/60"><td className="px-3 py-2 text-slate-500">+</td><td className="px-3 py-2 font-semibold">{charge.name || "Additional project charge"}{charge.note && <div className="text-[9px] font-normal text-slate-500">{charge.note}</div>}</td><td className="px-3 py-2 text-center">—</td><td className="px-3 py-2 text-center">1</td><td className="px-3 py-2 text-right">{formatCurrency(charge.amount)}</td>{isPerProductWarranty && <td className="px-3 py-2 text-center">—</td>}<td className="px-3 py-2 text-right font-bold">{formatCurrency(charge.amount)}</td></tr>)}
              </tbody>
              <tfoot>
                <tr className={darkMode ? "bg-[#153451] font-black" : "bg-rose-50 font-black"}>
                  <td colSpan={isPerProductWarranty ? 6 : 5} className="px-3 py-3 text-right uppercase tracking-wide">Total Contract Amount</td>
                  <td className={`px-3 py-3 text-right text-base ${darkMode ? "text-[#9ed0ff]" : "text-[#9f1722]"}`}>{formatCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </section>

          <section className={panelClass + " mt-4"}>
            <h2 className={sectionLabelClass}>Payment Terms</h2>
            <p className={`mt-3 text-[10px] ${darkMode ? "text-slate-200" : ""}`}>{paymentTerms}</p>
            <div className="mt-2 grid grid-cols-2 gap-4 text-[10px]">
              <p><span className="font-bold">{paymentReceivedLabel}:</span> {formatCurrency(downPayment)}</p>
              <p><span className="font-bold">{balanceLabel}:</span> {formatCurrency(Math.max(totalAmount - downPayment, 0))}</p>
            </div>
            {agreedPaymentDate && (
              <div className={`mt-3 rounded border px-3 py-2 text-[10px] ${darkMode ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <span className="font-bold">Agreed Payment Date (optional):</span> {agreedPaymentDate}
              </div>
            )}
          </section>

          <section className="px-4 py-4 sm:px-6 sm:py-5">
            <h2 className={`${sectionLabelClass} border-b ${darkMode ? "border-slate-600" : "border-slate-200"} pb-2`}>Warranty</h2>
            <div className={`${minorPanelClass} mt-3`}>
              {isPerProductWarranty ? (
                <>
                  <span className="mr-2">🛡️</span>
                  <span className="font-bold">Product-specific warranty coverage:</span> Warranty periods and start/end dates are listed with each product above. Coverage begins on the listed start date.
                </>
              ) : isNoWarranty ? (
                <>
                  <span className="mr-2">ℹ️</span>
                  <span className="font-bold">No Warranty:</span> This project does not include warranty coverage.
                </>
              ) : (
                <>
                  <span className="mr-2">🛡️</span>
                  <span className="font-bold">{warrantyPeriod}-Day Warranty:</span> ACGC Glass &amp; Aluminum Services provides a {warrantyPeriod}-day warranty on installed products and workmanship starting from the installation date.
                </>
              )}
            </div>
            <div className="mt-3 rounded border border-yellow-300/60 bg-yellow-400/95 px-3 py-2 text-[10px] font-black text-slate-900 shadow-sm">⚠ {isFullPaymentMethod ? "Full payment" : `A downpayment of ${formatCurrency(downPayment)}`} is required to start the project based on the stated policy.</div>
          </section>

          <section className={`mt-2 border-t-2 px-4 py-4 ${darkMode ? "border-slate-600" : "border-slate-300"} sm:px-6 sm:py-5`}>
            <h2 className={`${sectionLabelClass} border-b ${darkMode ? "border-slate-600" : "border-slate-200"} pb-2`}>Client Acknowledgment</h2>
            {isAccepted ? (
              <div className={`mt-4 flex items-end justify-between gap-6 text-[10px] ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                <div className="flex-1">
                  <p className="border-b border-slate-500 pb-5 text-center">Electronically Signed by: {contractData.acceptedBy || customerName}</p>
                  <p className={`mt-2 font-semibold ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>✓ Electronically Signed</p>
                  <p className={darkMode ? "text-slate-300" : "text-slate-600"}>Date: {contractData.acceptanceDate || formatDate(new Date())}</p>
                </div>
                <div className={`w-2/5 rounded p-3 text-[9px] ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-500"}`}>Admin Note: This contract is officially issued by ACGC Glass &amp; Aluminum Services. Signature is implicit upon customer acceptance.</div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-10 text-[10px]">
                <div><p className="border-b border-slate-500 pb-5 text-center">ACGC Representative</p><p className="mt-2 font-semibold">Prepared by ACGC Glass &amp; Aluminum Services</p></div>
                <div><p className="border-b border-slate-500 pb-5 text-center">Client Signature &amp; Printed Name</p><p className="mt-2 font-semibold">{customerName}</p><p className={darkMode ? "text-slate-300" : "text-slate-500"}>Date: __________________</p></div>
              </div>
            )}
          </section>

          <footer className={`${footerClass} px-4 pb-4 sm:px-6`}>
            ACGC GLASS &amp; ALUMINUM SERVICES | This document is based on the customer site inspection details.
          </footer>
        </div>
        </div>
      </div>
    </div>
  );
}

export default ContractModal;
