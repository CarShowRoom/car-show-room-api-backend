import express from "express";
import {
  createGRN,
  getAllGRN,
  getGRNById,
  updateGRNStatus,
  updateGRNLineItems,
} from "../controllers/grn.controller.js";

const router = express.Router();

// Create new GRN
router.post("/grn", createGRN);

// Get all GRNs
router.get("/grn", getAllGRN);

// Get GRN by ID
router.get("/grn/:id", getGRNById);

// Update GRN status
router.patch("/grn/:id/status", updateGRNStatus);

// Update GRN line items
router.patch("/grn/:id/line-items", updateGRNLineItems);

export default router;
