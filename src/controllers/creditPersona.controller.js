import CreditPerson from "../models/creditPersona.model.js";
import Order from "../models/orders.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import mongoose from "mongoose";

export const createCreditPerson = asyncErrorHandler(async (req, res, next) => {
  const { name, phone, creditLimit } = req.body;

  if (!name || !phone) {
    return next(new CustomError(400, "Name and phone are required"));
  }

  const existing = await CreditPerson.findOne({ name, phone });
  if (existing) {
    return next(new CustomError(400,
      `Credit person "${name}" with phone "${phone}" already exists.`
    ));
  }

  const creditPerson = await CreditPerson.create({ name, phone, creditLimit });
  res.status(201).json({
    success: true,
    message: "Credit person created successfully",
    data: creditPerson,
  });
});

export const getAllCreditPersons = asyncErrorHandler(async (req, res, next) => {
  const creditPersons = await CreditPerson.find();
  res.status(200).json({
    success: true,
    message: "Credit persons fetched successfully",
    data: creditPersons,
  });
});

export const getCreditPersonById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const creditPerson = await CreditPerson.findById(id);
  if (!creditPerson) {
    return next(new CustomError(404, "Credit person not found"));
  }

  const [result] = await Order.aggregate([
    { $match: {
      creditPersonId: creditPerson._id,
      paymentType: "credit",
      isDeleted: false,
      orderStatus: { $ne: "cancelled" },
    }},
    { $group: {
      _id: null,
      totalOutstanding: { $sum: { $subtract: ["$finalAmount", "$paidAmount"] } },
    }},
  ]);

  const outstanding = result ? result.totalOutstanding : 0;
  const data = creditPerson.toObject();
  data.remainingLimit = data.creditLimit != null
    ? Math.max(0, data.creditLimit - outstanding)
    : null;

  res.status(200).json({
    success: true,
    message: "Credit person fetched successfully",
    data,
  });
});

export const updateCreditPerson = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const { name, phone, creditLimit } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid credit person ID format"));
  }

  const updateFields = {};
  if (name !== undefined) updateFields.name = name;
  if (phone !== undefined) updateFields.phone = phone;
  if (creditLimit !== undefined) updateFields.creditLimit = creditLimit;

  const creditPerson = await CreditPerson.findByIdAndUpdate(
    id,
    updateFields,
    { new: true }
  );
  if (!creditPerson) {
    return next(new CustomError(404, "Credit person not found"));
  }
  res.status(200).json({
    success: true,
    message: "Credit person updated successfully",
    data: creditPerson,
  });
});
