import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import Expense from "../models/expense.model.js";
import mongoose from "mongoose";

export const createExpense = asyncErrorHandler(async (req, res, next) => {
  const { category, amount, date, notes } = req.body;

  const locationId = req.user.locationId;
  const adminId = req.user._id;
  if (!mongoose.Types.ObjectId.isValid(locationId)) {
    return next(new CustomError(400, "Invalid location ID format"));
  }
  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    return next(new CustomError(400, "Invalid admin ID format"));
  }
  const expense = await Expense.create({
    category,
    amount,
    date,
    notes,
    locationId,
    adminId,
  });
  res.status(201).json({
    success: true,
    message: "Expense created successfully.",
    data: expense,
  });
});

export const getExpenseById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid expense ID format"));
  }
  const expense = await Expense.findById(id)
    .populate({
      path: "locationId",
      select: "type locationName locationCode locationAddress",
    })
    .populate({
      path: "adminId",
      select: "name role",
    });
  if (!expense) {
    return next(new CustomError(404, "Expense not found"));
  }
  res.status(200).json({
    success: true,
    message: "Expense fetched successfully.",
    data: expense,
  });
});

export const getExpenses = asyncErrorHandler(async (req, res, next) => {
  const expenses = await Expense.find()
    .populate({
      path: "locationId",
      select: "type locationName locationCode locationAddress",
    })
    .populate({
      path: "adminId",
      select: "name role",
    });
  res.status(200).json({
    success: true,
    message: "Expenses fetched successfully.",
    data: expenses,
  });
});
