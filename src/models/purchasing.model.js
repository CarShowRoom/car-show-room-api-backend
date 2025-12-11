import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
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
    },
    productCode: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

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
      enum: ["pending", "confirmed", "arrived", "cancelled"],
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
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

const Purchasing = mongoose.model("Purchasing", PurchasingSchema);

export default Purchasing;
