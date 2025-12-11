import express from "express";
import {
  createSupplierProfile,
  getAllSupplierProfiles,
  getSupplierProfileById,
} from "../controllers/supplier.controller.js";

const router = express.Router();

router.post("/supplier-profile", createSupplierProfile);
router.get("/supplier-profile", getAllSupplierProfiles);
router.get("/supplier-profile/:id", getSupplierProfileById);

export default router;
