import { Router } from "express";
import {
  getAllStockAuditLogs,
  getStockAuditLogById,
} from "../controllers/stockAuditLog.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

const router = Router();

router.get(
  "/stock-audit-logs",
  protect,
  permissionGranted("Owner"),
  getAllStockAuditLogs
);
router.get(
  "/stock-audit-logs/:id",
  protect,
  permissionGranted("Owner"),
  getStockAuditLogById
);

export default router;
