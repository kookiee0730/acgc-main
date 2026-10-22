import express from "express";
import { authMiddleware, roleMiddleware } from "../middleware/auth.js";
import {
  completeRepair,
  createCustomerRepairRequest,
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
} from "../controllers/repairController.js";

const router = express.Router();
const customer = [authMiddleware, roleMiddleware("customer")];
const admin = [authMiddleware, roleMiddleware(["admin", "super_admin"])];

router.get("/customer/orders", ...customer, listCompletedRepairProjects);
router.get("/customer", ...customer, listCustomerRepairRequests);
router.post("/customer/requests", ...customer, createCustomerRepairRequest);
router.post("/customer/:repairId/quotation-response", ...customer, respondToQuotation);
router.post("/customer/:repairId/payment-proof", ...customer, submitRepairPaymentProof);
router.get("/admin/requests", ...admin, listRepairRequests);
router.post("/admin/requests/:repairId/approve-warranty", ...admin, reviewWarrantyClaim);
router.post("/admin/requests/:repairId/reject-warranty", ...admin, rejectWarrantyClaim);
router.post("/admin/requests/:repairId/quotation", ...admin, issueRepairQuotation);
router.post("/admin/requests/:repairId/payment-proof/review", ...admin, reviewRepairPaymentProof);
router.post("/admin/requests/:repairId/schedule", ...admin, scheduleRepair);
router.post("/admin/requests/:repairId/start", ...admin, startRepair);
router.post("/admin/requests/:repairId/complete", ...admin, completeRepair);

export default router;
