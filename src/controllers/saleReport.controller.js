// Get sale report for a specific storefront
import mongoose from "mongoose";
import CustomError from "../utils/customError.js";
import LocationProfile from "../models/locationProfile.model.js";
import Order from "../models/orders.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import { createDateFilter } from "../utils/dateFilter.utils.js";

export const getSaleReportByStorefrontId = asyncErrorHandler(
  async (req, res, next) => {
    const { storefrontId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate storefrontId
    if (!mongoose.Types.ObjectId.isValid(storefrontId)) {
      return next(new CustomError(400, "Invalid storefront ID format"));
    }

    // Validate storefront exists
    const storefront = await LocationProfile.findOne({
      _id: storefrontId,
      type: "storefront",
      isDeleted: false,
    });

    if (!storefront) {
      return next(new CustomError(404, "Storefront not found"));
    }

    // Build query filter
    const filter = {
      storefrontId: new mongoose.Types.ObjectId(storefrontId),
      isDeleted: false,
      orderStatus: "completed", // Only include completed orders
    };

    // Add date range filter using dateFilter utility
    let parsedStartDate = null;
    let parsedEndDate = null;
    try {
      const dateFilter = createDateFilter(req.query, "createdAt", false);
      Object.assign(filter, dateFilter);

      // Extract parsed dates from the filter for response
      if (dateFilter.createdAt) {
        if (dateFilter.createdAt.$gte) {
          parsedStartDate = dateFilter.createdAt.$gte;
        }
        if (dateFilter.createdAt.$lte) {
          parsedEndDate = dateFilter.createdAt.$lte;
        }
      }
    } catch (error) {
      // If it's a CustomError, pass it to error handler
      if (error instanceof CustomError) {
        return next(error);
      }
      // For other errors, wrap and pass
      return next(new CustomError(400, error.message || "Invalid date filter"));
    }

    // Aggregate sale data
    const saleReport = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalFinalAmount: { $sum: "$finalAmount" },
          totalPaidAmount: { $sum: "$paidAmount" },
          totalSubTotal: { $sum: "$subTotal" },
          totalTax: { $sum: "$tax" },
          totalDiscount: { $sum: "$discount" },
          totalExtraChange: { $sum: "$extraChange" },
          orderCount: { $sum: 1 },
          creditOrderCount: {
            $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, 1, 0] },
          },
          paidOrderCount: {
            $sum: { $cond: [{ $eq: ["$paymentType", "paid"] }, 1, 0] },
          },
        },
      },
    ]);

    // If no orders found, return zero values
    const report = saleReport[0] || {
      totalFinalAmount: 0,
      totalPaidAmount: 0,
      totalSubTotal: 0,
      totalTax: 0,
      totalDiscount: 0,
      totalExtraChange: 0,
      orderCount: 0,
      creditOrderCount: 0,
      paidOrderCount: 0,
    };

    // Get date range info - use parsed dates from filter if available, otherwise use query params
    const dateRange = {
      startDate: parsedStartDate || (startDate ? new Date(startDate) : null),
      endDate: parsedEndDate || (endDate ? new Date(endDate) : null),
    };

    res.status(200).json({
      success: true,
      message: "Sale report fetched successfully",
      data: {
        storefront: {
          _id: storefront._id,
          locationName: storefront.locationName,
          locationCode: storefront.locationCode,
        },
        dateRange,
        report: {
          finalAmount: report.totalFinalAmount, // Main metric as requested
          paidAmount: report.totalPaidAmount,
          subTotal: report.totalSubTotal,
          tax: report.totalTax,
          discount: report.totalDiscount,
          extraChange: report.totalExtraChange,
          orderCount: report.orderCount,
          creditOrderCount: report.creditOrderCount,
          paidOrderCount: report.paidOrderCount,
        },
      },
    });
  }
);
