import express from "express";
import {
  createOrder,
  getOrders,
  getOrdersByStorefrontId,
  getAllOrders,
} from "../controllers/order.controller.js";

const router = express.Router();

// Create new order
router.post("/order", createOrder);
router.get("/order", getAllOrders);
router.get("/order/:orderId", getOrders);
router.get("/order/storefront/:storefrontId", getOrdersByStorefrontId);

export default router;
