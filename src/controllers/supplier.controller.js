import SupplierProfile from "../models/supplierProfile.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";

export const createSupplierProfile = asyncErrorHandler(
  async (req, res, next) => {
    const { supplierName, contactNumber } = req.body;

    if (!supplierName || !contactNumber) {
      return next(new CustomError(400, "All fields are required"));
    }

    const supplier = await SupplierProfile.create({
      supplierName,
      contactNumber,
    });

    res.status(201).json({
      success: true,
      message: "Supplier profile created successfully",
      data: supplier,
    });
  }
);

export const getAllSupplierProfiles = asyncErrorHandler(
  async (req, res, next) => {
    const suppliers = await SupplierProfile.find();
    res.status(200).json({
      success: true,
      message: "All supplier profiles retrieved successfully",
      data: suppliers,
    });
  }
);

export const getSupplierProfileById = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;
    const supplier = await SupplierProfile.findById(id);
    if (!supplier) {
      return next(new CustomError(404, "Supplier profile not found"));
    }
    res.status(200).json({
      success: true,
      message: "Supplier profile retrieved successfully",
      data: supplier,
    });
  }
);
