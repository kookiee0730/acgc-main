import express from "express";
import { authMiddleware, optionalAuthMiddleware, permissionMiddleware, roleMiddleware, staffModulePermission } from "../middleware/auth.js";
import {
  createOrder,
  createOrderAsAdmin,
  listOrders,
  trackOrder,
  getProductReviewSummary,
  getProductReviews,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  updateOrderInspection,
  updateOrderProgress,
  generateContract,
  submitOrderReview,
  deleteOrderReview,
  setOrderReviewVisibility,
  respondToContract,
  cancelCustomerOrder,
  submitCustomerPaymentProof,
  addAdminPaymentSupportingDocument,
  viewAdminPaymentSupportingDocument,
  viewCustomerPaymentSupportingDocument,
  respondToInstallationSchedule,
  sendWalkInApprovalEmail,
} from "../controllers/orderController.js";
import { paymentProofUploadMiddleware } from "../controllers/uploadController.js";
import { generateTransactionReport } from "../controllers/reportController.js";

const router = express.Router();

router.get("/", authMiddleware, listOrders);
router.post("/", authMiddleware, roleMiddleware("customer"), permissionMiddleware("can_request_orders"), createOrder);
router.get("/track/:tracking", optionalAuthMiddleware, permissionMiddleware("can_track_products"), trackOrder);
router.put("/:orderId/contract", authMiddleware, roleMiddleware("customer"), respondToContract);
router.put("/:orderId/cancel", authMiddleware, roleMiddleware("customer"), cancelCustomerOrder);
router.put("/:orderId/payment-proof", authMiddleware, roleMiddleware("customer"), submitCustomerPaymentProof);
router.get(
  "/:orderId/payment-records/:recordId/documents/:documentId",
  authMiddleware,
  roleMiddleware("customer"),
  viewCustomerPaymentSupportingDocument,
);
router.put("/:orderId/installation-schedule", authMiddleware, respondToInstallationSchedule);
router.put("/:orderId/review", authMiddleware, roleMiddleware("customer"), permissionMiddleware("can_upload_feedback"), submitOrderReview);
router.get("/reviews/product/:productId/summary", getProductReviewSummary);
router.get("/reviews/product/:productId", authMiddleware, permissionMiddleware("can_upload_feedback"), getProductReviews);

// Admin routes
router.get("/admin/list", authMiddleware, staffModulePermission((req) => req.query.module), getAdminOrders);
router.get("/admin/reports", authMiddleware, roleMiddleware(["admin", "super_admin"]), generateTransactionReport);
router.get("/admin/:orderId", authMiddleware, staffModulePermission((req) => req.query.module), getAdminOrderById);
router.post("/admin/create", authMiddleware, roleMiddleware("admin"), createOrderAsAdmin);
router.put("/admin/:orderId/status", authMiddleware, roleMiddleware("admin"), updateOrderStatus);
router.post(
  "/admin/:orderId/payment-records/:recordId/documents",
  authMiddleware,
  roleMiddleware(["admin", "super_admin"]),
  paymentProofUploadMiddleware,
  addAdminPaymentSupportingDocument,
);
router.get(
  "/admin/:orderId/payment-records/:recordId/documents/:documentId",
  authMiddleware,
  roleMiddleware(["admin", "super_admin"]),
  viewAdminPaymentSupportingDocument,
);
router.delete("/admin/:orderId/review", authMiddleware, roleMiddleware("admin"), deleteOrderReview);
router.put("/admin/:orderId/review/visibility", authMiddleware, roleMiddleware(["admin", "super_admin"]), setOrderReviewVisibility);
router.put("/admin/:orderId/inspection", authMiddleware, roleMiddleware("admin"), updateOrderInspection);
router.put("/admin/:orderId/progress", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("progress_monitoring", "edit"), updateOrderProgress);
router.post("/admin/:orderId/contract", authMiddleware, roleMiddleware("admin"), generateContract);
router.post("/admin/:orderId/send-contract-email", authMiddleware, roleMiddleware("admin"), sendWalkInApprovalEmail);

export default router;
