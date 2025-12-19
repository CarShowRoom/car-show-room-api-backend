import mongoose from "mongoose";
import Transfer from "../models/transfer.model.js";
import GoodsRecievedNote from "../models/goodsRecievedNote.model.js";
import WarehouseProfile from "../models/warehouseProfile.model.js";
import Inventory from "../models/inventory.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";

// Create new Transfer from GRN to Warehouse
export const createTransfer = asyncErrorHandler(async (req, res, next) => {
  // Support both camelCase and lowercase for lineItems
  const {
    grnId,
    destinationWarehouseId,
    lineItems,
    lineitems,
    transferDate,
    notes,
  } = req.body;

  // Use lineItems (camelCase) or fallback to lineitems (lowercase)
  const transferLineItems = lineItems || lineitems;

  // Validate grnId
  if (!grnId) {
    return next(new CustomError(400, "GRN ID is required"));
  }

  if (!mongoose.Types.ObjectId.isValid(grnId)) {
    return next(new CustomError(400, "Invalid GRN ID format"));
  }

  // Validate destinationWarehouseId
  if (!destinationWarehouseId) {
    return next(new CustomError(400, "Destination warehouse ID is required"));
  }

  if (!mongoose.Types.ObjectId.isValid(destinationWarehouseId)) {
    return next(
      new CustomError(400, "Invalid destination warehouse ID format")
    );
  }

  // Validate lineItems (support both camelCase and lowercase)
  if (
    !transferLineItems ||
    !Array.isArray(transferLineItems) ||
    transferLineItems.length === 0
  ) {
    return next(
      new CustomError(
        400,
        "Line items are required and must be a non-empty array"
      )
    );
  }

  // Fetch GRN with line items
  const grn = await GoodsRecievedNote.findById(grnId).lean();
  if (!grn) {
    return next(new CustomError(404, "GRN not found"));
  }

  // Check if GRN is deleted
  if (grn.isDeleted) {
    return next(
      new CustomError(400, "Cannot create transfer from deleted GRN")
    );
  }

  // Validate GRN status - only allow transfers from completed GRNs
  if (grn.status !== "partial" && grn.status !== "verified") {
    return next(
      new CustomError(
        400,
        `Cannot create transfer from GRN with status '${grn.status}'. Only GRNs with status 'completed' can have transfers created.`
      )
    );
  }

  // Check if GRN has line items
  if (!grn.lineItems || grn.lineItems.length === 0) {
    return next(new CustomError(400, "GRN has no line items"));
  }

  // Validate destination warehouse exists
  const warehouse = await WarehouseProfile.findById(destinationWarehouseId);
  if (!warehouse) {
    return next(new CustomError(404, "Destination warehouse not found"));
  }

  if (warehouse.isDeleted) {
    return next(new CustomError(400, "Cannot transfer to deleted warehouse"));
  }

  // Validate and process line items
  const validatedLineItems = [];

  for (const userItem of transferLineItems) {
    // Validate required fields
    if (!userItem.productCode) {
      return next(
        new CustomError(
          400,
          "Each line item must have productCode to match products from GRN"
        )
      );
    }

    if (userItem.quantity === undefined || userItem.quantity === null) {
      return next(
        new CustomError(400, "Transfer quantity is required for all line items")
      );
    }

    if (typeof userItem.quantity !== "number" || userItem.quantity <= 0) {
      return next(
        new CustomError(
          400,
          "Transfer quantity must be a positive number greater than 0"
        )
      );
    }

    // Lookup inventory by productCode
    const inventory = await Inventory.findOne({
      productCode: userItem.productCode.toUpperCase(),
    }).lean();

    if (!inventory) {
      return next(
        new CustomError(
          404,
          `Product with code '${userItem.productCode}' not found`
        )
      );
    }

    const inventoryIdValue = inventory._id;

    // Find corresponding GRN line item by inventoryId
    const grnLineItem = grn.lineItems.find(
      (item) => item.inventoryId.toString() === inventoryIdValue.toString()
    );

    if (!grnLineItem) {
      return next(
        new CustomError(
          400,
          `GRN does not contain product with code '${userItem.productCode}'. Please ensure the product exists in the GRN line items.`
        )
      );
    }

    // Calculate available quantity from GRN line item
    const goodQuantity = grnLineItem.goodQuantity || 0;
    const transferredQuantity = grnLineItem.transferredQuantity || 0;
    const availableQuantity = goodQuantity - transferredQuantity;

    // Validate transfer quantity doesn't exceed available quantity
    if (userItem.quantity > availableQuantity) {
      return next(
        new CustomError(
          400,
          `Transfer quantity (${userItem.quantity}) exceeds available quantity (${availableQuantity}) for product '${userItem.productCode}'. Available quantity = goodQuantity (${goodQuantity}) - transferredQuantity (${transferredQuantity})`
        )
      );
    }

    // Build validated line item
    validatedLineItems.push({
      inventoryId: inventoryIdValue,
      quantity: userItem.quantity,
      grnLineItemId: grnLineItem._id, // Link to GRN line item for tracking
      notes: userItem.notes || null,
    });
  }

  // Auto-generate transfer number
  const transferNumber = await Transfer.generateTransferNumber();

  // Create transfer document
  const newTransfer = await Transfer.create({
    transferNumber,
    sourceType: "GRN", // Currently only GRN → Warehouse transfers
    sourceId: grnId,
    destinationWarehouseId,
    lineItems: validatedLineItems,
    transferDate: transferDate || new Date(),
    notes: notes || null,
    status: "pending", // Default status
  });

  // Populate references for response
  await newTransfer.populate("sourceId", "grnNumber status");
  await newTransfer.populate(
    "destinationWarehouseId",
    "warehouseName warehouseCode"
  );
  await newTransfer.populate(
    "lineItems.inventoryId",
    "productName productCode SKU"
  );

  res.status(201).json({
    success: true,
    message: "Transfer created successfully",
    data: newTransfer,
  });
});

export const getTransfers = asyncErrorHandler(async (req, res, next) => {
  const transfers = await Transfer.find().lean();
  if (!transfers) {
    return next(new CustomError(404, "Transfers not found"));
  }
  res.status(200).json({
    success: true,
    message: "Transfers fetched successfully",
    data: transfers,
  });
});

export const getTransferById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const transfer = await Transfer.findById(id).lean();
  if (!transfer) {
    return next(new CustomError(404, "Transfer not found"));
  }
  res.status(200).json({
    success: true,
    message: "Transfer fetched successfully",
    data: transfer,
  });
});

export const updateTransferStatus = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return next(new CustomError(400, "Status is required"));
    }
    const validStatuses = ["pending", "in-transit", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return next(
        new CustomError(
          400,
          `Invalid status. Allowed values: ${validStatuses.join(", ")}`
        )
      );
    }

    // Use MongoDB transaction to ensure ACID properties when completing transfer
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const updatedTransfer = await Transfer.findByIdAndUpdate(
        id,
        { status },
        { new: true, session }
      );

      if (!updatedTransfer) {
        await session.abortTransaction();
        await session.endSession();
        return next(new CustomError(404, "Transfer not found"));
      }

      // When status is "completed", update GRN transferredQuantity and warehouse stock atomically
      if (status === "completed") {
        await updatedTransfer.updateWarehouseStock(session);
      }

      // Commit transaction
      await session.commitTransaction();
      await session.endSession();

      // Populate references for response
      await updatedTransfer.populate("sourceId", "grnNumber status");
      await updatedTransfer.populate(
        "destinationWarehouseId",
        "warehouseName warehouseCode"
      );
      await updatedTransfer.populate(
        "lineItems.inventoryId",
        "productName productCode SKU"
      );

      res.status(200).json({
        success: true,
        message: "Transfer status updated successfully",
        data: updatedTransfer,
      });
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      await session.endSession();
      return next(
        new CustomError(
          500,
          `Failed to update transfer status: ${error.message}`
        )
      );
    }
  }
);
