import WarehouseStock from "../models/warehouse.model.js";
import Inventory from "../models/inventory.model.js";
import LocationProfile from "../models/locationProfile.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import mongoose from "mongoose";

export const createWarehouseStock = asyncErrorHandler(
  async (req, res, next) => {
    const { inventoryId, warehouseId, quantity = 0 } = req.body;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return next(new CustomError(400, "Invalid inventory ID format"));
    }

    if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
      return next(new CustomError(400, "Invalid warehouse ID format"));
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

    // Check if warehouse exists
    const warehouse = await LocationProfile.findOne({
      _id: warehouseId,
      type: "warehouse",
    });
    if (!warehouse) {
      return next(new CustomError(404, "Warehouse not found"));
    }

    // Check if stock record already exists
    const existingStock = await WarehouseStock.findOne({
      inventoryId,
      warehouseId,
    });
    if (existingStock) {
      return next(
        new CustomError(
          400,
          "Warehouse stock record already exists. Use update endpoint instead."
        )
      );
    }

    // Create new stock record
    const stock = await WarehouseStock.create({
      inventoryId,
      warehouseId,
      quantity,
    });

    // Populate references for response
    await stock.populate("inventoryId", "productName productCode");
    await stock.populate("warehouseId", "locationName locationCode");

    res.status(201).json({
      success: true,
      message: "Warehouse stock created successfully",
      data: stock,
    });
  }
);

export const getAllWarehouseStock = asyncErrorHandler(
  async (req, res, next) => {
    const {
      page = 1,
      limit = 10,
      warehouseId,
      inventoryId,
      isLowStock,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = {};

    if (warehouseId) {
      if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
        return next(new CustomError(400, "Invalid warehouse ID format"));
      }
      query.warehouseId = warehouseId;
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

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query with population
    const stock = await WarehouseStock.find(query)
      .populate("inventoryId", "productName productCode SKU category")
      .populate("warehouseId", "locationName locationCode")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await WarehouseStock.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Warehouse stock retrieved successfully",
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

export const getWarehouseStockById = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new CustomError(400, "Invalid warehouse stock ID format"));
    }

    const stock = await WarehouseStock.findById(id)
      .populate(
        "inventoryId",
        "productName productCode SKU category buyingPrice sellingPrice"
      )
      .populate("warehouseId", "locationName locationCode locationAddress");

    if (!stock) {
      return next(new CustomError(404, "Warehouse stock not found"));
    }

    res.status(200).json({
      success: true,
      message: "Warehouse stock retrieved successfully",
      data: stock,
    });
  }
);

// Update warehouse stock quantity with ACID properties
// Uses quantityChange: positive number = add, negative number = subtract
export const updateWarehouseStockQuantity = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;
    const { quantityChange } = req.body;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new CustomError(400, "Invalid warehouse stock ID format"));
    }

    // Validate quantityChange
    if (
      typeof quantityChange !== "number" ||
      quantityChange === 0 ||
      !Number.isFinite(quantityChange)
    ) {
      return next(
        new CustomError(
          400,
          "A valid non-zero numeric 'quantityChange' is required. Use positive number to add, negative number to subtract."
        )
      );
    }

    // Find the stock before the update to get the current quantity
    const stockToUpdate = await WarehouseStock.findById(id);

    if (!stockToUpdate) {
      return next(new CustomError(404, "Warehouse stock not found"));
    }

    const beforeUpdateQuantity = stockToUpdate.quantity;
    const newQuantity = beforeUpdateQuantity + quantityChange;

    // Validate that the new quantity won't be negative
    if (newQuantity < 0) {
      return next(
        new CustomError(
          400,
          `Cannot update stock quantity. Current quantity: ${beforeUpdateQuantity}, requested change: ${quantityChange}. This would result in a negative quantity (${newQuantity}).`
        )
      );
    }

    // Perform the update using findOneAndUpdate with $inc for atomic operation
    const updatedStock = await WarehouseStock.findByIdAndUpdate(
      id,
      {
        $inc: { quantity: quantityChange },
        $set: { lastUpdated: new Date() },
      },
      { new: true, runValidators: true }
    )
      .populate("inventoryId", "productName productCode SKU category")
      .populate("warehouseId", "locationName locationCode");

    // Determine action type for response message
    const actionType = quantityChange > 0 ? "add" : "remove";
    const actionMessage =
      quantityChange > 0
        ? `increased by ${Math.abs(quantityChange)}`
        : `decreased by ${Math.abs(quantityChange)}`;

    res.status(200).json({
      success: true,
      message: `Warehouse stock quantity ${actionMessage} successfully. New quantity: ${updatedStock.quantity}`,
      data: updatedStock,
      operation: {
        type: actionType,
        previousQuantity: beforeUpdateQuantity,
        newQuantity: updatedStock.quantity,
        quantityChange: quantityChange,
      },
    });
  }
);
