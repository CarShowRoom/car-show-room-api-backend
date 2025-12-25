import express from "express";
import {
  createOrder,
  getOrders,
  getOrdersByStorefrontId,
  getAllOrders,
  updateOrderCreditPersonId,
} from "../controllers/order.controller.js";

const router = express.Router();
import { protect } from "../controllers/administrationPolicy.controller.js";

// Create new order
router.post("/order", protect, createOrder);
router.get("/order", getAllOrders);
router.get("/order/:orderId", getOrders);
router.get("/order/storefront/:storefrontId", getOrdersByStorefrontId);

// Update/add credit person ID to an order
router.patch("/order/:orderId/credit-person", updateOrderCreditPersonId);

export default router;
