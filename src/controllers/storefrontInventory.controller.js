import StorefrontInventory from "../models/storefrontInventory.model.js";
import Inventory from "../models/inventory.model.js";
import LocationProfile from "../models/locationProfile.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import mongoose from "mongoose";

export const createStorefrontInventory = asyncErrorHandler(
  async (req, res, next) => {
    const { inventoryId, storefrontId, quantity = 0 } = req.body;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return next(new CustomError(400, "Invalid inventory ID format"));
    }

    if (!mongoose.Types.ObjectId.isValid(storefrontId)) {
      return next(new CustomError(400, "Invalid storefront ID format"));
    }

    // Validate quantity
    if (quantity < 0) {
      return next(new CustomError(400, "Quantity cannot be negative"));
    }

    // Check if inventory exists
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return next(new CustomError(404, "Inventory not found"));
    }

    // Check if storefront exists
    const storefront = await LocationProfile.findOne({
      _id: storefrontId,
      type: "storefront",
    });
    if (!storefront) {
      return next(new CustomError(404, "Storefront not found"));
    }

    // Check if storefront is deleted
    if (storefront.isDeleted) {
      return next(new CustomError(404, "Storefront is deleted"));
    }

    // Check if stock record already exists
    const existingStock = await StorefrontInventory.findOne({
      inventoryId,
      storefrontId,
    });
    if (existingStock) {
      return next(
        new CustomError(
          400,
          "Storefront inventory record already exists. Use update endpoint instead."
        )
      );
    }

    // Create new stock record
    const stock = await StorefrontInventory.create({
      inventoryId,
      storefrontId,
      quantity,
    });

    // Populate references for response
    await stock.populate("inventoryId", "productName productCode");
    await stock.populate("storefrontId", "locationName locationCode");

    res.status(201).json({
      success: true,
      message: "Storefront inventory created successfully",
      data: stock,
    });
  }
);

// Get all storefront inventory with filtering, pagination, and sorting
export const getAllStorefrontInventory = asyncErrorHandler(
  async (req, res, next) => {
    const {
      page = 1,
      limit = 10,
      storefrontId,
      inventoryId,
      isLowStock,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = {};

    if (storefrontId) {
      if (!mongoose.Types.ObjectId.isValid(storefrontId)) {
        return next(new CustomError(400, "Invalid storefront ID format"));
      }
      query.storefrontId = storefrontId;
    }

    if (inventoryId) {
      if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
        return next(new CustomError(400, "Invalid inventory ID format"));
      }
      query.inventoryId = inventoryId;
    }

    if (isLowStock !== undefined) {
      query.isLowStock = isLowStock === "true";
    }

    if (search) {
      // Search in populated fields - we'll need to search after population
      // For now, search by productCode if it matches ObjectId pattern, otherwise skip
      if (mongoose.Types.ObjectId.isValid(search)) {
        query.$or = [{ inventoryId: search }, { storefrontId: search }];
      }
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query with population
    const stock = await StorefrontInventory.find(query)
      .populate(
        "inventoryId",
        "productName productCode SKU category sellingPrice"
      )
      .populate("storefrontId", "locationName locationCode")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await StorefrontInventory.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Storefront inventory retrieved successfully",
      data: stock,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  }
);

// Get storefront inventory by ID
export const getStorefrontInventoryById = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(
        new CustomError(400, "Invalid storefront inventory ID format")
      );
    }

    const stock = await StorefrontInventory.findById(id)
      .populate(
        "inventoryId",
        "productName productCode SKU category buyingPrice sellingPrice"
      )
      .populate(
        "storefrontId",
        "locationName locationCode locationAddress"
      );

    if (!stock) {
      return next(new CustomError(404, "Storefront inventory not found"));
    }

    res.status(200).json({
      success: true,
      message: "Storefront inventory retrieved successfully",
      data: stock,
    });
  }
);
