import mongoose from "mongoose";

const purchaseResetSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    default: null,
  },
  inventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Inventory",
    required: [true, "Inventory ID is required"],
  },
  resetAt: {
    type: Date,
    default: Date.now,
  },
  resetBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
  },
}, { timestamps: true });

purchaseResetSchema.index({ customerId: 1, inventoryId: 1, resetAt: -1 });

const PurchaseReset = mongoose.model("PurchaseReset", purchaseResetSchema);
export default PurchaseReset;
