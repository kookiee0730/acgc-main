import Navbar from "@/components/layout/Navbar";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import RepairManagement from "@/components/RepairManagement";
import { useAdminTheme } from "@/contexts/AdminThemeContext";

function RepairRequests() {
  const { darkMode } = useAdminTheme();

  return (
    <div className={`flex h-screen min-h-0 flex-col overflow-hidden ${darkMode ? "bg-[#07111f] text-slate-100" : "bg-gray-100 text-slate-900"}`}>
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto p-6 !pb-[calc(10rem+env(safe-area-inset-bottom))] sm:!pb-[calc(10rem+env(safe-area-inset-bottom))] lg:!pb-24">
        <AdminPageHeader
          title="Repair Management"
          description="Review and manage warranty repair requests, customer approvals, scheduling, and repair history."
        />
        <RepairManagement darkMode={darkMode} />
      </main>
    </div>
  );
}

export default RepairRequests;
