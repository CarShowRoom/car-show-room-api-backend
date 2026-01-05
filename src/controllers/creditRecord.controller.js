import mongoose from "mongoose";
import CreditRecord from "../models/creditRecord.model.js";
import Order from "../models/orders.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { createDateFilter } from "../utils/dateFilter.utils.js";

// Create credit record payment (for partial/full payment on credit orders)
export const createCreditPayment = asyncErrorHandler(async (req, res, next) => {
  const { orderId, paidAmount, paymentMethod = "cash", notes } = req.body;
  const addedBy = req.user._id;
  // Validate required fields
  if (!orderId) {
    return next(new CustomError(400, "Order ID is required"));
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return next(new CustomError(400, "Invalid order ID format"));
  }

  if (!paidAmount && paidAmount !== 0) {
    return next(new CustomError(400, "Paid amount is required"));
  }

  if (paidAmount <= 0) {
    return next(new CustomError(400, "Paid amount must be greater than 0"));
  }

  // Start MongoDB session for transaction
  const session = await mongoose.startSession();

  try {
    // Start transaction
    await session.withTransaction(async () => {
      // 1. Validate order exists and is not deleted
      const order = await Order.findById(orderId).session(session);

      if (!order) {
        throw new CustomError(404, "Order not found");
      }

      if (order.isDeleted) {
        throw new CustomError(400, "Cannot add payment to deleted order");
      }

      // 2. Validate order is a credit order
      if (order.paymentType !== "credit") {
        throw new CustomError(
          400,
          "Can only add payments to credit orders. This order is not a credit order."
        );
      }

      // 3. Calculate current remaining balance
      // Note: order.paidAmount should already include all previous credit payments
      // (it's updated when each credit payment is recorded)
      // So we can use it directly as the total paid so far
      const totalPaidSoFar = order.paidAmount || 0;
      const currentRemainingBalance = Math.max(
        0,
        order.finalAmount - totalPaidSoFar
      );

      // 4. Validate payment doesn't exceed remaining balance
      if (paidAmount > currentRemainingBalance) {
        throw new CustomError(
          400,
          `Payment amount (${paidAmount}) exceeds remaining balance (${currentRemainingBalance}). Maximum payment allowed: ${currentRemainingBalance}`
        );
      }

      // 5. Create credit record payment
      // Auto-populate creditPersonId from order for easier querying
      const creditRecordData = {
        orderId: new mongoose.Types.ObjectId(orderId),
        creditPersonId: order.creditPersonId || null,
        paidAmount,
        paymentDate: new Date(),
        paymentMethod: paymentMethod || "cash",
        notes: notes || null,
        addedBy,
      };

      const creditRecordArray = await CreditRecord.create([creditRecordData], {
        session,
      });
      const creditRecord = creditRecordArray[0];

      // 6. Update order's paidAmount to include this credit payment
      // This denormalizes the data for easier querying
      order.paidAmount = (order.paidAmount || 0) + paidAmount;
      await order.save({ session });

      // 7. Reload order to get updated paidAmount (or we can use the updated value directly)
      const updatedTotalPaid = order.paidAmount;
      const newRemainingBalance = Math.max(
        0,
        order.finalAmount - updatedTotalPaid
      );
      const isFullyPaid = newRemainingBalance <= 0;

      // 8. Populate creditPersonId for response (orderId will be manually constructed)
      if (creditRecord.creditPersonId) {
        await creditRecord.populate("creditPersonId", "name phone");
      }

      // 9. Construct clean creditRecord object for response
      // Manually build orderId object to avoid virtual fields from Order schema
      const creditRecordResponse = creditRecord.toObject();
      creditRecordResponse.orderId = {
        _id: order._id,
        orderNumber: order.orderNumber,
        finalAmount: order.finalAmount,
        paymentType: order.paymentType,
        paidAmount: order.paidAmount, // Include updated paidAmount
      };

      // 10. Send response
      res.status(201).json({
        success: true,
        message: "Credit payment recorded successfully",
        data: {
          creditRecord: creditRecordResponse,
          order: {
            orderNumber: order.orderNumber,
            finalAmount: order.finalAmount,
            previousRemainingBalance: currentRemainingBalance,
            previousPaidAmount: totalPaidSoFar, // Previous total paid
            paymentAmount: paidAmount,
            newPaidAmount: updatedTotalPaid, // New total paid (updated in order)
            newRemainingBalance: newRemainingBalance,
            isFullyPaid,
          },
        },
      });
    });
  } catch (error) {
    // Handle transaction errors
    if (error instanceof CustomError) {
      return next(error);
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((val) => val.message);
      return next(
        new CustomError(400, `Validation error: ${errors.join(". ")}`)
      );
    }

    // For other errors, log and return with actual error message
    console.error("Credit payment creation error:", error);
    const errorMessage =
      error?.message || String(error) || "Unknown error occurred";
    return next(
      new CustomError(500, `Credit payment creation failed: ${errorMessage}`)
    );
  } finally {
    // Always end the session
    await session.endSession();
  }
});

// Get all credit records for an order
export const getCreditRecordsByOrderId = asyncErrorHandler(
  async (req, res, next) => {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(new CustomError(400, "Invalid order ID format"));
    }

    // Validate order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return next(new CustomError(404, "Order not found"));
    }

    // Get all credit records for this order
    const creditRecords = await CreditRecord.find({
      orderId,
      isDeleted: false,
    })
      .sort({ paymentDate: -1 }) // Sort by newest payment first
      .populate("orderId", "orderNumber finalAmount paymentType");

    // Calculate total paid from credit records
    const totalCreditPayments = creditRecords.reduce(
      (sum, record) => sum + (record.paidAmount || 0),
      0
    );

    // Calculate remaining balance
    const totalPaid = (order.paidAmount || 0) + totalCreditPayments;
    const remainingBalance = Math.max(0, order.finalAmount - totalPaid);

    res.status(200).json({
      success: true,
      message: "Credit records retrieved successfully",
      data: {
        order: {
          orderNumber: order.orderNumber,
          finalAmount: order.finalAmount,
          initialPaidAmount: order.paidAmount,
          totalPaidAmount: totalPaid,
          remainingBalance: remainingBalance,
        },
        creditRecords: {
          count: creditRecords.length,
          records: creditRecords,
        },
      },
    });
  }
);

// Get all credit records (with filtering)
export const getAllCreditRecords = asyncErrorHandler(async (req, res, next) => {
  const { orderId, page = 1, limit = 10 } = req.query;

  // Build query
  const query = { isDeleted: false };

  if (orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(new CustomError(400, "Invalid order ID format"));
    }
    query.orderId = orderId;
  }

  // Add date range filter using dateFilter utility
  // Filter by the 'paymentDate' field (when the payment was made)
  try {
    const dateFilter = createDateFilter(req.query, "paymentDate", false);
    Object.assign(query, dateFilter);
  } catch (error) {
    // If it's a CustomError, pass it to error handler
    if (error instanceof CustomError) {
      return next(error);
    }
    // For other errors, wrap and pass
    return next(new CustomError(400, error.message || "Invalid date filter"));
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const creditRecords = await CreditRecord.find(query)
    .populate("orderId", "orderNumber finalAmount paymentType")
    .sort({ paymentDate: -1 })
    .skip(skip)
    .limit(limitNum);

  // Get total count
  const total = await CreditRecord.countDocuments(query);

  res.status(200).json({
    success: true,
    message: "Credit records retrieved successfully",
    data: creditRecords,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  });
});

// Get credit record by ID
export const getCreditRecordById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid credit record ID format"));
  }

  const creditRecord = await CreditRecord.findOne({
    _id: id,
    isDeleted: false,
  }).populate("orderId", "orderNumber finalAmount paymentType");

  if (!creditRecord) {
    return next(new CustomError(404, "Credit record not found"));
  }

  res.status(200).json({
    success: true,
    message: "Credit record retrieved successfully",
    data: creditRecord,
  });
});

// Get all credit records for a specific credit person
export const getCreditRecordsByCreditPersonId = asyncErrorHandler(
  async (req, res, next) => {
    const { creditPersonId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(creditPersonId)) {
      return next(new CustomError(400, "Invalid credit person ID format"));
    }

    // Validate credit person exists
    const CreditPerson = mongoose.model("CreditPerson");
    const creditPerson = await CreditPerson.findById(creditPersonId);
    if (!creditPerson) {
      return next(new CustomError(404, "Credit person not found"));
    }

    // Find all orders for this credit person (only credit orders) - for summary information
    const orders = await Order.find({
      creditPersonId: creditPersonId,
      paymentType: "credit",
      isDeleted: false,
    }).select("_id orderNumber finalAmount paidAmount");

    if (orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No credit records found for this credit person",
        data: {
          creditPerson: {
            _id: creditPerson._id,
            name: creditPerson.name,
            phone: creditPerson.phone,
          },
          orders: [],
          creditRecords: {
            count: 0,
            records: [],
          },
          summary: {
            totalCreditRecords: 0,
            totalPaidAmount: 0,
            totalOutstandingAmount: 0,
          },
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: parseInt(limit),
        },
      });
    }

    // Build query for credit records - now we can query directly by creditPersonId (much faster!)
    const query = {
      creditPersonId: creditPersonId,
      isDeleted: false,
    };

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get credit records with pagination
    const creditRecords = await CreditRecord.find(query)
      .populate({
        path: "orderId",
        select: "orderNumber finalAmount paymentType paidAmount createdAt",
      })
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await CreditRecord.countDocuments(query);

    // Calculate summary statistics
    // Get all credit records (without pagination) for summary
    const allCreditRecords = await CreditRecord.find(query);
    const totalCreditPayments = allCreditRecords.reduce(
      (sum, record) => sum + (record.paidAmount || 0),
      0
    );

    // Calculate outstanding for each order
    // Note: order.paidAmount already includes all credit payments (updated when each credit payment is recorded)
    // So we can use it directly as the total paid amount
    let totalOutstanding = 0;
    for (const order of orders) {
      const orderTotalPaid = order.paidAmount || 0;
      const orderOutstanding = order.finalAmount - orderTotalPaid;
      totalOutstanding += Math.max(0, orderOutstanding);
    }

    res.status(200).json({
      success: true,
      message: "Credit records retrieved successfully",
      data: {
        creditPerson: {
          _id: creditPerson._id,
          name: creditPerson.name,
          phone: creditPerson.phone,
        },
        orders: orders.map((order) => ({
          _id: order._id,
          orderNumber: order.orderNumber,
        })),
        creditRecords: {
          count: creditRecords.length,
          records: creditRecords,
        },
        summary: {
          totalCreditRecords: total,
          totalPaidViaCreditRecords: totalCreditPayments,
          totalOutstandingAmount: totalOutstanding,
        },
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  }
);
