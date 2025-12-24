import mongoose from "mongoose";

const creditRecordSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order ID is required"],
    },
    creditPersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CreditPerson",
      default: null,
    },
    paidAmount: {
      type: Number,
      required: [true, "Paid amount is required"],
      min: [0, "Paid amount cannot be negative"],
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      required: [true, "Payment date is required"],
    },
    paymentMethod: {
      type: String,
      default: "cash",
    },
    notes: {
      type: String,
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
creditRecordSchema.index({ orderId: 1 });
creditRecordSchema.index({ creditPersonId: 1 }); // For querying by credit person
creditRecordSchema.index({ orderId: 1, isDeleted: 1 }); // Compound index for active records
creditRecordSchema.index({ creditPersonId: 1, isDeleted: 1 }); // Compound index for credit person queries
creditRecordSchema.index({ paymentDate: -1 }); // For sorting by payment date

const CreditRecord = mongoose.model("CreditRecord", creditRecordSchema);

export default CreditRecord;
