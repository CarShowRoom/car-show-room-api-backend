import mongoose from "mongoose";
import Inventory from "../models/inventory.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";

// Create new inventory item
export const createInventory = asyncErrorHandler(async (req, res, next) => {
  const inventoryData = req.body;

  // Check if productCode already exists
  if (inventoryData.productCode) {
    const existingProduct = await Inventory.findOne({
      productCode: inventoryData.productCode.toUpperCase(),
    });
    if (existingProduct) {
      return next(new CustomError(400, "Product code already exists"));
    }
  }

  // Check if SKU already exists
  if (inventoryData.SKU) {
    const existingSKU = await Inventory.findOne({
      SKU: inventoryData.SKU.toUpperCase(),
    });
    if (existingSKU) {
      return next(new CustomError(400, "SKU already exists"));
    }
  }

  // Check if barcode already exists (if provided)
  if (inventoryData.barcode) {
    const existingBarcode = await Inventory.findOne({
      barcode: inventoryData.barcode,
    });
    if (existingBarcode) {
      return next(new CustomError(400, "Barcode already exists"));
    }
  }

  // Check if saleCode already exists (if provided)
  if (inventoryData.saleCode) {
    const existingSaleCode = await Inventory.findOne({
      saleCode: inventoryData.saleCode.toUpperCase(),
    });
    if (existingSaleCode) {
      return next(new CustomError(400, "Sale code already exists"));
    }
  }

  const newInventory = await Inventory.create(inventoryData);

  res.status(201).json({
    success: true,
    message: "Inventory item created successfully",
    data: newInventory,
  });
});

// Get all inventory items
export const getAllInventory = asyncErrorHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    category,
    status,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build query
  const query = {};

  if (category) {
    query.category = category;
  }

  if (status) {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { productName: { $regex: search, $options: "i" } },
      { productCode: { $regex: search, $options: "i" } },
      { SKU: { $regex: search, $options: "i" } },
      { barcode: { $regex: search, $options: "i" } },
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
  const inventory = await Inventory.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await Inventory.countDocuments(query);

  res.status(200).json({
    success: true,
    message: "Inventory items retrieved successfully",
    data: inventory,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  });
});

// Get inventory item by ID
export const getInventoryById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid inventory ID format"));
  }

  const inventory = await Inventory.findById(id);

  if (!inventory) {
    return next(new CustomError(404, "Inventory item not found"));
  }

  res.status(200).json({
    success: true,
    message: "Inventory item retrieved successfully",
    data: inventory,
  });
});
