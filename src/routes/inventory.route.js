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
router.post("/inventory", protect, permissionGranted("owner"), createInventory);

// Get all inventory items
router.get("/inventory", protect, permissionGranted("owner"), getAllInventory);

// Get inventory item by ID
router.get(
  "/inventory/:id",
  protect,
  permissionGranted("owner"),
  getInventoryById
);

// Update inventory metadata
router.patch(
  "/inventory/:id",
  protect,
  permissionGranted("owner"),
  updateInventory
);

export default router;
