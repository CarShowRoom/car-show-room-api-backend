import express from "express";
import {
  createGRN,
  getAllGRN,
  getGRNById,
  updateGRNStatus,
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

export default router;
