import Purchasing from "../models/purchasing.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import Inventory from "../models/inventory.model.js";
import { createDateFilter } from "../utils/dateFilter.utils.js";

export const createPurchase = asyncErrorHandler(async (req, res, next) => {
  const { supplierId, products, note, totalAmount } = req.body;
  const purchasedBy = req.user._id;

  if (!supplierId || !products || products.length === 0) {
    return next(new CustomError(400, "Supplier ID and products are required"));
  }

  // Fetch product details for each product in the purchase
  const productsWithDetails = await Promise.all(
    products.map(async (item) => {
      if (!item.inventoryId || !item.purchaseQuantity) {
        throw new CustomError(
          400,
          `Product must have inventoryId and purchaseQuantity`
        );
      }

      const inventoryItem = await Inventory.findById(item.inventoryId);

      if (!inventoryItem) {
        throw new CustomError(
          404,
          `Product with ID ${item.inventoryId} not found`
        );
      }

      return {
        inventoryId: inventoryItem._id,
        productName: inventoryItem.productName,
        productCode: inventoryItem.productCode,
        buyingPrice: inventoryItem.buyingPrice,
        purchaseQuantity: item.purchaseQuantity,
      };
    })
  );

  const purchase = await Purchasing.create({
    supplierId,
    products: productsWithDetails,
    note: note || "No note available",
    totalAmount,
    status: "pending",
    purchasedBy,
  });

  res.status(201).json({
    success: true,
    message: "Purchase created successfully",
    data: purchase,
  });
});

export const getAllPurchases = asyncErrorHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build query
  const query = {};

  // Add date range filter using dateFilter utility
  // Filter by the 'createdAt' field (when the purchase was created)
  try {
    const dateFilter = createDateFilter(req.query, "createdAt", false);
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

  // Sort
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Execute query with population
  const purchases = await Purchasing.find(query)
    .populate("purchasedBy", "name role")
    .populate("supplierId", "supplierName supplierCode")
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await Purchasing.countDocuments(query);

  res.status(200).json({
    success: true,
    message: "All purchases retrieved successfully",
    data: purchases,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  });
});

export const getPurchaseById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;

  const purchase = await Purchasing.findById(id).populate(
    "purchasedBy",
    "name role"
  );

  if (!purchase) {
    return next(new CustomError(404, "Purchase not found"));
  }

  res.status(200).json({
    success: true,
    message: "Purchase retrieved successfully",
    data: purchase,
  });
});

export const updatePurchaseStatus = asyncErrorHandler(
  async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return next(new CustomError(400, "Status is required"));
    }

    const validStatuses = ["pending", "confirmed", "arrived", "cancelled"];
    if (!validStatuses.includes(status)) {
      return next(
        new CustomError(
          400,
          `Invalid status. Allowed values: ${validStatuses.join(", ")}`
        )
      );
    }

    const purchase = await Purchasing.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!purchase) {
      return next(new CustomError(404, "Purchase not found"));
    }

    res.status(200).json({
      success: true,
      message: "Purchase status updated successfully",
      data: purchase,
    });
  }
);
