import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookSearch, CalendarDays, CheckCircle2, Clock3, FileText, Image, ImagePlus, LoaderCircle, Search, ShieldCheck, Upload, Wrench, X } from "lucide-react";
import toast from "react-hot-toast";
import { approveWarrantyClaim, rejectWarrantyClaim, completeRepair, createAdminRepairRequest, getAdminCustomerRepairProducts, getRepairRequests, issueRepairQuotation, reviewRepairPaymentProof, scheduleRepair, startRepair } from "@/api/repairs";
import { uploadFiles } from "@/api/uploads";
import { searchCustomers } from "@/api/users";
import { subscribeToRealtime } from "@/lib/realtimeEvents";
import RepairReceiptModal from "@/components/RepairReceiptModal";
import useNotificationHighlight from "@/hooks/useNotificationHighlight";
import { useAuth } from "@/contexts/AuthContext";

const money = (value) => `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = { pending_review: "Pending Review", quotation_pending_approval: "Quotation Pending Approval", customer_accepted: "Quotation Accepted", admin_approved: "Warranty Approved", scheduled: "Scheduled", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled / Quotation Rejected", rejected: "Repair Rejected" };
const adminNextStep = (repair) => {
  if (repair.payment?.proofReviewStatus === "pending") return "Review the customer’s payment proof.";
  if (repair.status === "pending_review" && repair.workflowType === "warranty") return "Inspect the claim, then approve it or issue a quote if coverage does not apply.";
  if (repair.status === "pending_review") return "Inspect the issue and prepare a quotation for the customer.";
  if (repair.status === "quotation_pending_approval") return "Waiting for the customer to accept or decline the quotation.";
  if (["customer_accepted", "admin_approved"].includes(repair.status)) return "Arrange the service dates with the customer.";
  if (repair.status === "scheduled") return "Start the repair when the service visit begins.";
  if (repair.status === "in_progress") return "Record completion notes and optional photos when finished.";
  if (repair.status === "completed") return "No further action required.";
  if (["cancelled", "rejected"].includes(repair.status)) return "Request closed. Review the ticket details if needed.";
  return "Review the ticket details and update the customer.";
};
const isVideo = (url) => /\.(mp4|webm|mov)(\?|$)/i.test(url);
const localDateTime = (value) => { const date = value ? new Date(value) : new Date(Date.now() + 86400000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const getWarrantyCoverageText = (warranty) => {
  const status = String(warranty?.status || "Coverage unknown").replaceAll("_", " ");
  if (!warranty?.expiresAt) return status;
  const expiry = new Date(warranty.expiresAt).toLocaleDateString("en-PH");
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus === "active") return `Active through ${expiry}`;
  if (normalizedStatus === "voided") return `Voided (originally valid through ${expiry})`;
  if (normalizedStatus === "expired") return `Expired on ${expiry}`;
  return `${status} · through ${expiry}`;
};
const getRepairProductOptionLabel = (product) => {
  const dimensions = product.width > 0 && product.height > 0
    ? `${product.width} × ${product.height} ${product.measurementUnit || "in"}`
    : "Size not specified";
  const warrantyStatus = String(product.warranty?.status || "unknown").replaceAll("_", " ");
  const warrantyExpiry = product.warranty?.expiresAt
    ? new Date(product.warranty.expiresAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const warranty = warrantyExpiry && warrantyStatus === "active"
    ? `Warranty active until ${warrantyExpiry}`
    : warrantyExpiry && warrantyStatus === "expired"
      ? `Warranty expired on ${warrantyExpiry}`
      : warrantyExpiry && warrantyStatus === "voided"
        ? `Warranty voided (originally until ${warrantyExpiry})`
        : `Warranty ${warrantyStatus}`;
  return `${product.productName} · ${dimensions} · Qty ${product.quantity || 1} · ${warranty}`;
};
const getRepairStatusBadgeClass = (status, dark) => {
  if (status === "rejected") return dark ? "bg-red-500/15 text-red-300" : "bg-red-100 text-red-700";
  if (status === "completed") return dark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-700";
  if (status === "pending_review") return dark ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-800";
  return dark ? "bg-sky-500/15 text-sky-300" : "bg-sky-500/10 text-sky-700";
};

export default function RepairManagement({ darkMode, hideOverview = false }) {
  const { user } = useAuth();
  const repairModuleAccess = user?.staff_access?.modules?.repair_management;
  const canCreateRepair = user?.role !== "skilled_worker" || (
    repairModuleAccess?.enabled === true && repairModuleAccess.actions?.create === true
  );
  const canManageRepairs = user?.role !== "skilled_worker" || (
    repairModuleAccess?.enabled === true && repairModuleAccess.actions?.manage === true
  );
  const location = useLocation();
  const highlightedNotificationRecordId = useNotificationHighlight(location);
  const [repairs, setRepairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null);
  const [action, setAction] = useState("");
  const [review, setReview] = useState({ inspectionNotes: "", decisionReason: "" });
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [quote, setQuote] = useState({ inspectionNotes: "", decisionReason: "", quotationNotes: "", laborCost: "", parts: [{ description: "", cost: "" }], voidWarranty: false });
  const [schedule, setSchedule] = useState({ startDate: "", finishDate: "", notes: "" });
  const [completion, setCompletion] = useState({ notes: "" });
  const [repairDraft, setRepairDraft] = useState({ customerId: "", orderId: "", productIndex: "", customerName: "", customerEmail: "", customerPhone: "", orderTracking: "", productName: "", issueDescription: "", workflowType: "paid" });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerProducts, setCustomerProducts] = useState([]);
  const [customerProductsLoading, setCustomerProductsLoading] = useState(false);
  const [productChoice, setProductChoice] = useState("");
  const [paymentRejectionReason, setPaymentRejectionReason] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [receiptRepair, setReceiptRepair] = useState(null);
  const dark = darkMode;
  const card = dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const field = `w-full rounded-lg border px-3 py-2.5 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`;
  const todayDate = new Date();
  const todayDateKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
  useEffect(() => {
    if (!action && !receiptRepair && !previewMedia) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleModalKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (previewMedia) setPreviewMedia(null);
      else if (receiptRepair) setReceiptRepair(null);
      else if (completeConfirmOpen) setCompleteConfirmOpen(false);
      else setAction("");
    };
    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleModalKeyDown);
    };
  }, [action, previewMedia, receiptRepair, completeConfirmOpen]);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await getRepairRequests(); setRepairs(response.repairs || []); }
    catch (error) { toast.error(error?.data?.message || error.message || "Unable to load repair queue."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const unsubscribe = subscribeToRealtime(["repairs"], () => { void load(); }); return unsubscribe; }, [load]);
  useEffect(() => {
    if (action !== "create" || selectedCustomer || customerSearch.trim().length < 2) {
      setCustomerSuggestions([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const response = await searchCustomers(customerSearch.trim());
        if (active) setCustomerSuggestions(response.customers || []);
      } catch (error) {
        if (active) toast.error(error?.data?.message || error.message || "Unable to search customer accounts.");
      } finally {
        if (active) setCustomerSearchLoading(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [action, customerSearch, selectedCustomer]);
  const visible = useMemo(() => repairs.filter((repair) => (
    queue === "all"
      || (queue === "completed" && repair.status === "completed")
      || (queue === "rejected" && repair.status === "rejected")
      || (["warranty", "paid"].includes(queue) && repair.workflowType === queue && repair.status !== "rejected")
  ) && `${repair.customerName} ${repair.customerEmail} ${repair.productName} ${repair.orderTracking}`.toLowerCase().includes(search.toLowerCase())), [repairs, queue, search]);
  const counts = { all: repairs.length, warranty: repairs.filter((repair) => repair.workflowType === "warranty" && repair.status !== "rejected").length, paid: repairs.filter((repair) => repair.workflowType === "paid" && repair.status !== "rejected").length, completed: repairs.filter((repair) => repair.status === "completed").length, rejected: repairs.filter((repair) => repair.status === "rejected").length, pending: repairs.filter((repair) => ["pending_review", "quotation_pending_approval"].includes(repair.status)).length };
  const open = (repair, name) => {
    setActive(repair); setAction(name);
    setRejectConfirmOpen(false);
    if (name === "payment") setPaymentRejectionReason("");
    if (name === "review") setReview({ inspectionNotes: "", decisionReason: "" });
    if (name === "quote") setQuote({ inspectionNotes: "", decisionReason: "", quotationNotes: "", laborCost: "", parts: [{ description: "", cost: "" }], voidWarranty: repair.workflowType === "warranty" });
    if (name === "schedule") setSchedule({ startDate: localDateTime(repair.schedule?.startDate || repair.schedule?.date).slice(0, 10), finishDate: localDateTime(repair.schedule?.finishDate || repair.schedule?.startDate || repair.schedule?.date).slice(0, 10), notes: repair.schedule?.notes || "" });
    if (name === "complete") setCompletion({ notes: "" });
  };
  const reviewPayment = (actionName) => {
    if (actionName === "reject" && !paymentRejectionReason.trim()) return toast.error("Provide a reason for rejecting this proof.");
    return run(active, () => reviewRepairPaymentProof(active._id, { action: actionName, reason: paymentRejectionReason.trim() }));
  };
  const run = async (repair, operation) => {
    setBusy(String(repair._id));
    try { await operation(); await load(); setAction(""); setActive(null); toast.success("Repair workflow updated."); }
    catch (error) { toast.error(error?.data?.message || error.message || "Unable to update repair."); }
    finally { setBusy(""); }
  };
  const addEvidenceFiles = (fileList) => {
    const chosen = Array.from(fileList || []);
    const images = chosen.filter((file) => file.type.startsWith("image/"));
    if (images.length !== chosen.length) toast.error("Only image files can be attached.");
    const seen = new Set(evidenceFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
    const uniqueImages = images.filter((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (evidenceFiles.length + uniqueImages.length > 10) toast.error("You can attach up to ten completion photos.");
    setEvidenceFiles([...evidenceFiles, ...uniqueImages].slice(0, 10));
  };
  const handleEvidenceSelection = (event) => {
    addEvidenceFiles(event.target.files);
    event.target.value = "";
  };
  const submitComplete = async () => {
    try {
      const upload = evidenceFiles.length ? await uploadFiles(evidenceFiles, undefined, { purpose: "repair-evidence" }) : { files: [] };
      await run(active, () => completeRepair(active._id, { notes: completion.notes, evidenceUrls: (upload.files || []).map((file) => file.url) }));
      setEvidenceFiles([]);
    } catch (error) { toast.error(error?.data?.message || error.message || "Unable to complete repair."); }
  };
  const chooseCustomer = async (customer) => {
    setCustomerSearchLoading(false);
    setSelectedCustomer(customer);
    setCustomerSearch([customer.first_name, customer.last_name].filter(Boolean).join(" "));
    setCustomerSuggestions([]);
    setCustomerProducts([]);
    setProductChoice("");
    setRepairDraft((current) => ({ ...current, customerId: customer._id, orderId: "", productIndex: "", customerName: [customer.first_name, customer.last_name].filter(Boolean).join(" "), customerEmail: customer.email || "", customerPhone: customer.phone || "", orderTracking: "", productName: "", workflowType: "paid" }));
    setCustomerProductsLoading(true);
    try {
      const response = await getAdminCustomerRepairProducts(customer._id);
      setSelectedCustomer({ ...customer, ...(response.customer || {}) });
      setCustomerProducts(response.products || []);
      if (!(response.products || []).length) setProductChoice("manual");
    } catch (error) {
      toast.error(error?.data?.message || error.message || "Unable to load this customer's products.");
    } finally { setCustomerProductsLoading(false); }
  };
  const clearSelectedCustomer = () => {
    setCustomerSearchLoading(false);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerProducts([]);
    setProductChoice("");
    setRepairDraft((current) => ({ ...current, customerId: "", orderId: "", productIndex: "", customerName: "", customerEmail: "", customerPhone: "", orderTracking: "", productName: "", workflowType: "paid" }));
  };
  const chooseProduct = (value) => {
    setProductChoice(value);
    if (!value || value === "manual") {
      setRepairDraft((current) => ({ ...current, orderId: "", productIndex: "", orderTracking: "", productName: "", workflowType: "paid" }));
      return;
    }
    const selectedProduct = customerProducts.find((product) => `${product.orderId}:${product.productIndex}` === value);
    if (!selectedProduct) return;
    setRepairDraft((current) => ({ ...current, orderId: String(selectedProduct.orderId), productIndex: String(selectedProduct.productIndex), orderTracking: selectedProduct.orderTracking || "", productName: selectedProduct.productName, workflowType: selectedProduct.warranty?.status === "active" ? "warranty" : "paid" }));
  };
  const openCreateRepair = () => {
    setRepairDraft({ customerId: "", orderId: "", productIndex: "", customerName: "", customerEmail: "", customerPhone: "", orderTracking: "", productName: "", issueDescription: "", workflowType: "paid" });
    setCustomerSearch("");
    setCustomerSuggestions([]);
    setSelectedCustomer(null);
    setCustomerProducts([]);
    setCustomerProductsLoading(false);
    setProductChoice("");
    setAction("create");
  };
  const selectedRepairProduct = customerProducts.find((product) => `${product.orderId}:${product.productIndex}` === productChoice);
  const submitRepair = async (event) => {
    event.preventDefault();
    setBusy("create-repair");
    try {
      await createAdminRepairRequest(repairDraft);
      setRepairDraft({ customerId: "", orderId: "", productIndex: "", customerName: "", customerEmail: "", customerPhone: "", orderTracking: "", productName: "", issueDescription: "", workflowType: "paid" });
      setCustomerSearch(""); setSelectedCustomer(null); setCustomerProducts([]); setProductChoice("");
      setAction("");
      await load();
      toast.success("Repair ticket created.");
    } catch (error) { toast.error(error?.data?.message || error.message || "Unable to create repair ticket."); }
    finally { setBusy(""); }
  };

  return <section className={`mt-6 overflow-hidden rounded-3xl border p-4 shadow-sm sm:p-6 ${card}`}>
    {!hideOverview && <><div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-red-700/10 text-red-600"><Wrench size={20} /></span><div><h2 className="text-lg font-extrabold tracking-tight">Warranty & Paid Repair Tickets</h2><p className={`text-xs ${muted}`}>Review each ticket’s next step, then use its action button to continue the existing workflow.</p></div></div>
    <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["All Tickets", counts.all, "bg-slate-500/10"], ["Needs attention", counts.pending, "bg-amber-500/10"], ["Warranty Claims", counts.warranty, "bg-emerald-500/10"], ["Paid repairs", counts.paid, "bg-sky-500/10"]].map(([title, count, tone]) => <div key={title} className={`rounded-2xl border p-3 ${dark ? "border-slate-700" : "border-slate-200"}`}><span className={`mb-2 flex size-8 items-center justify-center rounded-xl ${tone}`}><Clock3 size={15} /></span><p className={`text-[11px] font-medium ${muted}`}>{title}</p><p className="mt-0.5 text-xl font-extrabold">{count}</p></div>)}</div></>}
    {!hideOverview && <div className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${dark ? "border-slate-700 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}><span className={`font-bold ${dark ? "text-slate-100" : "text-slate-800"}`}>Repair flow:</span> Review request, inspect it, then approve or issue a quote. The customer responds to a quote when one is needed. Next, schedule the repair, start the work, and mark it complete. Warranty approvals do not need a customer-paid quotation.</div>}
    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap items-center gap-1.5">{[["all", "All Tickets", counts.all], ["warranty", "Warranty Claims", counts.warranty], ["paid", "Paid Repair Requests", counts.paid], ["completed", "Completed Repairs", counts.completed], ["rejected", "Rejected Repair", counts.rejected]].map(([key, title, count]) => <button key={key} type="button" onClick={() => setQueue(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${queue === key ? dark ? "border-red-800/70 bg-red-950/50 text-red-100 shadow-sm" : "border-red-200 bg-red-50 text-red-950 shadow-sm" : dark ? "border-slate-700 bg-slate-800 text-slate-300 shadow-sm hover:bg-slate-700 hover:text-white" : "border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"}`}>{title}<span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums ${queue === key ? dark ? "bg-red-800 text-red-50" : "bg-red-200 text-red-900" : dark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700"}`}>{count}</span></button>)}</div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative w-full lg:max-w-xs"><Search size={14} className="absolute left-3 top-3 opacity-50" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, product, order..." className={`${field} pl-9`} /></label>{canCreateRepair && <button type="button" onClick={openCreateRepair} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white">Add Repair</button>}</div></div>
    {loading ? <p className={`mt-5 flex items-center gap-2 text-sm ${muted}`}><LoaderCircle size={16} className="animate-spin" />Loading repair tickets...</p> : visible.length === 0 ? <div className={`mt-4 rounded-2xl border border-dashed p-9 text-center text-sm ${muted}`}><Wrench size={22} className="mx-auto mb-2 opacity-40" /><p className="font-semibold">No tickets match this view</p><p className="mt-1 text-xs">Try another filter or search term.</p></div> : <><div className={`mt-4 hidden overflow-x-auto rounded-2xl border md:block ${dark ? "border-slate-700" : "border-slate-200"}`}><table className="w-full min-w-[980px] border-collapse text-left"><thead className={dark ? "bg-slate-800/80" : "bg-slate-50"}><tr className={`text-[11px] uppercase tracking-wide ${muted}`}><th className="px-4 py-3 font-bold">Product</th><th className="px-4 py-3 font-bold">Customer / Repair ID</th><th className="px-4 py-3 font-bold">Request type</th><th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 font-bold">Evidence</th><th className="px-4 py-3 font-bold">Schedule / Quote</th><th className="px-4 py-3 text-right font-bold">Actions</th></tr></thead><tbody className={dark ? "divide-y divide-slate-800" : "divide-y divide-slate-100"}>{visible.map((repair) => <tr key={repair._id} data-notification-record-id={String(repair._id)} data-notification-target="repair" className={`align-top transition-colors ${highlightedNotificationRecordId === String(repair._id) ? "notification-target-highlight" : ""} ${dark ? "hover:bg-slate-800/50" : "hover:bg-slate-50"}`}>
      <td className="max-w-[260px] px-4 py-4"><p className="font-bold">{repair.productName}</p></td>
      <td className="px-4 py-4"><p className="max-w-[190px] truncate text-sm font-semibold">{repair.customerName}</p><p className={`mt-1 max-w-[190px] truncate text-xs ${muted}`}>{repair.customerEmail}</p><p className={`mt-1 break-all font-mono text-xs font-semibold ${dark ? "text-red-300" : "text-red-700"}`}>Repair ID: {repair.repairTrackingId}</p></td>
      <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${repair.workflowType === "warranty" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{repair.workflowType === "warranty" ? "Warranty · Free" : "Paid repair"}</span><p className={`mt-2 text-xs ${muted}`}>{getWarrantyCoverageText(repair.warranty)}</p></td>
      <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${getRepairStatusBadgeClass(repair.status, dark)}`}>{label[repair.status] || repair.status}</span><p className={`mt-2 max-w-[190px] text-[11px] leading-4 ${muted}`}>{adminNextStep(repair)}</p></td>
      <td className="px-4 py-4">{repair.mediaUrls?.length ? <div className="flex items-center gap-1.5">{repair.mediaUrls.slice(0, 3).map((url, index) => <button key={url} type="button" onClick={() => setPreviewMedia(url)} aria-label={`Preview evidence ${index + 1}`} className="size-11 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">{isVideo(url) ? <video src={url} className="h-full w-full object-cover" /> : <img src={url} alt="Repair evidence" className="h-full w-full object-cover" />}</button>)}{repair.mediaUrls.length > 3 && <span className={`text-[10px] ${muted}`}>+{repair.mediaUrls.length - 3}</span>}</div> : <span className={`text-xs ${muted}`}>No photos</span>}</td>
      <td className="px-4 py-4">{repair.quotation?.issuedAt && <p className="text-xs font-semibold">Quote {money(repair.quotation.total)}</p>}{repair.schedule?.startDate || repair.schedule?.date ? <><p className="mt-1 text-xs">Start: {new Date(repair.schedule.startDate || repair.schedule.date).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p><p className={`mt-1 text-xs ${muted}`}>Finish: {new Date(repair.schedule.finishDate || repair.schedule.startDate || repair.schedule.date).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p></> : !repair.quotation?.issuedAt && <span className={`text-xs ${muted}`}>Not scheduled</span>}</td>
      <td className="px-4 py-4"><div className="flex min-w-[170px] flex-wrap justify-end gap-1.5"><button type="button" onClick={() => open(repair, "details")} className={`rounded-lg border p-2 transition hover:bg-slate-500/10 ${dark ? "border-slate-700" : "border-slate-200"}`} aria-label="View ticket details"><BookSearch size={15} /></button>{repair.status === "completed" && <button type="button" onClick={() => setReceiptRepair(repair)} title="View repair receipt" aria-label="View repair receipt" className="rounded-lg bg-emerald-700 p-2 text-white"><FileText size={15} /></button>}{canManageRepairs && repair.payment?.proofReviewStatus === "pending" && <button type="button" onClick={() => open(repair, "payment")} className="rounded-lg bg-sky-700 px-2.5 py-2 text-[10px] font-bold text-white">Review proof</button>}{canManageRepairs && repair.status === "pending_review" && repair.workflowType === "warranty" && <><button type="button" disabled={busy === String(repair._id)} onClick={() => open(repair, "review")} className="rounded-lg bg-emerald-700 px-2.5 py-2 text-[10px] font-bold text-white">Inspect</button><button type="button" disabled={busy === String(repair._id)} onClick={() => open(repair, "quote")} className="rounded-lg border border-amber-500 px-2.5 py-2 text-[10px] font-bold text-amber-700">Void / quote</button></>}{canManageRepairs && repair.status === "pending_review" && repair.workflowType === "paid" && <button type="button" disabled={busy === String(repair._id)} onClick={() => open(repair, "quote")} className="rounded-lg bg-amber-600 px-2.5 py-2 text-[10px] font-bold text-white">Inspect / quote</button>}{canManageRepairs && ["customer_accepted", "admin_approved"].includes(repair.status) && <button type="button" onClick={() => open(repair, "schedule")} className="rounded-lg bg-indigo-600 px-2.5 py-2 text-[10px] font-bold text-white">Schedule</button>}{canManageRepairs && repair.status === "scheduled" && <><button type="button" onClick={() => open(repair, "schedule")} className="rounded-lg border px-2.5 py-2 text-[10px] font-bold">Reschedule</button><button type="button" disabled={busy === String(repair._id)} onClick={() => run(repair, () => startRepair(repair._id))} className="rounded-lg bg-violet-700 px-2.5 py-2 text-[10px] font-bold text-white">Start</button></>}{canManageRepairs && repair.status === "in_progress" && <button type="button" onClick={() => open(repair, "complete")} className="rounded-lg bg-emerald-700 px-2.5 py-2 text-[10px] font-bold text-white">Complete</button>}{busy === String(repair._id) && <LoaderCircle size={16} className="animate-spin self-center" />}</div></td>
    </tr>)}</tbody></table></div><div className="mt-4 space-y-2.5 md:hidden">{visible.map((repair) => <article key={repair._id} data-notification-record-id={String(repair._id)} data-notification-target="repair" className={"overflow-hidden rounded-2xl border p-3.5 shadow-sm " + (highlightedNotificationRecordId === String(repair._id) ? "notification-target-highlight " : "") + (dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-[#f8f8f7]")}>
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold">{repair.productName}</h3><p className={"mt-0.5 truncate text-[11px] " + muted}>{repair.customerName}</p><p className={`mt-1 break-all font-mono text-xs font-semibold ${dark ? "text-red-300" : "text-red-700"}`}>Repair ID: {repair.repairTrackingId}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${getRepairStatusBadgeClass(repair.status, dark)}`}>{label[repair.status] || repair.status}</span></div>
      <div className={"mt-3 grid grid-cols-2 gap-3 border-t pt-2.5 " + (dark ? "border-slate-700" : "border-slate-200")}><div className="min-w-0"><p className={"text-[9px] font-semibold uppercase tracking-wide " + muted}>Request type</p><p className="mt-0.5 truncate text-xs font-medium">{repair.workflowType === "warranty" ? "Warranty claim" : "Paid repair"}</p><p className={"mt-0.5 truncate text-[10px] " + muted}>{getWarrantyCoverageText(repair.warranty)}</p></div><div className="min-w-0"><p className={"text-[9px] font-semibold uppercase tracking-wide " + muted}>{repair.schedule?.startDate || repair.schedule?.date ? "Repair dates" : "Estimate"}</p><p className="mt-0.5 truncate text-xs font-semibold">{repair.schedule?.startDate || repair.schedule?.date ? `${new Date(repair.schedule.startDate || repair.schedule.date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - ${new Date(repair.schedule.finishDate || repair.schedule.startDate || repair.schedule.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : repair.quotation?.issuedAt ? money(repair.quotation.total) : repair.workflowType === "warranty" ? "No charge" : "Pending review"}</p><p className={"mt-0.5 truncate text-[10px] " + muted}>{repair.createdByAdmin ? "Admin created" : (repair.quotation?.issuedAt ? "Repair quotation" : "Parts + service")}</p></div></div>
       <p className={"mt-2 line-clamp-2 text-[11px] leading-4 " + (dark ? "text-slate-300" : "text-slate-600")}>{repair.issueDescription}</p>
      <p className={`mt-2 rounded-lg px-3 py-2 text-[11px] leading-4 ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}><span className="font-bold">Next step: </span>{adminNextStep(repair)}</p>
      <div className={"mt-2.5 flex items-center justify-between border-t pt-2.5 " + (dark ? "border-slate-700" : "border-slate-200")}>
        {repair.mediaUrls?.[0] ? <button type="button" onClick={() => setPreviewMedia(repair.mediaUrls[0])} aria-label="Preview repair evidence" className="size-9 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">{isVideo(repair.mediaUrls[0]) ? <video src={repair.mediaUrls[0]} className="h-full w-full object-cover" /> : <img src={repair.mediaUrls[0]} alt="Repair evidence" className="h-full w-full object-cover" />}</button> : <span className={"text-[10px] " + muted}>No photo</span>}
        <div className="flex items-center gap-1.5"><button type="button" onClick={() => open(repair, "details")} title="View repair details" aria-label="View repair details" className={"rounded-lg border p-2 " + (dark ? "border-slate-700 text-slate-200" : "border-slate-200 bg-white text-slate-700")}><BookSearch size={15} /></button>{repair.status === "completed" && <button type="button" onClick={() => setReceiptRepair(repair)} title="View repair receipt" aria-label="View repair receipt" className="rounded-lg bg-emerald-700 p-2 text-white"><FileText size={15} /></button>}{canManageRepairs && repair.payment?.proofReviewStatus === "pending" && <button type="button" onClick={() => open(repair, "payment")} title="Review payment proof" aria-label="Review payment proof" className="rounded-lg bg-sky-700 p-2 text-white"><FileText size={15} /></button>}{canManageRepairs && repair.status === "pending_review" && repair.workflowType === "warranty" && <><button type="button" disabled={busy === String(repair._id)} onClick={() => open(repair, "review")} title="Inspect and approve claim" aria-label="Inspect and approve claim" className="rounded-lg bg-emerald-700 p-2 text-white"><ShieldCheck size={15} /></button><button type="button" disabled={busy === String(repair._id)} onClick={() => open(repair, "quote")} title="Void warranty and issue quote" aria-label="Void warranty and issue quote" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-700"><FileText size={15} /></button></>}{canManageRepairs && repair.status === "pending_review" && repair.workflowType === "paid" && <button type="button" disabled={busy === String(repair._id)} onClick={() => open(repair, "quote")} title="Inspect and issue quotation" aria-label="Inspect and issue quotation" className="rounded-lg bg-amber-600 p-2 text-white"><FileText size={15} /></button>}{canManageRepairs && ["customer_accepted", "admin_approved"].includes(repair.status) && <button type="button" onClick={() => open(repair, "schedule")} title="Schedule repair" aria-label="Schedule repair" className="rounded-lg bg-indigo-600 p-2 text-white"><CalendarDays size={15} /></button>}{canManageRepairs && repair.status === "scheduled" && <><button type="button" onClick={() => open(repair, "schedule")} title="Reschedule repair" aria-label="Reschedule repair" className={"rounded-lg border p-2 " + (dark ? "border-slate-700" : "border-slate-200 bg-white")}><CalendarDays size={15} /></button><button type="button" disabled={busy === String(repair._id)} onClick={() => run(repair, () => startRepair(repair._id))} title="Start repair" aria-label="Start repair" className="rounded-lg bg-violet-700 p-2 text-white"><Wrench size={15} /></button></>}{canManageRepairs && repair.status === "in_progress" && <button type="button" onClick={() => open(repair, "complete")} title="Complete repair" aria-label="Complete repair" className="rounded-lg bg-emerald-700 p-2 text-white"><CheckCircle2 size={15} /></button>}{busy === String(repair._id) && <LoaderCircle size={16} className="animate-spin" />}</div>
      </div>
    </article>)}</div></>}
    {action && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-0 sm:p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) setAction(""); }}><section role="dialog" aria-modal="true" className={`${action === "details" ? "flex flex-col overflow-hidden p-0" : "overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"} h-[100dvh] max-h-[100dvh] w-full max-w-none overscroll-contain rounded-none border-0 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-2xl sm:border ${action === "details" ? "sm:p-0" : "sm:p-5"} ${card}`}><header className={action === "details"
        ? `shrink-0 flex items-start justify-between gap-4 border-b px-5 py-4 sm:rounded-t-xl sm:px-6 sm:py-5 ${dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-[#faf9f7]"}`
        : `sticky top-[-1rem] z-10 -mx-4 -mt-4 mb-4 flex items-start justify-between px-4 pt-4 pb-2 backdrop-blur sm:static sm:mx-0 sm:mt-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 ${dark ? "bg-slate-900/95" : "bg-white/95"}`}>
        <div className="min-w-0">
          <h3 className={action === "details" ? "text-lg font-extrabold tracking-tight sm:text-xl" : "font-bold"}>{action === "review" ? "Inspect & approve warranty claim" : action === "quote" ? "Inspection & quotation builder" : action === "schedule" ? "Schedule repair" : action === "complete" ? "Complete repair" : action === "create" ? "Add repair ticket" : action === "payment" ? "Review customer payment proof" : "Repair ticket details"}</h3>
          <p className={`${action === "details" ? "mt-1 text-xs sm:text-sm" : "mt-1 text-xs"} ${muted}`}>{active?.productName} · {active?.customerName}</p>
        </div>
        <button type="button" onClick={() => setAction("")} aria-label="Close panel" className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-200/70"}`}><X size={20} /></button>
      </header>
      {action === "create" && <form onSubmit={submitRepair} className="space-y-4">
        <p className={`rounded-xl p-3 text-xs leading-5 ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-600"}`}>Manually create a repair ticket and enter the available customer, product, and issue details.</p>
        <div className="relative">
          <label className="block text-xs font-semibold">Find customer account (optional)<input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setSelectedCustomer(null); setCustomerProducts([]); setProductChoice(""); setRepairDraft((current) => ({ ...current, customerId: "", orderId: "", productIndex: "", customerName: "", customerEmail: "", customerPhone: "", orderTracking: "", productName: "", workflowType: "paid" })); }} placeholder="Search by name, phone, or email" className={field} /></label>
          {customerSearchLoading && <span className={`mt-1 block text-[11px] ${muted}`}>Searching customer accounts...</span>}
          {customerSuggestions.length > 0 && <ul className={`absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border p-1 shadow-xl ${card}`}>{customerSuggestions.map((customer) => <li key={customer._id}><button type="button" onClick={() => void chooseCustomer(customer)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-500/10"><span className="block text-sm font-semibold">{customer.first_name} {customer.last_name}</span><span className={`block text-xs ${muted}`}>{customer.email} {customer.phone ? `· ${customer.phone}` : ""}</span></button></li>)}</ul>}
          {selectedCustomer && <div className={`mt-2 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${dark ? "border-emerald-800 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50"}`}><div><p className="text-xs font-bold">Account selected: {selectedCustomer.customerName || `${selectedCustomer.first_name || ""} ${selectedCustomer.last_name || ""}`}</p><p className={`mt-1 text-xs ${muted}`}>{selectedCustomer.customerPhone || selectedCustomer.phone || "No phone on account"} · {selectedCustomer.customerEmail || selectedCustomer.email}</p></div><button type="button" onClick={clearSelectedCustomer} className="self-start rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:self-auto">Clear account</button></div>}
        </div>
        {!selectedCustomer && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">Customer name<input required maxLength={180} value={repairDraft.customerName} onChange={(event) => setRepairDraft({ ...repairDraft, customerName: event.target.value })} className={field} /></label><label className="block text-xs font-semibold">Phone number<input value={repairDraft.customerPhone} onChange={(event) => setRepairDraft({ ...repairDraft, customerPhone: event.target.value })} className={field} /></label><label className="block text-xs font-semibold">Email (optional)<input type="email" value={repairDraft.customerEmail} onChange={(event) => setRepairDraft({ ...repairDraft, customerEmail: event.target.value })} className={field} /></label></div>}
        {selectedCustomer && <div>
          <label className="block text-xs font-semibold">Customer product / project{customerProductsLoading ? <span className={`ml-2 font-normal ${muted}`}>Loading products...</span> : <select required value={productChoice} onChange={(event) => chooseProduct(event.target.value)} className={field}><option value="">Choose a product or enter details manually</option>{customerProducts.map((product) => <option key={`${product.orderId}:${product.productIndex}`} value={`${product.orderId}:${product.productIndex}`}>{getRepairProductOptionLabel(product)}</option>)}<option value="manual">No associated product / enter manually</option></select>}</label>
          {!customerProductsLoading && customerProducts.length === 0 && <p className={`mt-1 text-xs ${muted}`}>No completed order products were found. Enter the product details manually.</p>}
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          {selectedRepairProduct && <div className={`rounded-xl border p-3 text-xs leading-5 sm:col-span-2 ${dark ? "border-sky-900 bg-sky-950/20" : "border-sky-200 bg-sky-50"}`}><p className="font-bold">Product details from customer order</p><p>Order / transaction: {selectedRepairProduct.orderTracking || "Not available"}</p><p>Product size: {selectedRepairProduct.width > 0 && selectedRepairProduct.height > 0 ? `${selectedRepairProduct.width} × ${selectedRepairProduct.height} ${selectedRepairProduct.measurementUnit || "in"}` : "Not specified"}</p><p>Quantity: {selectedRepairProduct.quantity || 1}</p><p>Installation date: {selectedRepairProduct.installationDate ? new Date(selectedRepairProduct.installationDate).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "Not available"}</p><p>Warranty: <span className="font-semibold">{getWarrantyCoverageText(selectedRepairProduct.warranty)}</span></p>{selectedRepairProduct.warranty?.startsAt && <p>Warranty started: {new Date(selectedRepairProduct.warranty.startsAt).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p>}</div>}
          <label className="block text-xs font-semibold">Product or service<input required readOnly={Boolean(selectedRepairProduct)} value={repairDraft.productName} onChange={(event) => setRepairDraft({ ...repairDraft, productName: event.target.value })} className={`${field} read-only:opacity-80`} /></label>
          {!repairDraft.orderId && <label className="block text-xs font-semibold">Order / transaction reference (optional)<input value={repairDraft.orderTracking} onChange={(event) => setRepairDraft({ ...repairDraft, orderTracking: event.target.value })} className={field} /></label>}
          {!repairDraft.orderId && <label className="block text-xs font-semibold">Repair type<select value={repairDraft.workflowType} onChange={(event) => setRepairDraft({ ...repairDraft, workflowType: event.target.value })} className={field}><option value="paid">Paid repair / quote required</option><option value="warranty">Warranty review</option></select></label>}
        </div>
        <label className="block text-xs font-semibold">Repair issue<textarea required rows={4} value={repairDraft.issueDescription} onChange={(event) => setRepairDraft({ ...repairDraft, issueDescription: event.target.value })} className={field} /></label>
        <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setAction("")} className="min-h-10 rounded-lg border px-4 text-sm font-semibold">Cancel</button><button disabled={busy === "create-repair"} className="min-h-10 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "create-repair" ? "Saving…" : "Create repair ticket"}</button></div>
      </form>}
      {action === "details" && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-5"><div className="space-y-4 text-sm">
        <div className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 ${dark ? "border-slate-700 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
          <div><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Current status</p><p className="mt-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getRepairStatusBadgeClass(active.status, dark)}`}>{label[active.status] || active.status}</span></p></div>
          <div><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Request type</p><p className="mt-1 font-semibold">{active.workflowType === "warranty" ? "Warranty claim · Free service" : "Paid repair"}</p></div>
          <div><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Customer / Order</p><p className="mt-1 font-semibold">{active.customerName}</p><p className={`text-xs ${muted}`}>{active.customerEmail} · {active.orderTracking}</p></div>
          <div><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Product</p><p className="mt-1 font-semibold">{active.productName}</p>{active.installationDate && <p className={`mt-1 text-xs ${muted}`}>Installed {new Date(active.installationDate).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p>}</div>{active.createdByAdmin && <div><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Ticket source</p><p className="mt-1 font-semibold">Admin created</p></div>}
        </div>
        {(active.schedule?.startDate || active.schedule?.date) && <section className={`rounded-2xl border p-4 ${dark ? "border-slate-700" : "border-slate-200"}`}><h4 className="text-xs font-bold uppercase tracking-wider">Repair schedule</h4><p className="mt-2 text-sm font-semibold">Start: {new Date(active.schedule.startDate || active.schedule.date).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p><p className="mt-1 text-sm font-semibold">Finish: {new Date(active.schedule.finishDate || active.schedule.startDate || active.schedule.date).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p>{active.schedule.notes && <p className={`mt-2 text-xs ${muted}`}>{active.schedule.notes}</p>}</section>}<section className={`rounded-2xl border p-4 ${dark ? "border-slate-700" : "border-slate-200"}`}><h4 className="text-xs font-bold uppercase tracking-wider">Reported issue</h4><p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${dark ? "text-slate-300" : "text-slate-700"}`}>{active.issueDescription || "No issue description provided."}</p>{active.mediaUrls?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{active.mediaUrls.map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => setPreviewMedia(url)} aria-label={`Preview repair evidence ${index + 1}`} className="size-16 overflow-hidden rounded-xl border border-slate-300 bg-slate-100">{isVideo(url) ? <video src={url} className="h-full w-full object-cover" /> : <img src={url} alt={`Repair evidence ${index + 1}`} className="h-full w-full object-cover" />}</button>)}</div>}</section>
        <div className="grid gap-3 sm:grid-cols-2"><section className={`rounded-2xl border p-4 ${dark ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-white"}`}><h4 className="text-xs font-bold uppercase tracking-wider">Warranty decision</h4><p className="mt-2 font-semibold">{active.warranty?.status || "Coverage unknown"}</p><p className={`mt-1 whitespace-pre-wrap break-words text-xs leading-5 ${muted}`}>{active.warranty?.decisionReason || "No warranty decision notes."}</p>{active.warranty?.expiresAt && <p className={`mt-2 text-xs ${muted}`}>{getWarrantyCoverageText(active.warranty)}</p>}</section><section className={`rounded-2xl border p-4 ${dark ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-white"}`}><h4 className="text-xs font-bold uppercase tracking-wider">Inspection findings</h4><p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-5 ${dark ? "text-slate-300" : "text-slate-700"}`}>{active.inspection?.notes || "This ticket has not been inspected yet."}</p></section></div>
        {active.quotation?.issuedAt && <section className={`overflow-hidden rounded-2xl border ${dark ? "border-slate-700" : "border-slate-200"}`}><div className={`flex items-center justify-between gap-3 px-4 py-3 ${dark ? "bg-slate-800/70" : "bg-slate-50"}`}><div><h4 className="text-xs font-bold uppercase tracking-wider">Repair quotation</h4><p className={`mt-1 text-[10px] ${muted}`}>Issued {new Date(active.quotation.issuedAt).toLocaleDateString("en-PH")}</p></div><span className="text-sm font-extrabold">{money(active.quotation.total)}</span></div><div className="space-y-2 p-4">{(active.quotation.parts || []).map((part, index) => <div key={`${part.description}-${index}`} className="flex items-start justify-between gap-4 text-xs"><span className="min-w-0 break-words">{part.description}</span><span className="shrink-0 font-semibold">{money(part.cost)}</span></div>)}<div className="flex items-start justify-between gap-4 border-t border-slate-500/20 pt-2 text-xs"><span>Labor and service</span><span className="shrink-0 font-semibold">{money(active.quotation.laborCost)}</span></div></div></section>}
        <section className={`rounded-2xl border p-4 sm:p-5 ${dark ? "border-slate-700 bg-slate-900/60" : "border-slate-200 bg-white shadow-sm"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-extrabold">Repair history</h4>
              <p className={`mt-1 text-xs ${muted}`}>Updates recorded for this repair ticket</p>
            </div>
            {active.history?.length > 0 && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>{active.history.length} {active.history.length === 1 ? "update" : "updates"}</span>}
          </div>
          {active.history?.length ? <ol className="mt-5 space-y-0" aria-label="Repair history timeline">{active.history.map((entry, index) => {
            const eventLabel = String(entry.event || "Update").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
            const eventDate = new Date(entry.createdAt);
            const hasValidDate = !Number.isNaN(eventDate.getTime());
            const isLatest = index === active.history.length - 1;
            return <li key={`${entry.createdAt}-${index}`} className="relative flex gap-3.5 pb-5 last:pb-0">
              {!isLatest && <span aria-hidden="true" className={`absolute left-[9px] top-5 h-[calc(100%-1.25rem)] w-px ${dark ? "bg-slate-700" : "bg-slate-200"}`} />}
              <span aria-hidden="true" className={`relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${isLatest ? "bg-red-600/15" : dark ? "bg-slate-800" : "bg-slate-100"}`}>
                <span className={`size-2 rounded-full ${isLatest ? "bg-red-600" : dark ? "bg-slate-500" : "bg-slate-400"}`} />
              </span>
              <div className={`min-w-0 flex-1 rounded-xl border px-3.5 py-3 ${isLatest ? dark ? "border-red-500/30 bg-red-500/5" : "border-red-200 bg-red-50/50" : dark ? "border-slate-700 bg-slate-950/40" : "border-slate-200 bg-slate-50/70"}`}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className={`text-sm font-bold ${isLatest ? dark ? "text-red-200" : "text-red-800" : dark ? "text-slate-100" : "text-slate-800"}`}>{eventLabel}</p>
                  {hasValidDate && <time dateTime={eventDate.toISOString()} className={`text-[11px] font-medium ${muted}`}>{eventDate.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time>}
                </div>
                {entry.detail && <p className={`mt-2 break-words text-sm leading-5 ${dark ? "text-slate-300" : "text-slate-600"}`}>{entry.detail}</p>}
              </div>
            </li>;
          })}</ol> : <div className={`mt-4 rounded-xl border border-dashed p-5 text-center ${dark ? "border-slate-700 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}><Clock3 size={18} className={`mx-auto ${muted}`} /><p className={`mt-2 text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`}>No history updates yet</p><p className={`mt-1 text-xs ${muted}`}>Changes to this repair will appear here.</p></div>}
        </section>
      </div></div>}
      {action === "payment" && <div className="space-y-4"><div className={`rounded-xl border p-4 ${dark ? "border-slate-700 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}><div className="flex justify-between gap-4 text-sm"><span className={muted}>Quoted amount</span><strong>{money(active?.quotation?.total)}</strong></div><div className="mt-2 flex justify-between gap-4 text-sm"><span className={muted}>Customer submitted</span><strong>{money(active?.payment?.proofAmount)}</strong></div>{active?.payment?.proofTransactionNumber && <p className={`mt-2 text-xs ${muted}`}>Reference: {active.payment.proofTransactionNumber}</p>}</div>{active?.payment?.proofUrl && <a href={active.payment.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-sky-700"><FileText size={15} />View proof · {active.payment.proofFileName || "Payment document"}</a>}{active?.payment?.proofUrl && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(active.payment.proofUrl) && <img src={active.payment.proofUrl} alt="Customer payment proof" className="max-h-80 w-full rounded-xl border object-contain" />}<label className="block text-xs font-semibold">Rejection reason (required only when rejecting)<textarea value={paymentRejectionReason} onChange={(event) => setPaymentRejectionReason(event.target.value)} rows={3} className={field} placeholder="Explain what needs to be corrected" /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => reviewPayment("reject")} disabled={busy === String(active?._id)} className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">Reject proof</button><button type="button" onClick={() => reviewPayment("approve")} disabled={busy === String(active?._id)} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 size={15} className="mr-1 inline" />Verify payment</button></div></div>}      {action === "review" && <form onSubmit={(event) => { event.preventDefault(); run(active, () => approveWarrantyClaim(active._id, review)); }} className="space-y-3"><label className="block text-xs font-semibold">Inspection findings<textarea required value={review.inspectionNotes} onChange={(event) => setReview({ ...review, inspectionNotes: event.target.value })} rows={3} className={field} /></label><label className="block text-xs font-semibold">Warranty decision / rejection reason<textarea required value={review.decisionReason} onChange={(event) => setReview({ ...review, decisionReason: event.target.value })} rows={2} className={field} /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy === String(active?._id)} onClick={() => { if (!review.inspectionNotes.trim() || !review.decisionReason.trim()) return toast.error("Add inspection findings and a rejection reason."); setRejectConfirmOpen(true); }} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">Reject repair</button><button disabled={busy === String(active?._id)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 size={16} />Approve free warranty service</button></div></form>}
      {action === "quote" && <form onSubmit={(event) => { event.preventDefault(); run(active, () => issueRepairQuotation(active._id, { ...quote, laborCost: Number(quote.laborCost), parts: quote.parts.filter((part) => part.description.trim()).map((part) => ({ ...part, cost: Number(part.cost) })) })); }} className="space-y-3"><label className="block text-xs font-semibold">Inspection findings<textarea required value={quote.inspectionNotes} onChange={(event) => setQuote({ ...quote, inspectionNotes: event.target.value })} rows={3} className={field} /></label>{active.workflowType === "warranty" && <label className="block text-xs font-semibold">Reason for voiding warranty (for example, customer misuse)<textarea required value={quote.decisionReason} onChange={(event) => setQuote({ ...quote, decisionReason: event.target.value })} rows={2} className={field} /></label>}<div className="space-y-2"><div className="flex items-center justify-between"><b className="text-sm">Itemized parts</b><button type="button" onClick={() => setQuote({ ...quote, parts: [...quote.parts, { description: "", cost: "" }] })} className="rounded-lg border px-2 py-1 text-xs">Add part</button></div>{quote.parts.map((part, index) => <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]"><input required placeholder="Part description" value={part.description} onChange={(event) => setQuote({ ...quote, parts: quote.parts.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry) })} className={field} /><input required type="number" min="0" step="0.01" placeholder="PHP cost" value={part.cost} onChange={(event) => setQuote({ ...quote, parts: quote.parts.map((entry, i) => i === index ? { ...entry, cost: event.target.value } : entry) })} className={field} /></div>)}</div><label className="block text-xs font-semibold">Service fee (PHP)<input required type="number" min="0" step="0.01" value={quote.laborCost} onChange={(event) => setQuote({ ...quote, laborCost: event.target.value })} className={field} /></label><p className="rounded-lg bg-slate-500/10 p-3 text-sm font-bold">Quotation total: {money(quote.parts.reduce((sum, part) => sum + (Number(part.cost) || 0), 0) + (Number(quote.laborCost) || 0))}</p><label className="block text-xs font-semibold">Quotation notes<textarea value={quote.quotationNotes} onChange={(event) => setQuote({ ...quote, quotationNotes: event.target.value })} rows={2} className={field} /></label><button className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white">Issue quotation to customer</button></form>}
      {action === "schedule" && <form onSubmit={(event) => { event.preventDefault(); run(active, () => scheduleRepair(active._id, schedule)); }} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">Start date<input required type="date" min={todayDateKey} value={schedule.startDate} onChange={(event) => setSchedule({ ...schedule, startDate: event.target.value, finishDate: schedule.finishDate && schedule.finishDate < event.target.value ? event.target.value : schedule.finishDate })} className={field} /></label><label className="block text-xs font-semibold">Expected finish date<input required type="date" min={schedule.startDate || todayDateKey} value={schedule.finishDate} onChange={(event) => setSchedule({ ...schedule, finishDate: event.target.value })} className={field} /></label></div><label className="block text-xs font-semibold">Scheduling notes<textarea value={schedule.notes} onChange={(event) => setSchedule({ ...schedule, notes: event.target.value })} rows={2} className={field} /></label><button className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white">Save schedule</button></form>}
      {action === "complete" && <form onSubmit={(event) => { event.preventDefault(); setCompleteConfirmOpen(true); }} className="space-y-3"><label className="block text-xs font-semibold">Completion notes<textarea required value={completion.notes} onChange={(event) => setCompletion({ ...completion, notes: event.target.value })} rows={3} className={field} /></label><div><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold">Completion photos <span className={`ml-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${dark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"}`}>Optional</span></span><span className={`text-[10px] font-medium ${muted}`}>{evidenceFiles.length} / 10</span></div><label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addEvidenceFiles(event.dataTransfer.files); }} className={`relative flex min-h-[100px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 transition focus-within:ring-2 focus-within:ring-emerald-500/30 ${dark ? "border-slate-700 bg-slate-950/50 hover:border-emerald-500/70 hover:bg-slate-900" : "border-slate-300 bg-slate-50/80 hover:border-emerald-500 hover:bg-emerald-50/50"}`}><input type="file" accept="image/*" multiple disabled={evidenceFiles.length >= 10} onChange={handleEvidenceSelection} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" aria-label="Choose repair completion photos" /><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${dark ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}><ImagePlus size={20} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{evidenceFiles.length ? "Add more photos" : "Add completion photos"}</span><span className={`mt-1 block text-[10px] leading-4 ${muted}`}>Drag and drop or browse · Images only · Up to 10 photos</span></span><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold ${dark ? "border-slate-700 bg-slate-800 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}><Upload size={13} />Browse</span></label>{evidenceFiles.length > 0 && <ul className="mt-2 grid gap-2 sm:grid-cols-2">{evidenceFiles.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 ${dark ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-white"}`}><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700"><Image size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold" title={file.name}>{file.name}</span><span className={`block text-[9px] ${muted}`}>{(file.size / (1024 * 1024)).toFixed(2)} MB</span></span><button type="button" onClick={() => setEvidenceFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`} className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${dark ? "text-slate-400 hover:bg-red-950/50 hover:text-red-300" : "text-slate-500 hover:bg-red-50 hover:text-red-700"}`}><X size={14} /></button></li>)}</ul>}</div><button disabled={busy === String(active?._id)} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">Mark completed and issue invoice</button></form>}
    </section></div>}
    {completeConfirmOpen && action === "complete" && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="complete-repair-title" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== String(active?._id)) setCompleteConfirmOpen(false); }}><section className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700"><CheckCircle2 size={20} /></span><div><h3 id="complete-repair-title" className="font-bold">Confirm repair completion</h3><p className={`mt-1 text-sm ${muted}`}>Mark the repair for <span className="font-semibold">{active?.productName || "this item"}</span> as completed and issue its invoice?</p></div><button type="button" onClick={() => setCompleteConfirmOpen(false)} disabled={busy === String(active?._id)} aria-label="Close confirmation" className={`ml-auto rounded-lg p-1.5 ${muted}`}><X size={18} /></button></div><p className={`mt-3 text-xs leading-5 ${muted}`}>The completion notes and any photos you added will be saved with this update.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCompleteConfirmOpen(false)} disabled={busy === String(active?._id)} className="min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Back to details</button><button type="button" disabled={busy === String(active?._id)} onClick={() => { setCompleteConfirmOpen(false); void submitComplete(); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === String(active?._id) ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Confirm completion</button></div></section></div>}
    {rejectConfirmOpen && action === "review" && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-repair-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setRejectConfirmOpen(false); }}><section className={`max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border p-5 shadow-2xl ${card}`}><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600"><X size={20} /></span><div><h3 id="reject-repair-title" className="font-bold">Confirm repair rejection</h3><p className={`mt-1 text-xs ${muted}`}>This will close the warranty claim for {active?.productName || "this product"}.</p></div></div><div className={`mt-4 rounded-xl border p-3 ${dark ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Rejection reason</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{review.decisionReason}</p></div><p className={`mt-3 text-xs leading-5 ${muted}`}>The customer will be notified of this decision. Confirm only if the inspection findings and reason are accurate.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setRejectConfirmOpen(false)} className="min-h-10 rounded-lg border px-4 text-sm font-semibold">Back to inspection</button><button type="button" disabled={busy === String(active?._id)} onClick={() => { setRejectConfirmOpen(false); void run(active, () => rejectWarrantyClaim(active._id, review)); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-50">Confirm rejection</button></div></section></div>}
    <RepairReceiptModal repair={receiptRepair} darkMode={darkMode} onClose={() => setReceiptRepair(null)} />
    {previewMedia && <div role="dialog" aria-modal="true" aria-label="Repair media preview" className="fixed inset-0 z-[140] flex items-center justify-center bg-black/95 p-0 sm:bg-black/85 sm:p-4" onClick={() => setPreviewMedia(null)}><button type="button" onClick={() => setPreviewMedia(null)} aria-label="Close media preview" className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white"><X size={22} /></button><img src={previewMedia} alt="Reported defect enlarged" onClick={(event) => event.stopPropagation()} className="max-h-[100dvh] max-w-[100vw] rounded-none object-contain sm:max-h-[90vh] sm:max-w-[95vw] sm:rounded-lg" /></div>}
  </section>;
}
