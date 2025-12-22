import mongoose from "mongoose";
import Order from "../models/orders.model.js";
import StorefrontInventory from "../models/storefrontInventory.model.js";
import StorefrontProfile from "../models/storefrontProfile.model.js";
import Inventory from "../models/inventory.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";

// Create new order with ACID properties and stock deduction
export const createOrder = asyncErrorHandler(async (req, res, next) => {
  const {
    storefrontId,
    ordersProducts,
    subTotal,
    tax = 0,
    discount = 0,
    finalAmount,
    paidAmount,
    paymentType = "cash",
  } = req.body;

  // Validate required fields
  if (!storefrontId) {
    return next(new CustomError(400, "Storefront ID is required"));
  }

  if (!mongoose.Types.ObjectId.isValid(storefrontId)) {
    return next(new CustomError(400, "Invalid storefront ID format"));
  }

  if (
    !ordersProducts ||
    !Array.isArray(ordersProducts) ||
    ordersProducts.length === 0
  ) {
    return next(new CustomError(400, "Order must have at least one product"));
  }

  // Validate paymentType
  const validPaymentTypes = ["cash", "bank", "card", "mobile-banking"];
  if (!validPaymentTypes.includes(paymentType)) {
    return next(
      new CustomError(
        400,
        `Invalid payment type. Allowed values: ${validPaymentTypes.join(", ")}`
      )
    );
  }

  // Validate product structure
  for (let i = 0; i < ordersProducts.length; i++) {
    const product = ordersProducts[i];

    if (!product.inventoryId) {
      return next(
        new CustomError(400, `Product at index ${i}: Inventory ID is required`)
      );
    }

    if (!mongoose.Types.ObjectId.isValid(product.inventoryId)) {
      return next(
        new CustomError(
          400,
          `Product at index ${i}: Invalid inventory ID format`
        )
      );
    }

    if (!product.quantity || product.quantity < 1) {
      return next(
        new CustomError(
          400,
          `Product at index ${i}: Quantity must be at least 1`
        )
      );
    }
  }

  // Validate numeric fields
  if (tax < 0) {
    return next(new CustomError(400, "Tax cannot be negative"));
  }

  if (discount < 0) {
    return next(new CustomError(400, "Discount cannot be negative"));
  }

  if (!paidAmount && paidAmount !== 0) {
    return next(new CustomError(400, "Paid amount is required"));
  }

  if (paidAmount < 0) {
    return next(new CustomError(400, "Paid amount cannot be negative"));
  }

  // Generate order number before transaction
  const orderNumber = await Order.generateOrderNumber();

  // Start MongoDB session for transaction
  const session = await mongoose.startSession();

  try {
    // Start transaction
    await session.withTransaction(async () => {
      // 1. Validate storefront exists and is not deleted
      const storefront = await StorefrontProfile.findById(storefrontId).session(
        session
      );

      if (!storefront) {
        throw new CustomError(404, "Storefront not found");
      }

      if (storefront.isDeleted) {
        throw new CustomError(
          400,
          "Cannot create order for deleted storefront"
        );
      }

      // 2. Validate all inventory items exist and get their selling prices
      const inventoryIds = ordersProducts.map(
        (p) => new mongoose.Types.ObjectId(p.inventoryId)
      );

      const inventoryItems = await Inventory.find({
        _id: { $in: inventoryIds },
      }).session(session);

      if (inventoryItems.length !== inventoryIds.length) {
        const foundIds = inventoryItems.map((item) => item._id.toString());
        const missingIds = inventoryIds.filter(
          (id) => !foundIds.includes(id.toString())
        );
        throw new CustomError(
          404,
          `Inventory items not found: ${missingIds.join(", ")}`
        );
      }

      // Map inventory items by ID for easy lookup
      const inventoryMap = new Map();
      inventoryItems.forEach((item) => {
        inventoryMap.set(item._id.toString(), item);
      });

      // 3. Prepare order products with unitPrice from current sellingPrice (snapshot)
      const validatedProducts = [];
      let calculatedSubTotal = 0;

      for (const product of ordersProducts) {
        const inventoryId = new mongoose.Types.ObjectId(product.inventoryId);
        const inventoryItem = inventoryMap.get(inventoryId.toString());

        if (!inventoryItem) {
          throw new CustomError(
            404,
            `Inventory item not found: ${product.inventoryId}`
          );
        }

        if (
          inventoryItem.sellingPrice === undefined ||
          inventoryItem.sellingPrice === null
        ) {
          throw new CustomError(
            400,
            `Product '${inventoryItem.productCode}' (${inventoryItem.productName}) does not have a selling price set`
          );
        }

        if (inventoryItem.sellingPrice < 0) {
          throw new CustomError(
            400,
            `Product '${inventoryItem.productCode}' (${inventoryItem.productName}) has an invalid selling price: ${inventoryItem.sellingPrice}`
          );
        }

        // Store current sellingPrice as snapshot unitPrice in order
        const unitPrice = inventoryItem.sellingPrice;
        const productSubTotal = product.quantity * unitPrice;
        calculatedSubTotal += productSubTotal;

        validatedProducts.push({
          inventoryId,
          quantity: product.quantity,
          unitPrice, // Snapshot of current selling price
        });
      }

      // Use provided subTotal or calculated one
      const finalSubTotal =
        subTotal !== undefined && subTotal !== null
          ? subTotal
          : calculatedSubTotal;

      // Calculate finalAmount if not provided
      const calculatedFinalAmount =
        finalAmount !== undefined && finalAmount !== null
          ? finalAmount
          : finalSubTotal + tax - discount;

      if (calculatedFinalAmount < 0) {
        throw new CustomError(400, "Final amount cannot be negative");
      }

      // 4. Validate stock availability and deduct stock
      for (const product of validatedProducts) {
        const stockRecord = await StorefrontInventory.findOne(
          {
            inventoryId: product.inventoryId,
            storefrontId: storefrontId,
          },
          null,
          { session }
        );

        if (!stockRecord) {
          const inventoryItem = inventoryMap.get(
            product.inventoryId.toString()
          );
          throw new CustomError(
            404,
            `Stock record not found for product '${
              inventoryItem?.productCode || product.inventoryId
            }' in storefront`
          );
        }

        // Check stock availability
        const availableQuantity = stockRecord.quantity || 0;
        if (availableQuantity < product.quantity) {
          const inventoryItem = inventoryMap.get(
            product.inventoryId.toString()
          );
          throw new CustomError(
            400,
            `Insufficient stock for product '${
              inventoryItem?.productCode || product.inventoryId
            }' (${
              inventoryItem?.productName || "Unknown"
            }). Available: ${availableQuantity}, Requested: ${product.quantity}`
          );
        }

        // Deduct stock - modify document directly and save with session
        // This follows the pattern in StorefrontInventory model's removeStock method
        stockRecord.quantity -= product.quantity;
        stockRecord.lastUpdated = new Date();
        await stockRecord.save({ session });
      }

      // 5. Create order with calculated values
      const orderData = {
        orderNumber,
        storefrontId: new mongoose.Types.ObjectId(storefrontId),
        ordersProducts: validatedProducts,
        subTotal: finalSubTotal,
        tax,
        discount,
        finalAmount: calculatedFinalAmount,
        paidAmount,
        paymentType,
        orderStatus: "completed", // Order is completed when stock is deducted
      };

      const newOrderArray = await Order.create([orderData], { session });
      const newOrder = newOrderArray[0];

      // 7. Populate references for response (inside transaction for consistency)
      await newOrder.populate("storefrontId", "storefrontName storefrontCode");
      await newOrder.populate(
        "ordersProducts.inventoryId",
        "productName productCode SKU"
      );

      // 8. Send response
      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: newOrder,
      });
    });
  } catch (error) {
    // Handle transaction errors
    // If it's a CustomError, pass it to error handler
    if (error instanceof CustomError) {
      return next(error);
    }

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      return next(
        new CustomError(400, "Order number already exists. Please try again.")
      );
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((val) => val.message);
      return next(
        new CustomError(400, `Validation error: ${errors.join(". ")}`)
      );
    }

    // For other errors, log and return with actual error message
    console.error("Order creation error:", error);
    const errorMessage =
      error?.message || String(error) || "Unknown error occurred";
    return next(new CustomError(500, `Order creation failed: ${errorMessage}`));
  } finally {
    // Always end the session
    await session.endSession();
  }
});

export const getAllOrders = asyncErrorHandler(async (req, res, next) => {
  const orders = await Order.find({ isDeleted: false })
    .populate("storefrontId", "storefrontName storefrontCode")
    .populate("ordersProducts.inventoryId", "productName productCode SKU");

  res.status(200).json({
    success: true,
    message: "Orders fetched successfully",
    data: orders,
  });
});

export const getOrders = asyncErrorHandler(async (req, res, next) => {
  const { orderId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return next(new CustomError(400, "Invalid order ID format"));
  }
  const order = await Order.findOne({ _id: orderId, isDeleted: false })
    .populate("storefrontId", "storefrontName storefrontCode")
    .populate("ordersProducts.inventoryId", "productName productCode SKU");

  if (!order) {
    return next(new CustomError(404, "Order not found"));
  }

  res.status(200).json({
    success: true,
    message: "Order fetched successfully",
    data: order,
  });
});

export const getOrdersByStorefrontId = asyncErrorHandler(
  async (req, res, next) => {
    const { storefrontId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storefrontId)) {
      return next(new CustomError(400, "Invalid storefront ID format"));
    }

    const orders = await Order.find({
      storefrontId: storefrontId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 }) // Sort by newest first
      .populate("storefrontId", "storefrontName storefrontCode")
      .populate("ordersProducts.inventoryId", "productName productCode SKU");

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: {
        count: orders.length,
        orders,
      },
    });
  }
);
