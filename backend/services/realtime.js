import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import Admin from "../models/Admin.js";
import Order from "../models/Order.js";
import User from "../models/User.js";

const getAccountForToken = async (decoded) => {
  const projection = "session_version role staff_access";
  if (decoded.auth_source === "admin") return Admin.findById(decoded.id).select(projection).lean();
  if (decoded.auth_source === "user") return User.findById(decoded.id).select(projection).lean();
  if (decoded.role === "admin") {
    return await Admin.findById(decoded.id).select(projection).lean()
      || await User.findById(decoded.id).select(projection).lean();
  }
  return User.findById(decoded.id).select(projection).lean();
};

const realtimeModulesByArea = {
  orders: ["dashboard", "site_inspection", "transactions", "progress_monitoring"],
  repairs: ["transactions"],
  products: ["product_management"],
  catalog: ["product_management"],
  reviews: ["transactions"],
  settings: ["settings"],
  profile: ["profile"],
};

export const getStaffRealtimeModules = (area, staffAccess) => {
  const areaModules = realtimeModulesByArea[area] || [];
  if (staffAccess === undefined) return areaModules;
  const modules = staffAccess?.modules || {};
  return areaModules.filter((moduleKey) => (
    modules[moduleKey]?.enabled === true && modules[moduleKey]?.actions?.view === true
  ));
};

const roomId = (value) => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value._id != null && value._id !== value) return roomId(value._id);
  if (typeof value.toHexString === "function") return value.toHexString();
  if (typeof value.id === "string" || typeof value.id === "number") return String(value.id);
  return String(value);
};

export const buildRealtimeEvent = ({ method, url, user }, responseBody = {}, timestamp = new Date()) => {
  const pathname = new URL(url || "/", "http://localhost").pathname.replace(/^\/api\/?/, "");
  const [resource = "system", firstSegment = "", secondSegment = ""] = pathname.split("/").filter(Boolean);
  const reviewMutation = resource === "orders" && (firstSegment === "reviews" || pathname.split("/").includes("review"));
  const isSystemSettings = (resource === "auth" || resource === "users") && firstSegment === "system-settings";
  const area = resource === "repairs"
    ? "repairs"
    : reviewMutation
    ? "reviews"
    : isSystemSettings
      ? "settings"
      : ["orders", "products", "catalog", "cart"].includes(resource)
        ? resource
        : ["auth", "users"].includes(resource)
          ? "profile"
          : null;
  const entity = responseBody?.order || responseBody?.repair || responseBody?.product || responseBody?.item || responseBody?.user || null;
  const routeRecordId = resource === "orders"
    ? (firstSegment === "admin" ? secondSegment : firstSegment)
    : firstSegment;
  const orderId = roomId(entity?.tracking ? entity : entity?._id || (resource === "orders" ? routeRecordId : ""));
  const entityId = roomId(entity?._id || entity?.id || routeRecordId || responseBody?.id);
  const targetCustomerId = roomId(entity?.customer)
    || (area === "profile" ? roomId(entity?._id || entity?.id) : "")
    || (user?.role === "customer" ? roomId(user.id || user._id) : "");
  const change = String(method || "GET").toUpperCase();

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type: `${area}.${change.toLowerCase()}`,
    area,
    action: change,
    recordId: entityId || orderId,
    ...(area === "orders" || area === "reviews" ? { orderId } : {}),
    ...(entity?.tracking ? { tracking: String(entity.tracking) } : {}),
    ...(entity?.status ? { status: String(entity.status) } : {}),
    ...(reviewMutation ? { relatedAreas: ["orders"] } : {}),
    actorRole: user?.role || "unknown",
    timestamp: new Date(timestamp).toISOString(),
    targetCustomerId,
  };
};

export const createRealtimeServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const account = await getAccountForToken(decoded);
      if (!account || Number(decoded.session_version || 0) !== Number(account.session_version || 0)) {
        return next(new Error("Session is invalid or has been revoked"));
      }

      socket.data.user = {
        id: String(decoded.id),
        role: decoded.role || account.role,
        staffAccess: account.staff_access || {},
        tokenExpiresAt: decoded.exp ? decoded.exp * 1000 : null,
      };
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const { id, role, staffAccess, tokenExpiresAt } = socket.data.user;
    socket.join(`user:${id}`);
    if (role === "customer") {
      socket.join("customers");
      try {
        const orders = await Order.find({ customer: id }).select("_id").sort({ createdAt: -1 }).limit(200).lean();
        if (socket.connected) orders.forEach((order) => socket.join(`order:${String(order._id)}`));
      } catch {
        console.error("Unable to initialize authorized realtime order rooms.");
      }
    }
    if (["admin", "super_admin"].includes(role)) socket.join("admins");
    if (role === "skilled_worker") {
      getStaffRealtimeModules("orders", staffAccess).forEach((moduleKey) => socket.join(`staff:${moduleKey}`));
      ["products", "catalog", "reviews", "settings", "profile"].forEach((area) => {
        getStaffRealtimeModules(area, staffAccess).forEach((moduleKey) => socket.join(`staff:${moduleKey}`));
      });
    }

    if (tokenExpiresAt) {
      const expiresIn = tokenExpiresAt - Date.now();
      if (expiresIn <= 0) socket.disconnect(true);
      else socket.data.expiryTimer = setTimeout(() => socket.disconnect(true), expiresIn);
    }

    socket.emit("realtime:ready", { timestamp: new Date().toISOString() });
    socket.on("disconnect", () => clearTimeout(socket.data.expiryTimer));
  });

  return io;
};

export const realtimeResponseMiddleware = (io) => (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400 && body?.success !== false && body?.duplicate !== true && req.user) {
      const event = buildRealtimeEvent({ method: req.method, url: req.originalUrl, user: req.user }, body);
      if (event.area) {
        const { targetCustomerId, relatedAreas = [], ...publicEvent } = event;
        const originClientId = String(req.get?.("X-Client-Id") || req.headers?.["x-client-id"] || "").slice(0, 100);
        const affectedAreas = [...new Set([event.area, ...relatedAreas])];
        for (const area of affectedAreas) {
          const scopedEvent = { ...publicEvent, area };
          const isSharedData = ["products", "catalog", "reviews", "settings"].includes(area);
          if (["orders", "repairs", "products", "catalog", "reviews", "settings"].includes(area)) {
            io.to("admins").emit("realtime:changed", scopedEvent);
          }
          if (req.user.role === "skilled_worker") {
            for (const moduleKey of getStaffRealtimeModules(area)) {
              io.to(`staff:${moduleKey}`).emit("realtime:changed", scopedEvent);
            }
          }
          if (isSharedData) {
            const customerEvent = area === "reviews"
              ? (({ recordId, orderId, tracking, status, ...safeEvent }) => safeEvent)(scopedEvent)
              : scopedEvent;
            io.to("customers").emit("realtime:changed", customerEvent);
          }
          if (targetCustomerId) {
            io.to(`user:${targetCustomerId}`).emit("realtime:changed", {
              ...scopedEvent,
              ...(originClientId ? { originClientId } : {}),
            });
          }
          if (scopedEvent.orderId) {
            io.to(`order:${scopedEvent.orderId}`).emit("realtime:changed", {
              ...scopedEvent,
              ...(originClientId ? { originClientId } : {}),
            });
          }
        }
      }
    }
    return sendJson(body);
  };

  next();
};
