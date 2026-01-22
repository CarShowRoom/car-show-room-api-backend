import express from "express";
import {
  createGRN,
  getAllGRN,
  getGRNById,
  updateGRNStatus,
  updateGRNLineItems,
} from "../controllers/grn.controller.js";

import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

// Create new GRN
router.post("/grn", protect, permissionGranted("Owner", "admin"), createGRN);

// Get all GRNs
router.get("/grn", protect, permissionGranted("Owner", "admin"), getAllGRN);

// Get GRN by ID
router.get(
  "/grn/:id",
  protect,
  permissionGranted("Owner", "admin"),
  getGRNById
);

// Update GRN status
router.patch(
  "/grn/:id/status",
  protect,
  permissionGranted("Owner"),
  updateGRNStatus
);

// Update GRN line items
router.patch(
  "/grn/:id/line-items",
  protect,
  permissionGranted("Owner"),
  updateGRNLineItems
);

export default router;
