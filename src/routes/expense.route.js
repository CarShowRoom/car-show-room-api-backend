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

router.post("/expense", protect, createExpense);
router.get("/expense", protect, getExpenses);
router.get("/expense/:id", protect, getExpenseById);
export default router;
