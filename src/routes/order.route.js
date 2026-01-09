import express from "express";
import {
  createOrder,
  getOrders,
  getOrdersByStorefrontId,
  getAllOrders,
  updateOrderCreditPersonId,
  addOrderItems,
  removeOrderItems,
} from "../controllers/order.controller.js";

const router = express.Router();
import { protect } from "../controllers/administrationPolicy.controller.js";

// Create new order
router.post("/order", protect, createOrder);
router.get("/order", getAllOrders);
router.get("/order/:orderId", getOrders);
router.get("/order/storefront/:storefrontId", getOrdersByStorefrontId);

// Update/add credit person ID to an order
router.patch("/order/:orderId/credit-person", protect, updateOrderCreditPersonId);

// Add order items to existing order
router.patch("/order/:orderId/items/add", protect, addOrderItems);

// Remove order items from existing order
router.patch("/order/:orderId/items/remove", protect, removeOrderItems);

export default router;
