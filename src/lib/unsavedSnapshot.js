const numericFieldPattern = /^(width|height|area|.*_(width|height|area)|qty|quantity|progress|rating|amount|.*_amount|price|.*_price(?:_override)?|cost|.*_cost|total|.*_total|count|.*_count|days|.*_days|blade_count|rate|.*_rate|fee|.*_fee|manual_override|minimum_blades|maximum_blades|custom_warranty_days)$/i;

const normalizeSnapshotValue = (value, fieldName = "") => {
  if (numericFieldPattern.test(fieldName) && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof File !== "undefined" && value instanceof File) {
    return { __file: true, name: value.name, size: value.size, type: value.type, lastModified: value.lastModified };
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeSnapshotValue(entry));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((normalized, key) => {
      normalized[key] = normalizeSnapshotValue(value[key], key);
      return normalized;
    }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
};

export const createUnsavedSnapshot = (value) => JSON.stringify(normalizeSnapshotValue(value));
