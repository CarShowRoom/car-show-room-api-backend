import express from "express";
import {
  createStorefrontProfile,
  getAllStorefrontProfiles,
  getStorefrontProfileById,
} from "../controllers/storefrontProfile.controller.js";

const router = express.Router();

// Create new storefront profile
router.post("/storefront-profile", createStorefrontProfile);

// Get all storefront profiles
router.get("/storefront-profile", getAllStorefrontProfiles);

// Get storefront profile by ID
router.get("/storefront-profile/:id", getStorefrontProfileById);

export default router;

