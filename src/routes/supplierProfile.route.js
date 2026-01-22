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
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

router.post(
  "/supplier-profile",
  protect,
  permissionGranted("Owner"),
  createSupplierProfile
);
router.get(
  "/supplier-profile",
  protect,
  permissionGranted("Owner"),
  getAllSupplierProfiles
);
router.get(
  "/supplier-profile/:id",
  protect,
  permissionGranted("Owner"),
  getSupplierProfileById
);
router.patch(
  "/supplier-profile/:id",
  protect,
  permissionGranted("Owner"),
  updateSupplierProfile
);
router.patch(
  "/supplier-profile/:id/soft-delete",
  protect,
  permissionGranted("Owner"),
  softDeleteSupplierProfile
);
router.patch(
  "/supplier-profile/:id/restore",
  protect,
  permissionGranted("Owner"),
  restoreSupplierProfile
);
router.delete(
  "/supplier-profile/:id",
  protect,
  permissionGranted("Owner"),
  deleteSupplierProfile
);
export default router;
