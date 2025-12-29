import { Router } from "express";
import {
  getAllStockAuditLogs,
  getStockAuditLogById,
} from "../controllers/stockAuditLog.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";

const router = Router();

router.get("/stock-audit-logs", getAllStockAuditLogs);
router.get("/stock-audit-logs/:id", getStockAuditLogById);

export default router;
