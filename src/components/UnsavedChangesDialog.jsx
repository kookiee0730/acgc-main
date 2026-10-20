import { AlertTriangle } from "lucide-react";

export default function UnsavedChangesDialog({ open, onStay, onDiscard, darkMode = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => event.stopPropagation()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="unsaved-changes-title" aria-describedby="unsaved-changes-description" className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${darkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle size={22} /></span>
          <h2 id="unsaved-changes-title" className="text-lg font-bold">Discard unsaved changes?</h2>
        </div>
        <p id="unsaved-changes-description" className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>You have changes that have not been saved. Are you sure you want to exit?</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onStay} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${darkMode ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>Stay</button>
          <button type="button" onClick={onDiscard} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Discard changes</button>
        </div>
      </section>
    </div>
  );
}
