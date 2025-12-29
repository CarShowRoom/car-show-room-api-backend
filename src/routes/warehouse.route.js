import express from "express";
import {
  createWarehouseStock,
  getAllWarehouseStock,
  getWarehouseStockById,
  updateWarehouseStockQuantity,
} from "../controllers/warehouse.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

// Create new warehouse stock record
router.post("/warehouse", createWarehouseStock);

// Get all warehouse stock
router.get("/warehouse", getAllWarehouseStock);

// Get warehouse stock by ID
router.get("/warehouse/:id", getWarehouseStockById);

// Update warehouse stock quantity
router.patch("/warehouse/:id/quantity", protect, updateWarehouseStockQuantity);

export default router;
