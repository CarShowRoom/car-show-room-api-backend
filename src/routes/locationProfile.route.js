import express from "express";
import {
  getAllLocationProfiles,
  getLocationProfileById,
} from "../controllers/locationProfile.controller.js";

const router = express.Router();

// Get all location profiles
router.get("/location-profile", getAllLocationProfiles);

// Get location profile by ID
router.get("/location-profile/:id", getLocationProfileById);

export default router;

