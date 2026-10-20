export const normalizeUserProfile = (user = {}) => {
  const profile = {
    id: user.id || user._id || "",
    email: user.email || "",
    username: user.username || "",
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    role: String(user.role || "customer").trim().toLowerCase(),
    phone: user.phone || "",
    street_address: user.street_address || "",
    city: user.city || "",
    province: user.province || "",
    zip_code: user.zip_code || "",
    is_active: true,
    access_permissions: user.access_permissions || {},
    staff_access: user.staff_access || {},
    customer_cancellation_count: Number(user.customer_cancellation_count) || 0,
    online_order_cooldown_until: user.online_order_cooldown_until || null,
    created_at: user.created_at || user.createdAt || null,
    updated_at: user.updated_at || user.updatedAt || null,
  };

  return profile;
};
