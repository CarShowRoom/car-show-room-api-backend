import express from "express";
import {
  createTransfer,
  getTransfers,
  getTransferById,
  updateTransferStatus,
} from "../controllers/transfer.controller.js";

import {
  protect,
  permissionGranted,
} from "../controllers/administrationPolicy.controller.js";
const router = express.Router();

router.post(
  "/transfer",
  protect,
  permissionGranted("owner", "warehouseManager"),
  createTransfer
);
router.get("/transfer", getTransfers);
router.get("/transfer/:id", getTransferById);
router.patch("/transfer/:id", updateTransferStatus);
export default router;
