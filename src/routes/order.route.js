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
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

// Create new order
router.post("/order", protect, permissionGranted("owner"), createOrder);
router.get("/order", protect, permissionGranted("owner"), getAllOrders);
router.get("/order/:orderId", protect, permissionGranted("owner"), getOrders);
router.get(
  "/order/storefront/:storefrontId",
  protect,
  permissionGranted("owner"),
  getOrdersByStorefrontId
);

// Update/add credit person ID to an order
router.patch(
  "/order/:orderId/credit-person",
  protect,
  permissionGranted("owner"),
  updateOrderCreditPersonId
);

// Add order items to existing order
router.patch(
  "/order/:orderId/items/add",
  protect,
  permissionGranted("owner"),
  addOrderItems
);

// Remove order items from existing order
router.patch(
  "/order/:orderId/items/remove",
  protect,
  permissionGranted("owner"),
  removeOrderItems
);

export default router;
