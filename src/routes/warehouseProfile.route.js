import express from "express";
import {
  createWarehouseProfile,
  getAllWarehouseProfiles,
  getWarehouseProfileById,
  updateWarehouseProfile,
} from "../controllers/warehouseProfile.controller.js";

const router = express.Router();

// Create new warehouse profile
router.post("/warehouse-profile", createWarehouseProfile);

// Get all warehouse profiles
router.get("/warehouse-profile", getAllWarehouseProfiles);

// Get warehouse profile by ID
router.get("/warehouse-profile/:id", getWarehouseProfileById);

// Update warehouse profile
router.patch("/warehouse-profile/:id", updateWarehouseProfile);

export default router;
