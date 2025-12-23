import mongoose from "mongoose";
import validator from "validator";

const warehouseProfileSchema = new mongoose.Schema(
  {
    warehouseCode: {
      type: String,
      required: [true, "Warehouse code is required"],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [50, "Warehouse code cannot exceed 50 characters"],
    },
    warehouseName: {
      type: String,
      required: [true, "Warehouse name is required"],
      unique: true,
      trim: true,
      maxlength: [200, "Warehouse name cannot exceed 200 characters"],
    },
    warehouseAddress: {
      type: String,
      required: [true, "Warehouse address is required"],
      trim: true,
      maxlength: [500, "Warehouse address cannot exceed 500 characters"],
    },
    warehousePhone: {
      type: String,
      required: [true, "Warehouse phone is required"],
      trim: true,
      maxlength: [20, "Warehouse phone cannot exceed 20 characters"],
      // Phone validation is handled at controller level using phoneValidation.utils.js
    },
    warehouseEmail: {
      type: String,
      default: null,
      sparse: true,
      trim: true,
      lowercase: true,
      maxlength: [200, "Warehouse email cannot exceed 200 characters"],
      validate: {
        validator: function (value) {
          if (!value) return true; // Allow null/empty
          return validator.isEmail(value);
        },
        message: "Invalid email format",
      },
    },
    managerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: [200, "Manager name cannot exceed 200 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive"],
        message: "Status must be active or inactive",
      },
      default: "active",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: "No description available",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      default: "No notes available",
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
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes for better query performance
// Note: warehouseCode and warehouseName already have indexes from unique: true
warehouseProfileSchema.index({ status: 1 });
warehouseProfileSchema.index({ isDeleted: 1 }); // For soft delete queries
warehouseProfileSchema.index({ status: 1, isDeleted: 1 }); // Compound index for active, non-deleted queries
warehouseProfileSchema.index({ warehouseCode: 1, status: 1 }); // Compound index

const WarehouseProfile = mongoose.model(
  "WarehouseProfile",
  warehouseProfileSchema
);
export default WarehouseProfile;
