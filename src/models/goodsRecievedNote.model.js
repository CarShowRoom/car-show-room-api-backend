import mongoose from "mongoose";

// GRN Line Item Schema
// Note: inventoryId is automatically filled from PO products by productCode in the controller
const grnLineItemSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: [true, "Product is required"],
      // Auto-filled from PO product based on productCode (handled in controller)
    },
    receivedQuantity: {
      type: Number,
      required: [true, "Received quantity is required"],
      min: [0, "Received quantity cannot be negative"],
    },
    goodQuantity: {
      type: Number,
      required: [true, "Good quantity is required"],
      min: [0, "Good quantity cannot be negative"],
    },
    badQuantity: {
      type: Number,
      required: [true, "Bad quantity is required"],
      min: [0, "Bad quantity cannot be negative"],
      default: 0,
    },
    unitPrice: {
      type: Number,
      required: [true, "Unit price is required"],
      min: [0, "Unit price cannot be negative"],
    },
    totalPrice: {
      type: Number,
      required: [true, "Total price is required"],
      min: [0, "Total price cannot be negative"],
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

// Virtuals for GRN line items (profit calculations)
// Note: These work when inventoryId is populated with sellingPrice
grnLineItemSchema.virtual("profitMargin").get(function () {
  // unitPrice is the buying price (cost)
  // sellingPrice comes from populated inventoryId
  if (!this.unitPrice || this.unitPrice === 0) return null;

  // Check if inventoryId is populated and has sellingPrice
  const sellingPrice = this.inventoryId?.sellingPrice;
  if (!sellingPrice || sellingPrice === 0) return null;

  return ((sellingPrice - this.unitPrice) / this.unitPrice) * 100;
});

grnLineItemSchema.virtual("profitAmount").get(function () {
  // unitPrice is the buying price (cost)
  // sellingPrice comes from populated inventoryId
  const sellingPrice = this.inventoryId?.sellingPrice;
  if (!sellingPrice) return null;

  return sellingPrice - this.unitPrice;
});

// Main GRN Schema
const goodsRecievedNoteSchema = new mongoose.Schema(
  {
    grnNumber: {
      type: String,
      required: [true, "GRN number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    purchasingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchasing",
      required: [true, "Purchase order is required"],
      unique: true, // One GRN per PO - simple one-to-one relationship
    },
    grnDate: {
      type: Date,
      required: [true, "GRN date is required"],
      default: Date.now,
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "received", "completed", "rejected"],
        message: "Status must be pending, received, completed, or rejected",
      },
      default: "pending",
    },
    lineItems: {
      type: [grnLineItemSchema],
      required: [true, "Line items are required"],
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "At least one line item is required",
      },
    },
    // receivedBy: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "User",
    //   default: null,
    // },
    // checkedBy: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "User",
    //   default: null,
    // },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
      default: "No notes available.",
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
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

// Validation is handled at controller level for better error handling
// Pre-save hooks can have issues with create() method

// Indexes for better query performance
goodsRecievedNoteSchema.index({ grnNumber: 1 });
goodsRecievedNoteSchema.index({ purchasingId: 1 });
goodsRecievedNoteSchema.index({ status: 1 });
goodsRecievedNoteSchema.index({ grnDate: 1 });
goodsRecievedNoteSchema.index({ isDeleted: 1 });
goodsRecievedNoteSchema.index({ status: 1, isDeleted: 1 }); // Compound index

// Virtual for total received quantity
goodsRecievedNoteSchema.virtual("totalReceivedQuantity").get(function () {
  return this.lineItems.reduce((sum, item) => sum + item.receivedQuantity, 0);
});

// Virtual for total good quantity
goodsRecievedNoteSchema.virtual("totalGoodQuantity").get(function () {
  return this.lineItems.reduce((sum, item) => sum + item.goodQuantity, 0);
});

// Virtual for total bad quantity
goodsRecievedNoteSchema.virtual("totalBadQuantity").get(function () {
  return this.lineItems.reduce((sum, item) => sum + item.badQuantity, 0);
});

// Static method to generate GRN number
goodsRecievedNoteSchema.statics.generateGRNNumber = async function () {
  const year = new Date().getFullYear();
  const prefix = `GRN-${year}-`;

  // Find the latest GRN for this year (excluding deleted)
  // Use regex to match GRN numbers starting with prefix
  const latestGRN = await this.findOne({
    grnNumber: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), // Escape special regex chars
    isDeleted: false, // Exclude deleted GRNs
  })
    .sort({ createdAt: -1 }) // Sort by creation date instead of grnNumber string
    .select("grnNumber");

  let sequence = 1;
  if (latestGRN && latestGRN.grnNumber) {
    // Extract sequence number from format: GRN-YYYY-NNNN
    const parts = latestGRN.grnNumber.split("-");
    if (parts.length === 3) {
      const latestSequence = parseInt(parts[2], 10);
      if (!isNaN(latestSequence)) {
        sequence = latestSequence + 1;
      }
    }
  }

  // Format: GRN-YYYY-NNNN (e.g., GRN-2024-0001)
  return `${prefix}${sequence.toString().padStart(4, "0")}`;
};

// Note: Warehouse stock updates are now handled by Transfer records
// This method is deprecated - use Transfer model to update warehouse stock
// GRN no longer has warehouseId field - all warehouse allocation is done via Transfer records

const GoodsRecievedNote = mongoose.model(
  "GoodsRecievedNote",
  goodsRecievedNoteSchema
);

export default GoodsRecievedNote;
