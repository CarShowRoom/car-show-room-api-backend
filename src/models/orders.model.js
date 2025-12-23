import mongoose from "mongoose";

const creditPersonSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
  },
  phone: {
    type: String,
  },
});

const orderProductsSchema = new mongoose.Schema({
  inventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Inventory",
    required: [true, "Inventory ID is required"],
  },
  quantity: {
    type: Number,
    required: [true, "Quantity is required"],
    min: [1, "Quantity must be at least 1"],
  },
  unitPrice: {
    type: Number,
    required: [true, "Unit price is required"],
    min: [0, "Unit price cannot be negative"],
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      sparse: true, // Allows null values during creation before orderNumber is assigned
      trim: true,
      uppercase: true,
    },
    storefrontId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorefrontProfile",
      required: [true, "Storefront is required"],
    },
    ordersProducts: {
      type: [orderProductsSchema],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: "Order must have at least one product",
      },
    },
    subTotal: {
      type: Number,
      default: null,
      min: [0, "Subtotal cannot be negative"],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, "Tax cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    finalAmount: {
      type: Number,
      required: [true, "Final amount is required"],
      min: [0, "Final amount cannot be negative"],
    },
    paidAmount: {
      type: Number,
      required: [true, "Paid amount is required"],
      min: [0, "Paid amount cannot be negative"],
    },
    extraChange: {
      type: Number,
      default: 0,
      min: [0, "Extra change cannot be negative"],
    },
    orderStatus: {
      type: String,
      enum: {
        values: ["pending", "completed", "cancelled"],
        message: "Order status must be pending, completed, or cancelled",
      },
      default: "pending",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    paymentType: {
      type: String,
      enum: ["credit", "paid"],
      default: "paid",
    },
    paymentMethod: {
      type: String,
      default: "cash",
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Pre-save middleware to calculate extraChange if paidAmount or finalAmount changed
orderSchema.pre("save", async function () {
  // Auto-calculate extraChange if paidAmount and finalAmount are both set
  // This ensures extraChange = paidAmount - finalAmount (when positive)
  if (
    this.paidAmount != null &&
    this.finalAmount != null &&
    (this.isModified("paidAmount") ||
      this.isModified("finalAmount") ||
      this.isNew)
  ) {
    this.extraChange = Math.max(0, this.paidAmount - this.finalAmount);
  }
});

// Static method to generate order number
orderSchema.statics.generateOrderNumber = async function () {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;

  // Find the latest order for this year (excluding deleted)
  const latestOrder = await this.findOne({
    orderNumber: new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
    ),
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .select("orderNumber");

  let sequence = 1;
  if (latestOrder && latestOrder.orderNumber) {
    // Extract sequence number from format: ORD-YYYY-NNNN
    const parts = latestOrder.orderNumber.split("-");
    if (parts.length === 3) {
      const latestSequence = parseInt(parts[2], 10);
      if (!isNaN(latestSequence)) {
        sequence = latestSequence + 1;
      }
    }
  }

  // Format: ORD-YYYY-NNNN (e.g., ORD-2024-0001)
  return `${prefix}${sequence.toString().padStart(4, "0")}`;
};

// Indexes for better query performance
orderSchema.index({ storefrontId: 1 });
orderSchema.index({ isDeleted: 1 });
orderSchema.index({ createdAt: -1 }); // For recent orders
orderSchema.index({ orderNumber: 1 }); // For order number lookups
orderSchema.index({ storefrontId: 1, isDeleted: 1 }); // Compound index for common queries
orderSchema.index({ orderStatus: 1 }); // For status filtering

const Order = mongoose.model("Order", orderSchema);

export default Order;
