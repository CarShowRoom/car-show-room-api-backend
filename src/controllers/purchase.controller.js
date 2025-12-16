import Purchasing from "../models/purchasing.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import Inventory from "../models/inventory.model.js";

export const createPurchase = asyncErrorHandler(async (req, res, next) => {
  const { supplierId, products, note, totalAmount } = req.body;

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
  });

  res.status(201).json({
    success: true,
    message: "Purchase created successfully",
    data: purchase,
  });
});

export const getAllPurchases = asyncErrorHandler(async (req, res, next) => {
  const purchases = await Purchasing.find();

  res.status(200).json({
    success: true,
    message: "All purchases retrieved successfully",
    data: purchases,
  });
});

export const getPurchaseById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;

  const purchase = await Purchasing.findById(id);

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
