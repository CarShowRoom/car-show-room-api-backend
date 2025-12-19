import mongoose from "mongoose";

// Transfer Line Item Schema
const transferLineItemSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: [true, "Product is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Transfer quantity is required"],
      min: [0, "Transfer quantity cannot be negative"],
    },
    // Optional reference to GRN line item if source is GRN
    grnLineItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GoodsRecievedNote.lineItems",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      default: null,
    },
  },
  {
    _id: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Main Transfer Schema
const transferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: [true, "Transfer number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    sourceType: {
      type: String,
      enum: {
        values: ["GRN", "Warehouse"],
        message: "Source type must be GRN or Warehouse",
      },
      required: [true, "Source type is required"],
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Source ID is required"],
      // Dynamic reference based on sourceType
      // If sourceType is "GRN", this references GoodsRecievedNote
      // If sourceType is "Warehouse", this references WarehouseProfile
    },
    destinationWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WarehouseProfile",
      required: [true, "Destination warehouse is required"],
    },
    lineItems: {
      type: [transferLineItemSchema],
      required: [true, "Line items are required"],
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "At least one line item is required",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "in-transit", "completed", "cancelled"],
        message: "Status must be pending, in-transit, completed, or cancelled",
      },
      default: "pending",
    },
    transferDate: {
      type: Date,
      required: [true, "Transfer date is required"],
      default: Date.now,
    },
    receivedDate: {
      type: Date,
      default: null,
      // Set when status changes to "completed"
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
// Note: transferNumber already has an index from unique: true
transferSchema.index({ sourceType: 1, sourceId: 1 });
transferSchema.index({ destinationWarehouseId: 1 });
transferSchema.index({ status: 1 });
transferSchema.index({ transferDate: 1 });
transferSchema.index({ isDeleted: 1 });
transferSchema.index({ status: 1, isDeleted: 1 }); // Compound index
transferSchema.index({ sourceType: 1, sourceId: 1, status: 1 }); // Compound index for GRN/Warehouse queries

// Virtual for total transfer quantity
transferSchema.virtual("totalQuantity").get(function () {
  return this.lineItems.reduce((sum, item) => sum + item.quantity, 0);
});

// Static method to generate transfer number
transferSchema.statics.generateTransferNumber = async function () {
  const year = new Date().getFullYear();
  const prefix = `TRF-${year}-`;

  // Find the latest transfer for this year (excluding deleted)
  const latestTransfer = await this.findOne({
    transferNumber: new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
    ),
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .select("transferNumber");

  let sequence = 1;
  if (latestTransfer && latestTransfer.transferNumber) {
    // Extract sequence number from format: TRF-YYYY-NNNN
    const parts = latestTransfer.transferNumber.split("-");
    if (parts.length === 3) {
      const latestSequence = parseInt(parts[2], 10);
      if (!isNaN(latestSequence)) {
        sequence = latestSequence + 1;
      }
    }
  }

  // Format: TRF-YYYY-NNNN (e.g., TRF-2024-0001)
  return `${prefix}${sequence.toString().padStart(4, "0")}`;
};

// Instance method to update warehouse stock atomically (call when transfer is completed)
// Uses MongoDB transactions to ensure ACID properties:
// 1. Updates GRN line item's transferredQuantity
// 2. Updates warehouse stock quantity
// Both operations succeed or both fail
transferSchema.methods.updateWarehouseStock = async function (session = null) {
  if (this.status !== "completed") {
    throw new Error(
      "Transfer must be completed before updating warehouse stock"
    );
  }

  if (this.sourceType !== "GRN") {
    throw new Error(
      "updateWarehouseStock is only supported for GRN source transfers"
    );
  }

  const WarehouseStock = mongoose.model("WarehouseStock");
  const GoodsRecievedNote = mongoose.model("GoodsRecievedNote");

  // Fetch GRN to validate and update
  const grn = await GoodsRecievedNote.findById(this.sourceId).session(
    session || null
  );

  if (!grn) {
    throw new Error(`GRN with ID ${this.sourceId} not found`);
  }

  // Process each transfer line item
  for (const transferItem of this.lineItems) {
    if (transferItem.quantity <= 0) continue;

    // Find corresponding GRN line item
    let grnLineItem = null;
    let grnLineItemIndex = -1;
    if (transferItem.grnLineItemId) {
      // If grnLineItemId is provided, use it directly
      grnLineItem = grn.lineItems.id(transferItem.grnLineItemId);
      if (grnLineItem) {
        grnLineItemIndex = grn.lineItems.findIndex(
          (item) => item._id.toString() === transferItem.grnLineItemId.toString()
        );
      }
    } else {
      // Otherwise, find by inventoryId
      grnLineItemIndex = grn.lineItems.findIndex(
        (item) =>
          item.inventoryId.toString() === transferItem.inventoryId.toString()
      );
      if (grnLineItemIndex !== -1) {
        grnLineItem = grn.lineItems[grnLineItemIndex];
      }
    }

    if (!grnLineItem || grnLineItemIndex === -1) {
      throw new Error(
        `GRN line item not found for inventory ${transferItem.inventoryId}`
      );
    }

    // Validate available quantity
    const availableQty =
      grnLineItem.goodQuantity - (grnLineItem.transferredQuantity || 0);
    if (transferItem.quantity > availableQty) {
      throw new Error(
        `Transfer quantity (${transferItem.quantity}) exceeds available quantity (${availableQty}) for inventory ${transferItem.inventoryId}`
      );
    }

    // Update GRN line item's transferredQuantity atomically using $inc
    // Uses positional operator $ to update the specific line item
    const grnUpdateResult = await GoodsRecievedNote.findOneAndUpdate(
      { _id: this.sourceId, "lineItems._id": grnLineItem._id },
      {
        $inc: {
          [`lineItems.$.transferredQuantity`]: transferItem.quantity,
        },
      },
      { new: true, session }
    );

    if (!grnUpdateResult) {
      throw new Error(
        `GRN line item with ID ${grnLineItem._id} not found or GRN not found.`
      );
    }

    // Find or create warehouse stock record and update atomically using $inc
    // Uses upsert to create if doesn't exist, or update if exists
    // Note: $inc on a non-existent field treats it as 0, so no need for quantity in $setOnInsert
    await WarehouseStock.findOneAndUpdate(
      {
        inventoryId: transferItem.inventoryId,
        warehouseId: this.destinationWarehouseId,
      },
      {
        $inc: { quantity: transferItem.quantity },
        $set: { lastUpdated: new Date() },
        $setOnInsert: {
          inventoryId: transferItem.inventoryId,
          warehouseId: this.destinationWarehouseId,
          // quantity is handled by $inc - if document doesn't exist, $inc creates it with transferItem.quantity
        },
      },
      {
        upsert: true,
        session,
        new: true,
        runValidators: true,
      }
    );
  }
};

const Transfer = mongoose.model("Transfer", transferSchema);

export default Transfer;
