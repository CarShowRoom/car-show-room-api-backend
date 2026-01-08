import express from "express";
import {
  createSupplierProfile,
  getAllSupplierProfiles,
  getSupplierProfileById,
  updateSupplierProfile,
  softDeleteSupplierProfile,
  restoreSupplierProfile,
  deleteSupplierProfile,
} from "../controllers/supplier.controller.js";

const router = express.Router();

router.post("/supplier-profile", createSupplierProfile);
router.get("/supplier-profile", getAllSupplierProfiles);
router.get("/supplier-profile/:id", getSupplierProfileById);
router.patch("/supplier-profile/:id", updateSupplierProfile);
router.patch("/supplier-profile/:id/soft-delete", softDeleteSupplierProfile);
router.patch("/supplier-profile/:id/restore", restoreSupplierProfile);
router.delete("/supplier-profile/:id", deleteSupplierProfile);
export default router;
