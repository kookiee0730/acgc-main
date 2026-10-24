import express from "express";
import { authMiddleware, optionalAuthMiddleware, permissionMiddleware, roleMiddleware, staffModulePermission } from "../middleware/auth.js";
import {
  completeRepair,
  createCustomerRepairRequest,
  createAdminRepairRequest,
  getAdminCustomerRepairProducts,
  getAdminOrderRepairHistory,
  issueRepairQuotation,
  listCompletedRepairProjects,
  listCustomerRepairRequests,
  listRepairRequests,
  respondToQuotation,
  reviewWarrantyClaim,
  rejectWarrantyClaim,
  reviewRepairPaymentProof,
  scheduleRepair,
  submitRepairPaymentProof,
  startRepair,
  trackRepairRequest,
} from "../controllers/repairController.js";

const router = express.Router();
const customer = [authMiddleware, roleMiddleware("customer")];
const staffRepairAccess = (action) => [authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("repair_management", action)];

router.get("/customer/orders", ...customer, listCompletedRepairProjects);
router.get("/customer", ...customer, listCustomerRepairRequests);
router.post("/customer/requests", ...customer, createCustomerRepairRequest);
router.get("/track/:repairTrackingId", optionalAuthMiddleware, permissionMiddleware("can_track_products"), trackRepairRequest);
router.post("/customer/:repairId/quotation-response", ...customer, respondToQuotation);
router.post("/customer/:repairId/payment-proof", ...customer, submitRepairPaymentProof);
router.get("/admin/requests", ...staffRepairAccess("view"), listRepairRequests);
router.get("/admin/orders/:orderId/repair-history", authMiddleware, roleMiddleware(["admin", "super_admin", "skilled_worker"]), staffModulePermission("transactions", "view"), getAdminOrderRepairHistory);
router.get("/admin/customers/:customerId/products", ...staffRepairAccess("view"), getAdminCustomerRepairProducts);
router.post("/admin/requests", ...staffRepairAccess("create"), createAdminRepairRequest);
router.post("/admin/requests/:repairId/approve-warranty", ...staffRepairAccess("manage"), reviewWarrantyClaim);
router.post("/admin/requests/:repairId/reject-warranty", ...staffRepairAccess("manage"), rejectWarrantyClaim);
router.post("/admin/requests/:repairId/quotation", ...staffRepairAccess("manage"), issueRepairQuotation);
router.post("/admin/requests/:repairId/payment-proof/review", ...staffRepairAccess("manage"), reviewRepairPaymentProof);
router.post("/admin/requests/:repairId/schedule", ...staffRepairAccess("manage"), scheduleRepair);
router.post("/admin/requests/:repairId/start", ...staffRepairAccess("manage"), startRepair);
router.post("/admin/requests/:repairId/complete", ...staffRepairAccess("manage"), completeRepair);

export default router;
