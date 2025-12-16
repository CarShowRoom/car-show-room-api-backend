import express from "express";
import {
  createGRN,
  getAllGRN,
  getGRNById,
} from "../controllers/grn.controller.js";

const router = express.Router();

// Create new GRN
router.post("/grn", createGRN);

// Get all GRNs
router.get("/grn", getAllGRN);

// Get GRN by ID
router.get("/grn/:id", getGRNById);

export default router;

