import express from "express";
import {
  createStorefrontProfile,
  getAllStorefrontProfiles,
  getStorefrontProfileById,
  updateStorefrontProfile,
} from "../controllers/storefrontProfile.controller.js";

const router = express.Router();

// Create new storefront profile
router.post("/storefront-profile", createStorefrontProfile);

// Get all storefront profiles
router.get("/storefront-profile", getAllStorefrontProfiles);

// Get storefront profile by ID
router.get("/storefront-profile/:id", getStorefrontProfileById);

// Update storefront profile
router.patch("/storefront-profile/:id", updateStorefrontProfile);

export default router;

