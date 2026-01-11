import StorefrontInventory from "../models/storefrontInventory.model.js";
import Inventory from "../models/inventory.model.js";
import LocationProfile from "../models/locationProfile.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import mongoose from "mongoose";
import {
  createStockAuditLog,
  determineActionType,
} from "../services/stockAuditLog.service.js";

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

    // If groupByStorefront is true, use aggregation to group by storefront
    if (groupByStorefront === "true") {
      // Build aggregation pipeline
      const pipeline = [
        { $match: query },
        // Lookup storefront details
        {
          $lookup: {
            from: "locationprofiles",
            localField: "storefrontId",
            foreignField: "_id",
            as: "storefront",
          },
        },
        {
          $unwind: {
            path: "$storefront",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Lookup inventory details
        {
          $lookup: {
            from: "inventories",
            localField: "inventoryId",
            foreignField: "_id",
            as: "inventory",
          },
        },
        {
          $unwind: {
            path: "$inventory",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Group by storefront
        {
          $group: {
            _id: "$storefrontId",
            storefront: {
              $first: {
                _id: "$storefront._id",
                locationName: "$storefront.locationName",
                locationCode: "$storefront.locationCode",
              },
            },
            inventories: {
              $push: {
                _id: "$_id",
                inventory: {
                  _id: "$inventory._id",
                  productName: "$inventory.productName",
                  productCode: "$inventory.productCode",
                  SKU: "$inventory.SKU",
                  category: "$inventory.category",
                  sellingPrice: "$inventory.sellingPrice",
                  barcode: "$inventory.barcode",
                },
                quantity: "$quantity",
                isLowStock: "$isLowStock",
                lastUpdated: "$lastUpdated",
                createdAt: "$createdAt",
                updatedAt: "$updatedAt",
              },
            },
            totalInventories: { $sum: 1 },
          },
        },
        // Sort by storefront name
        {
          $sort: { "storefront.locationName": 1 },
        },
      ];

      // Execute aggregation
      const groupedData = await StorefrontInventory.aggregate(pipeline);

      res.status(200).json({
        success: true,
        message:
          "Storefront inventory grouped by storefront retrieved successfully",
        data: groupedData,
        totalStorefronts: groupedData.length,
      });
      return;
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
        "productName productCode SKU category sellingPrice barcode"
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
        "productName productCode SKU category buyingPrice sellingPrice barcode"
      )
      .populate("storefrontId", "locationName locationCode locationAddress");

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

// Update storefront inventory quantity with ACID properties
// Uses quantityChange: positive number = add, negative number = subtract
export const updateStorefrontInventoryQuantity = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;
    const { quantityChange, reason } = req.body;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(
        new CustomError(400, "Invalid storefront inventory ID format")
      );
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
      // Populate inventoryId to get product name for error messages
      const stockToUpdate = await StorefrontInventory.findById(id)
        .populate("inventoryId", "productName productCode SKU")
        .populate("storefrontId", "locationName locationCode type")
        .session(session);

      if (!stockToUpdate) {
        await session.abortTransaction();
        session.endSession();
        return next(new CustomError(404, "Storefront inventory not found"));
      }

      // Validate storefront exists and is not deleted
      if (stockToUpdate.storefrontId?.isDeleted) {
        await session.abortTransaction();
        session.endSession();
        return next(new CustomError(404, "Storefront is deleted"));
      }

      // Validate location type
      if (stockToUpdate.storefrontId?.type !== "storefront") {
        await session.abortTransaction();
        session.endSession();
        return next(new CustomError(400, "Location is not a storefront"));
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
            `Cannot update storefront inventory quantity. Current quantity: ${beforeQuantity}, requested change: ${quantityChange}. This would result in a negative quantity (${afterQuantity}).`
          )
        );
      }

      // Perform the update using findByIdAndUpdate with $inc for atomic operation
      const updatedStock = await StorefrontInventory.findByIdAndUpdate(
        id,
        {
          $inc: { quantity: quantityChange },
          $set: { lastUpdated: new Date() },
        },
        { new: true, runValidators: true, session }
      )
        .populate("inventoryId", "productName productCode SKU category barcode")
        .populate("storefrontId", "locationName locationCode");

      // Create audit log entry
      const action = determineActionType(quantityChange, false);
      await createStockAuditLog({
        inventoryId: stockToUpdate.inventoryId._id,
        adminId: adminId,
        locationId: stockToUpdate.storefrontId._id,
        locationType: "storefront",
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
        message: `Storefront inventory quantity ${actionMessage} successfully. New quantity: ${updatedStock.quantity}`,
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
          `Failed to update storefront inventory quantity: ${error.message}`
        )
      );
    }
  }
);
