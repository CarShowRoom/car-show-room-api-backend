import mongoose from "mongoose";

const creditPersonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    phone: {
      type: String,
    },
    blacklist: {
      type: Boolean,
      default: false,
    },
    blacklistReason: {
      type: String,
      default: null,
    },
    blacklistDate: {
      type: Date,
      default: null,
    },
    creditLimit: {
      type: Number,
      default: null,
      min: [0, "Credit limit cannot be negative"],
    },
  },
  {
    timestamps: true,
    id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

creditPersonSchema.index({ name: 1, phone: 1 }, { unique: true });

const CreditPerson = mongoose.model("CreditPerson", creditPersonSchema);

export default CreditPerson;
