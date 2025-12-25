import mongoose from "mongoose";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { validatePhoneNumber } from "../utils/phoneValidation.utils.js";
import LocationProfile from "../models/locationProfile.model.js";

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
      const existingCode = await LocationProfile.findOne({
        type: "warehouse",
        locationCode: warehouseCode.toUpperCase(),
        isDeleted: false,
      });
      if (existingCode) {
        return next(new CustomError(400, "Warehouse code already exists"));
      }
    }

    // Check if warehouseName already exists
    if (warehouseName) {
      const existingName = await LocationProfile.findOne({
        type: "warehouse",
        locationName: warehouseName.trim(),
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
      type: "warehouse",
      locationCode: warehouseCode?.toUpperCase().trim(),
      locationName: warehouseName?.trim(),
      locationAddress: warehouseAddress?.trim(),
      locationPhone: phoneValidation.formattedNumber,
      locationEmail: warehouseEmail?.toLowerCase().trim() || null,
      managerName: managerName?.trim() || null,
      status: status || "active",
      description: description?.trim() || undefined,
      notes: notes?.trim() || undefined,
    };

    const newWarehouseProfile = await LocationProfile.create(warehouseData);

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

    // Build query - exclude soft deleted by default, filter by warehouse type
    const query = { type: "warehouse" };

    if (!includeDeleted || includeDeleted === "false") {
      query.isDeleted = false;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { locationName: { $regex: search, $options: "i" } },
        { locationCode: { $regex: search, $options: "i" } },
        { locationAddress: { $regex: search, $options: "i" } },
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
    const warehouses = await LocationProfile.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await LocationProfile.countDocuments(query);

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

    const warehouse = await LocationProfile.findOne({
      _id: id,
      type: "warehouse",
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
