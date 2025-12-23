import mongoose from "mongoose";
import validator from "validator";

const storefrontProfileSchema = new mongoose.Schema(
  {
    storefrontCode: {
      type: String,
      required: [true, "Storefront code is required"],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [50, "Storefront code cannot exceed 50 characters"],
    },
    storefrontName: {
      type: String,
      required: [true, "Storefront name is required"],
      unique: true,
      trim: true,
      maxlength: [200, "Storefront name cannot exceed 200 characters"],
    },
    storefrontAddress: {
      type: String,
      required: [true, "Storefront address is required"],
      trim: true,
      maxlength: [500, "Storefront address cannot exceed 500 characters"],
    },
    storefrontPhone: {
      type: String,
      required: [true, "Storefront phone is required"],
      trim: true,
      maxlength: [20, "Storefront phone cannot exceed 20 characters"],
      // Phone validation is handled at controller level using phoneValidation.utils.js
    },
    storefrontEmail: {
      type: String,
      default: null,
      sparse: true,
      trim: true,
      lowercase: true,
      maxlength: [200, "Storefront email cannot exceed 200 characters"],
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
  { timestamps: true, id: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes for better query performance
// Note: storefrontCode and storefrontName already have indexes from unique: true
storefrontProfileSchema.index({ status: 1 });
storefrontProfileSchema.index({ isDeleted: 1 }); // For soft delete queries
storefrontProfileSchema.index({ status: 1, isDeleted: 1 }); // Compound index for active, non-deleted queries
storefrontProfileSchema.index({ storefrontCode: 1, status: 1 }); // Compound index

const StorefrontProfile = mongoose.model(
  "StorefrontProfile",
  storefrontProfileSchema
);
export default StorefrontProfile;
