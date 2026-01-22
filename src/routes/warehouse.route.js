import express from "express";
import {
  createWarehouseStock,
  getAllWarehouseStock,
  getWarehouseStockById,
  updateWarehouseStockQuantity,
} from "../controllers/warehouse.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

// Create new warehouse stock record
router.post(
  "/warehouse",
  protect,
  permissionGranted("owner"),
  createWarehouseStock
);

// Get all warehouse stock
router.get(
  "/warehouse",
  protect,
  permissionGranted("owner"),
  getAllWarehouseStock
);

// Get warehouse stock by ID
router.get(
  "/warehouse/:id",
  protect,
  permissionGranted("owner"),
  getWarehouseStockById
);

// Update warehouse stock quantity
router.patch(
  "/warehouse/:id/quantity",
  protect,
  permissionGranted("owner"),
  updateWarehouseStockQuantity
);

export default router;
