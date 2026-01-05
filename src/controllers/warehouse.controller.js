import WarehouseStock from "../models/warehouse.model.js";
import Inventory from "../models/inventory.model.js";
import LocationProfile from "../models/locationProfile.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import mongoose from "mongoose";
import {
  createStockAuditLog,
  determineActionType,
} from "../services/stockAuditLog.service.js";

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
      .populate(
        "inventoryId",
        "productName productCode SKU category buyingPrice sellingPrice"
      )
      .populate("warehouseId", "locationName locationCode locationAddress")
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
    const { quantityChange, reason } = req.body;

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

    // Get admin ID from authenticated user
    const adminId = req.user?._id;
    if (!adminId) {
      return next(
        new CustomError(401, "Authentication required. Admin ID not found.")
      );
    }

    // Start MongoDB session for transaction (ACID properties)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the stock before the update to get the current quantity
      // Populate inventoryId and warehouseId for validation and error messages
      const stockToUpdate = await WarehouseStock.findById(id)
        .populate("inventoryId", "productName productCode SKU")
        .populate("warehouseId", "locationName locationCode type isDeleted")
        .session(session);

      if (!stockToUpdate) {
        await session.abortTransaction();
        session.endSession();
        return next(new CustomError(404, "Warehouse stock not found"));
      }

      // Validate warehouse exists and is not deleted
      if (stockToUpdate.warehouseId?.isDeleted) {
        await session.abortTransaction();
        session.endSession();
        return next(new CustomError(404, "Warehouse is deleted"));
      }

      // Validate location type
      if (stockToUpdate.warehouseId?.type !== "warehouse") {
        await session.abortTransaction();
        session.endSession();
        return next(new CustomError(400, "Location is not a warehouse"));
      }

      const beforeQuantity = stockToUpdate.quantity || 0;
      const afterQuantity = beforeQuantity + quantityChange;

      // Validate that the new quantity won't be negative
      if (afterQuantity < 0) {
        await session.abortTransaction();
        session.endSession();
        return next(
          new CustomError(
            400,
            `Cannot update stock quantity. Current quantity: ${beforeQuantity}, requested change: ${quantityChange}. This would result in a negative quantity (${afterQuantity}).`
          )
        );
      }

      // Perform the update using findByIdAndUpdate with $inc for atomic operation
      const updatedStock = await WarehouseStock.findByIdAndUpdate(
        id,
        {
          $inc: { quantity: quantityChange },
          $set: { lastUpdated: new Date() },
        },
        { new: true, runValidators: true, session }
      )
        .populate("inventoryId", "productName productCode SKU category")
        .populate("warehouseId", "locationName locationCode");

      // Create audit log entry
      const action = determineActionType(quantityChange, false);
      await createStockAuditLog({
        inventoryId: stockToUpdate.inventoryId._id,
        adminId: adminId,
        locationId: stockToUpdate.warehouseId._id,
        locationType: "warehouse",
        stockRecordId: id,
        beforeQuantity: beforeQuantity,
        afterQuantity: afterQuantity,
        quantityChange: quantityChange,
        action: action,
        reason: reason || null,
        relatedTransactionId: null,
        relatedTransactionType: null,
        session: session,
      });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

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
          previousQuantity: beforeQuantity,
          newQuantity: updatedStock.quantity,
          quantityChange: quantityChange,
        },
      });
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();

      // If it's already a CustomError, pass it through
      if (error instanceof CustomError) {
        return next(error);
      }

      // Otherwise, create a new error
      return next(
        new CustomError(
          500,
          `Failed to update warehouse stock quantity: ${error.message}`
        )
      );
    }
  }
);
