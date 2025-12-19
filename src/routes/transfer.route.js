import express from "express";
import {
  createTransfer,
  getTransfers,
  getTransferById,
  updateTransferStatus,
} from "../controllers/transfer.controller.js";

const router = express.Router();

router.post("/transfer", createTransfer);
router.get("/transfer", getTransfers);
router.get("/transfer/:id", getTransferById);
router.patch("/transfer/:id", updateTransferStatus);
export default router;
