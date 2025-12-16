import express from "express";
import {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchaseStatus,
} from "../controllers/purchase.controller.js";

const router = express.Router();

router.post("/purchase", createPurchase);
router.get("/purchase", getAllPurchases);
router.get("/purchase/:id", getPurchaseById);
router.patch("/purchase/:id/status", updatePurchaseStatus);

export default router;
