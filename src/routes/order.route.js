import express from "express";
import { createOrder } from "../controllers/order.controller.js";

const router = express.Router();

// Create new order
router.post("/order", createOrder);

export default router;

