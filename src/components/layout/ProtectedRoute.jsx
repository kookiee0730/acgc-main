import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const STAFF_MODULE_PATHS = [
  ["dashboard", "/dashboard"],
  ["product_management", "/product"],
  ["site_inspection", "/site-inspection"],
  ["repair_management", "/repair-requests"],
  ["progress_monitoring", "/progress-monitor"],
  ["transactions", "/transactions"],
  ["settings", "/settings"],
  ["profile", "/profile"],
];

export default function ProtectedRoute({ children, roles = [], requiredModule }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-12 w-12 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const canViewStaffModule = (moduleKey) => (
    user.staff_access?.modules?.[moduleKey]?.enabled === true &&
    user.staff_access?.modules?.[moduleKey]?.actions?.view === true
  );

  if (user.role === "skilled_worker" && requiredModule && !canViewStaffModule(requiredModule)) {
    const firstAllowedPath = STAFF_MODULE_PATHS.find(([moduleKey]) => canViewStaffModule(moduleKey))?.[1];
    return <Navigate to={firstAllowedPath || "/"} replace />;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    const fallback = user.role === "customer" ? "/customer-dashboard" : user.role === "skilled_worker" ? "/" : "/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return children;
}
