import express from "express";
import {
  createExpense,
  getExpenseById,
  getExpenses,
} from "../controllers/expense.controller.js";
import {
  protect,
  permissionGranted,
} from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

router.post(
  "/expense",
  protect,
  permissionGranted("owner", "cashier"),
  createExpense
);
router.get(
  "/expense",
  protect,
  permissionGranted("owner", "cashier"),
  getExpenses
);
router.get(
  "/expense/:id",
  protect,
  permissionGranted("owner", "cashier"),
  getExpenseById
);
export default router;
