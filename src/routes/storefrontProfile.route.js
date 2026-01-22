import express from "express";
import {
  createStorefrontProfile,
  getAllStorefrontProfiles,
  getStorefrontProfileById,
  updateStorefrontProfile,
} from "../controllers/storefrontProfile.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

// Create new storefront profile
router.post(
  "/storefront-profile",
  protect,
  permissionGranted("Owner"),
  createStorefrontProfile
);

// Get all storefront profiles
router.get(
  "/storefront-profile",
  protect,
  permissionGranted("Owner"),
  getAllStorefrontProfiles
);

// Get storefront profile by ID
router.get(
  "/storefront-profile/:id",
  protect,
  permissionGranted("Owner"),
  getStorefrontProfileById
);

// Update storefront profile
router.patch(
  "/storefront-profile/:id",
  protect,
  permissionGranted("Owner"),
  updateStorefrontProfile
);

export default router;
