import express from "express";
import {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchaseStatus,
  softDeletePurchase,
  restorePurchase,
} from "../controllers/purchase.controller.js";
import {
  protect,
  permissionGranted,
} from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

router.post("/purchase", protect, createPurchase);
router.get("/purchase", getAllPurchases);
router.get("/purchase/:id", getPurchaseById);
router.patch("/purchase/:id/status", updatePurchaseStatus);
router.patch("/purchase/:id/soft-delete", softDeletePurchase);
router.patch("/purchase/:id/restore", restorePurchase);
export default router;
