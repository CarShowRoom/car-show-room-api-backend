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

router.post("/purchase", protect, permissionGranted("Owner"), createPurchase);
router.get("/purchase", protect, permissionGranted("Owner"), getAllPurchases);
router.get(
  "/purchase/:id",
  protect,
  permissionGranted("Owner"),
  getPurchaseById
);
router.patch(
  "/purchase/:id/status",
  protect,
  permissionGranted("Owner"),
  updatePurchaseStatus
);
router.patch(
  "/purchase/:id/soft-delete",
  protect,
  permissionGranted("Owner"),
  softDeletePurchase
);
router.patch(
  "/purchase/:id/restore",
  protect,
  permissionGranted("Owner"),
  restorePurchase
);
export default router;
