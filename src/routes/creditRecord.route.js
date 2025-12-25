import express from "express";
import {
  createCreditPayment,
  getCreditRecordsByOrderId,
  getAllCreditRecords,
  getCreditRecordById,
  getCreditRecordsByCreditPersonId,
} from "../controllers/creditRecord.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

// Create credit payment for an order
router.post("/credit-record", protect, createCreditPayment);

// Get all credit records (with optional filtering)
router.get("/credit-record", getAllCreditRecords);

// Get credit record by ID
router.get("/credit-record/:id", getCreditRecordById);

// Get all credit records for a specific order
router.get("/order/:orderId/credit-records", getCreditRecordsByOrderId);

// Get all credit records for a specific credit person
router.get(
  "/credit-persona/:creditPersonId/credit-records",
  getCreditRecordsByCreditPersonId
);

export default router;
