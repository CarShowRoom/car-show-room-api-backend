import express from "express";
import {
  getAllLocationProfiles,
  getLocationProfileById,
} from "../controllers/locationProfile.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

// Get all location profiles
router.get(
  "/location-profile",
  protect,
  permissionGranted("Owner"),
  getAllLocationProfiles
);

// Get location profile by ID
router.get(
  "/location-profile/:id",
  protect,
  permissionGranted("Owner"),
  getLocationProfileById
);

export default router;
