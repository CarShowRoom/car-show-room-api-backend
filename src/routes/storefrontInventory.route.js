import express from "express";
import {
  createStorefrontInventory,
  getAllStorefrontInventory,
  getAllStorefrontInventoryByStorefrontId,
  getStorefrontInventoryById,
  updateStorefrontInventoryQuantity,
} from "../controllers/storefrontInventory.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

// Create new storefront inventory
router.post("/storefront-inventory", createStorefrontInventory);

// Get all storefront inventory (with filtering, pagination, sorting)
router.get("/storefront-inventory", getAllStorefrontInventory);

// Get storefront inventory by ID
router.get("/storefront-inventory/:id", getStorefrontInventoryById);

// Update storefront inventory quantity
router.patch(
  "/storefront-inventory/:id/quantity",
  protect,
  updateStorefrontInventoryQuantity
);

export default router;
