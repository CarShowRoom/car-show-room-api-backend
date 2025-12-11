import express from "express";
import {
  createWarehouseProfile,
  getAllWarehouseProfiles,
  getWarehouseProfileById,
} from "../controllers/warehouseProfile.controller.js";

const router = express.Router();

// Create new warehouse profile
router.post("/warehouse-profile", createWarehouseProfile);

// Get all warehouse profiles
router.get("/warehouse-profile", getAllWarehouseProfiles);

// Get warehouse profile by ID
router.get("/warehouse-profile/:id", getWarehouseProfileById);

export default router;
