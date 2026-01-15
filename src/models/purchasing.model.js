import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    productStatus: {
      type: String,
      enum: ["pending", "seperated"],
      default: "pending",
    },
    productName: {
      type: String,
      required: true,
    },
    buyingPrice: {
      type: Number,
      required: true,
    },
    purchaseQuantity: {
      type: Number,
      required: true,
      // Original order quantity - never modified, preserved for record keeping
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: [0, "Received quantity cannot be negative"],
      // Tracks total received quantity from all GRNs
      // remainingQuantity = purchaseQuantity - receivedQuantity
    },
    productCode: {
      type: String,
      required: true,
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
    id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for remaining quantity (purchaseQuantity - receivedQuantity)
productSchema.virtual("remainingQuantity").get(function () {
  const purchaseQty = this.purchaseQuantity || 0;
  const receivedQty = this.receivedQuantity || 0;
  return Math.max(0, purchaseQty - receivedQty);
});

const PurchasingSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierProfile",
      required: true,
    },
    products: [productSchema],
    status: {
      type: String,
      enum: ["pending", "confirmed", "arrived", "cancelled", "completed"],
      default: "pending",
    },
    note: {
      type: String,
      trim: true,
      default: "No note available",
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    purchasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Purchased by is required"],
    },
  },
  {
    timestamps: true,
    id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Purchasing = mongoose.model("Purchasing", PurchasingSchema);

export default Purchasing;
