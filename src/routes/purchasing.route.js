import express from "express";
import {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
} from "../controllers/purchase.controller.js";

const router = express.Router();

router.post("/purchase", createPurchase);
router.get("/purchase", getAllPurchases);
router.get("/purchase/:id", getPurchaseById);

export default router;
