import express from "express";
import {
  createExpense,
  getExpenseById,
  getExpenses,
  updateExpense,
} from "../controllers/expense.controller.js";
import {
  protect,
  permissionGranted,
} from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

router.post("/expense", protect, createExpense);
router.get("/expense", protect, getExpenses);
router.get("/expense/:id", protect, getExpenseById);
router.patch("/expense/:id", protect, updateExpense);
export default router;
