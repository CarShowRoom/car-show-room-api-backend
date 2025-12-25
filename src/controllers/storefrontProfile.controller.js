import mongoose from "mongoose";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { validatePhoneNumber } from "../utils/phoneValidation.utils.js";
import LocationProfile from "../models/locationProfile.model.js";

// Create new storefront profile
export const createStorefrontProfile = asyncErrorHandler(
  async (req, res, next) => {
    const {
      storefrontCode,
      storefrontName,
      storefrontAddress,
      storefrontPhone,
      storefrontEmail,
      managerName,
      status,
      description,
      notes,
    } = req.body;

    // Check if storefrontCode already exists
    if (storefrontCode) {
      const existingCode = await LocationProfile.findOne({
        type: "storefront",
        locationCode: storefrontCode.toUpperCase(),
        isDeleted: false,
      });
      if (existingCode) {
        return next(new CustomError(400, "Storefront code already exists"));
      }
    }

    // Check if storefrontName already exists
    if (storefrontName) {
      const existingName = await LocationProfile.findOne({
        type: "storefront",
        locationName: storefrontName.trim(),
        isDeleted: false,
      });
      if (existingName) {
        return next(new CustomError(400, "Storefront name already exists"));
      }
    }

    // Validate phone number
    const phoneValidation = validatePhoneNumber(storefrontPhone, "MM");
    if (!phoneValidation.isValid) {
      return next(new CustomError(400, phoneValidation.error));
    }

    // Prepare storefront data
    const storefrontData = {
      type: "storefront",
      locationCode: storefrontCode?.toUpperCase().trim(),
      locationName: storefrontName?.trim(),
      locationAddress: storefrontAddress?.trim(),
      locationPhone: phoneValidation.formattedNumber,
      locationEmail: storefrontEmail?.toLowerCase().trim() || null,
      managerName: managerName?.trim() || null,
      status: status || "active",
      description: description?.trim() || undefined,
      notes: notes?.trim() || undefined,
    };

    const newStorefrontProfile = await LocationProfile.create(storefrontData);

    res.status(201).json({
      success: true,
      message: "Storefront profile created successfully",
      data: newStorefrontProfile,
    });
  }
);

// Get all storefront profiles
export const getAllStorefrontProfiles = asyncErrorHandler(
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

    // Build query - exclude soft deleted by default, filter by storefront type
    const query = { type: "storefront" };

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
    const storefronts = await LocationProfile.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await LocationProfile.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Storefront profiles retrieved successfully",
      data: storefronts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  }
);

// Get storefront profile by ID
export const getStorefrontProfileById = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new CustomError(400, "Invalid storefront profile ID format"));
    }

    const storefront = await LocationProfile.findOne({
      _id: id,
      type: "storefront",
      isDeleted: false,
    });

    if (!storefront) {
      return next(new CustomError(404, "Storefront profile not found"));
    }

    res.status(200).json({
      success: true,
      message: "Storefront profile retrieved successfully",
      data: storefront,
    });
  }
);
