import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import Expense from "../models/expense.model.js";
import mongoose from "mongoose";
import { createDateFilter } from "../utils/dateFilter.utils.js";

export const createExpense = asyncErrorHandler(async (req, res, next) => {
  const {
    category,
    amount,
    date,
    notes,
    locationId: bodyLocationId,
  } = req.body;

  // Use locationId from user if available, otherwise use from request body
  // This allows owners and admins (who might not have locationId) to create expenses
  const locationId = req.user.locationId || bodyLocationId;
  const adminId = req.user._id;

  // Validate that locationId is provided
  if (!locationId) {
    return next(
      new CustomError(
        400,
        "Location ID is required. Please provide locationId in the request body."
      )
    );
  }

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
  // Build query filter
  const filter = {};
  const { softDeleted } = req.query;

  // Filter by softDeleted status if provided
  // Supports: ?softDeleted=true, ?softDeleted=false, or omit to default to false
  if (softDeleted !== undefined) {
    // Convert string "true"/"false" to boolean
    if (softDeleted === "true" || softDeleted === true) {
      filter.softDeleted = true;
    } else if (softDeleted === "false" || softDeleted === false) {
      filter.softDeleted = false;
    } else {
      return next(
        new CustomError(
          400,
          "Invalid softDeleted value. Must be 'true' or 'false'."
        )
      );
    }
  } else {
    // Default: exclude soft deleted expenses if softDeleted is not specified
    filter.softDeleted = false;
  }

  // Add date range filter using dateFilter utility
  // Filter by the 'date' field (expense date) rather than createdAt
  try {
    const dateFilter = createDateFilter(req.query, "date", false);
    Object.assign(filter, dateFilter);
  } catch (error) {
    // If it's a CustomError, pass it to error handler
    if (error instanceof CustomError) {
      return next(error);
    }
    // For other errors, wrap and pass
    return next(new CustomError(400, error.message || "Invalid date filter"));
  }

  const expenses = await Expense.find(filter)
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

export const updateExpense = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const { category, amount, date, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid expense ID format"));
  }

  // Get adminId from authenticated user
  const adminId = req.user._id;
  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    return next(new CustomError(400, "Invalid admin ID format"));
  }

  const expense = await Expense.findByIdAndUpdate(
    id,
    { category, amount, date, notes, adminId },
    { new: true, runValidators: true }
  )
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
    message: "Expense updated successfully.",
    data: expense,
  });
});

export const softDeleteExpense = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid expense ID format"));
  }
  const expense = await Expense.findById(id);
  if (!expense) {
    return next(new CustomError(404, "Expense not found"));
  }
  if (expense.softDeleted) {
    return next(new CustomError(400, "Expense is already soft deleted"));
  }
  const softDeletedExpense = await Expense.findByIdAndUpdate(
    id,
    { $set: { softDeleted: true, deletedAt: new Date() } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "locationId",
      select: "type locationName locationCode locationAddress",
    })
    .populate({
      path: "adminId",
      select: "name role",
    });
  if (!softDeletedExpense) {
    return next(new CustomError(404, "Expense not found"));
  }
  res.status(200).json({
    success: true,
    message: "Expense soft deleted successfully",
    data: softDeletedExpense,
  });
});

export const restoreExpense = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid expense ID format"));
  }
  const expense = await Expense.findById(id);
  if (!expense) {
    return next(new CustomError(404, "Expense not found"));
  }
  if (!expense.softDeleted) {
    return next(new CustomError(400, "Expense is not soft deleted"));
  }
  const restoredExpense = await Expense.findByIdAndUpdate(
    id,
    { $set: { softDeleted: false, deletedAt: null } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "locationId",
      select: "type locationName locationCode locationAddress",
    })
    .populate({
      path: "adminId",
      select: "name role",
    });
  if (!restoredExpense) {
    return next(new CustomError(404, "Expense not found"));
  }
  res.status(200).json({
    success: true,
    message: "Expense restored successfully",
    data: restoredExpense,
  });
});

export const deleteExpense = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid expense ID format"));
  }
  const expense = await Expense.findByIdAndDelete(id);
  if (!expense) {
    return next(new CustomError(404, "Expense not found"));
  }
  res.status(200).json({
    success: true,
    message: "Expense deleted successfully.",
    data: expense,
  });
});
