import express from "express";
import {
  createInventory,
  getAllInventory,
  getInventoryById,
  updateInventory,
} from "../controllers/inventory.controller.js";

const router = express.Router();

// Create new inventory item
router.post("/inventory", createInventory);

// Get all inventory items
router.get("/inventory", getAllInventory);

// Get inventory item by ID
router.get("/inventory/:id", getInventoryById);

// Update inventory metadata
router.patch("/inventory/:id", updateInventory);

export default router;
