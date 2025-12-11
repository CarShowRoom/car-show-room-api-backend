import mongoose from "mongoose";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { validatePhoneNumber } from "../utils/phoneValidation.utils.js";
import WarehouseProfile from "../models/warehouseProfile.model.js";

// Create new warehouse profile
export const createWarehouseProfile = asyncErrorHandler(
  async (req, res, next) => {
    const {
      warehouseCode,
      warehouseName,
      warehouseAddress,
      warehousePhone,
      warehouseEmail,
      managerName,
      status,
      description,
      notes,
    } = req.body;

    // Check if warehouseCode already exists
    if (warehouseCode) {
      const existingCode = await WarehouseProfile.findOne({
        warehouseCode: warehouseCode.toUpperCase(),
        isDeleted: false,
      });
      if (existingCode) {
        return next(new CustomError(400, "Warehouse code already exists"));
      }
    }

    // Check if warehouseName already exists
    if (warehouseName) {
      const existingName = await WarehouseProfile.findOne({
        warehouseName: warehouseName.trim(),
        isDeleted: false,
      });
      if (existingName) {
        return next(new CustomError(400, "Warehouse name already exists"));
      }
    }

    // Validate phone number
    const phoneValidation = validatePhoneNumber(warehousePhone, "MM");
    if (!phoneValidation.isValid) {
      return next(new CustomError(400, phoneValidation.error));
    }

    // Prepare warehouse data
    const warehouseData = {
      warehouseCode: warehouseCode?.toUpperCase().trim(),
      warehouseName: warehouseName?.trim(),
      warehouseAddress: warehouseAddress?.trim(),
      warehousePhone: phoneValidation.formattedNumber,
      warehouseEmail: warehouseEmail?.toLowerCase().trim() || null,
      managerName: managerName?.trim() || null,
      status: status || "active",
      description: description?.trim() || undefined,
      notes: notes?.trim() || undefined,
    };

    const newWarehouseProfile = await WarehouseProfile.create(warehouseData);

    res.status(201).json({
      success: true,
      message: "Warehouse profile created successfully",
      data: newWarehouseProfile,
    });
  }
);

// Get all warehouse profiles
export const getAllWarehouseProfiles = asyncErrorHandler(
  async (req, res, next) => {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      includeDeleted = false,
    } = req.query;

    // Build query - exclude soft deleted by default
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.isDeleted = false;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { warehouseName: { $regex: search, $options: "i" } },
        { warehouseCode: { $regex: search, $options: "i" } },
        { warehouseAddress: { $regex: search, $options: "i" } },
        { managerName: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query
    const warehouses = await WarehouseProfile.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await WarehouseProfile.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Warehouse profiles retrieved successfully",
      data: warehouses,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  }
);

// Get warehouse profile by ID
export const getWarehouseProfileById = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new CustomError(400, "Invalid warehouse profile ID format"));
    }

    const warehouse = await WarehouseProfile.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!warehouse) {
      return next(new CustomError(404, "Warehouse profile not found"));
    }

    res.status(200).json({
      success: true,
      message: "Warehouse profile retrieved successfully",
      data: warehouse,
    });
  }
);
