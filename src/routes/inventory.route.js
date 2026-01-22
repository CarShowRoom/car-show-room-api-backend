import express from "express";
import {
  createInventory,
  getAllInventory,
  getInventoryById,
  updateInventory,
} from "../controllers/inventory.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

// Create new inventory item
router.post("/inventory", protect, permissionGranted("Owner"), createInventory);

// Get all inventory items
router.get("/inventory", protect, permissionGranted("Owner"), getAllInventory);

// Get inventory item by ID
router.get(
  "/inventory/:id",
  protect,
  permissionGranted("Owner"),
  getInventoryById
);

// Update inventory metadata
router.patch(
  "/inventory/:id",
  protect,
  permissionGranted("Owner"),
  updateInventory
);

export default router;
