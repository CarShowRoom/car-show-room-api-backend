import express from "express";
import {
  createStorefrontInventory,
  getAllStorefrontInventory,
  getStorefrontInventoryById,
} from "../controllers/storefrontInventory.controller.js";

const router = express.Router();

// Create new storefront inventory
router.post("/storefront-inventory", createStorefrontInventory);

// Get all storefront inventory (with filtering, pagination, sorting)
router.get("/storefront-inventory", getAllStorefrontInventory);

// Get storefront inventory by ID
router.get("/storefront-inventory/:id", getStorefrontInventoryById);

export default router;
