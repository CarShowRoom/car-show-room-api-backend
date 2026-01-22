import express from "express";
import {
  createTransfer,
  getTransfers,
  getTransferById,
  updateTransferStatus,
} from "../controllers/transfer.controller.js";

import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

router.post("/transfer", protect, permissionGranted("Owner"), createTransfer);
router.get("/transfer", protect, permissionGranted("Owner"), getTransfers);
router.get(
  "/transfer/:id",
  protect,
  permissionGranted("Owner"),
  getTransferById
);
router.patch(
  "/transfer/:id",
  protect,
  permissionGranted("Owner"),
  updateTransferStatus
);
export default router;
