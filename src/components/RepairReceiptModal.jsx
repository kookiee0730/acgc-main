import { useRef } from "react";
import { FileText, X } from "lucide-react";
import { buildRepairReceiptHtml } from "@/lib/repairReceipt";

export default function RepairReceiptModal({ repair, darkMode = false, onClose }) {
  const frameRef = useRef(null);
  if (!repair) return null;
  const receiptHtml = buildRepairReceiptHtml(repair);

  return <div className="mobile-fullscreen-overlay fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-0 sm:p-3" role="dialog" aria-modal="true" aria-labelledby="repair-receipt-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`mobile-fullscreen-dialog flex h-[94dvh] max-h-[94dvh] w-[min(100%,210mm)] flex-col overflow-hidden rounded-2xl shadow-2xl ${darkMode ? "border border-slate-600 bg-[#0d1f2f]" : "bg-slate-100"}`}>
      <header className={`z-10 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${darkMode ? "border-slate-600 bg-[#11293a] text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="min-w-0"><h2 id="repair-receipt-title" className="font-bold">Repair receipt</h2><p className="mt-0.5 text-xs opacity-70">Preview service receipt · {repair.invoiceNumber || "Invoice"}</p></div>
        <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => frameRef.current?.contentWindow?.print()} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white"><FileText size={14} /><span className="hidden sm:inline">Print / Save PDF</span><span className="sm:hidden">Print</span></button><button type="button" onClick={onClose} aria-label="Close receipt" className="rounded-lg p-2 hover:bg-slate-500/10"><X size={20} /></button></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100 p-2 sm:p-3"><iframe ref={frameRef} title="Repair receipt preview" srcDoc={receiptHtml} scrolling="no" style={{ height: "1123px" }} className="block w-full border-0 bg-white shadow-sm" /></div>
    </section>
  </div>;
}
