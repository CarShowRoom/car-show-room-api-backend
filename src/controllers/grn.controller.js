import mongoose from "mongoose";
import GoodsRecievedNote from "../models/goodsRecievedNote.model.js";
import Purchasing from "../models/purchasing.model.js";
import Inventory from "../models/inventory.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";

// Create new GRN (Fully Automatic - Auto-creates line items from PO products)
export const createGRN = asyncErrorHandler(async (req, res, next) => {
  const { purchasingId, grnDate, lineItems, notes } = req.body;

  // Validate purchasingId
  if (!purchasingId) {
    return next(new CustomError(400, "Purchase order ID is required"));
  }

  if (!mongoose.Types.ObjectId.isValid(purchasingId)) {
    return next(new CustomError(400, "Invalid purchase order ID format"));
  }

  // Fetch PO with products
  const purchaseOrder = await Purchasing.findById(purchasingId).lean(); // Use lean() to get plain JS object
  if (!purchaseOrder) {
    return next(new CustomError(404, "Purchase order not found"));
  }

  // Validate PO status - only "arrived" status allows GRN creation
  if (purchaseOrder.status !== "arrived") {
    return next(
      new CustomError(
        400,
        `Cannot create GRN for purchase order with status '${purchaseOrder.status}'. Only purchase orders with status 'arrived' can have GRN created.`
      )
    );
  }

  // Check if PO has products
  if (!purchaseOrder.products || purchaseOrder.products.length === 0) {
    return next(new CustomError(400, "Purchase order has no products"));
  }

  // Check if GRN already exists for this PO (one GRN per PO)
  const existingGRN = await GoodsRecievedNote.findOne({
    purchasingId,
    isDeleted: false,
  });
  if (existingGRN) {
    return next(
      new CustomError(
        400,
        "GRN already exists for this purchase order. One GRN per PO is allowed."
      )
    );
  }

  // Validate line items (user provides only goodQuantity and badQuantity)
  // System auto-creates line items from PO products
  // warehouseId is optional - can be set later via transfer records
  if (!lineItems || !Array.isArray(lineItems)) {
    return next(
      new CustomError(
        400,
        "Line items are required as an array. Provide goodQuantity and badQuantity for each product from the purchase order. warehouseId is optional and can be set later via transfer records."
      )
    );
  }

  if (lineItems.length === 0) {
    return next(
      new CustomError(
        400,
        "At least one line item is required. Provide goodQuantity and badQuantity for products from the purchase order."
      )
    );
  }

  // Create a map of user-provided line items by productCode for easy lookup
  const userLineItemsMap = new Map();
  lineItems.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return next(
        new CustomError(400, `Line item at index ${index} must be an object`)
      );
    }
    if (!item.productCode) {
      return next(
        new CustomError(
          400,
          `Line item at index ${index} is missing 'productCode'. Each line item must have a productCode to match products from the purchase order.`
        )
      );
    }
    userLineItemsMap.set(item.productCode.toUpperCase(), item);
  });

  // Build GRN line items automatically from PO products
  const grnLineItems = [];
  let calculatedTotalAmount = 0;

  // Auto-create line items from ALL PO products
  for (const poProduct of purchaseOrder.products) {
    // Get inventoryId from PO product, or look it up by productCode if missing
    let inventoryIdValue = poProduct.inventoryId;

    // If inventoryId is missing, try to find it by productCode
    if (
      !inventoryIdValue ||
      !mongoose.Types.ObjectId.isValid(inventoryIdValue)
    ) {
      const inventoryItem = await Inventory.findOne({
        productCode: poProduct.productCode.toUpperCase(),
      });

      if (!inventoryItem) {
        return next(
          new CustomError(
            404,
            `Inventory item with productCode '${poProduct.productCode}' not found. Please ensure the product exists in inventory.`
          )
        );
      }

      inventoryIdValue = inventoryItem._id;
    }

    // Ensure inventoryId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(inventoryIdValue)) {
      return next(
        new CustomError(
          400,
          `Invalid inventoryId format for product '${poProduct.productCode}'. Expected valid MongoDB ObjectId.`
        )
      );
    }

    // Convert to ObjectId
    inventoryIdValue = new mongoose.Types.ObjectId(inventoryIdValue);

    // Find user-provided data for this product (by productCode)
    const userItem = userLineItemsMap.get(poProduct.productCode.toUpperCase());

    // User must provide data for all products in PO
    if (!userItem) {
      return next(
        new CustomError(
          400,
          `Line item data required for product '${poProduct.productCode}' from purchase order. Please provide goodQuantity and badQuantity.`
        )
      );
    }

    // Validate quantities (user only provides goodQuantity and badQuantity)
    if (
      userItem.goodQuantity === undefined ||
      userItem.badQuantity === undefined
    ) {
      return next(
        new CustomError(
          400,
          `goodQuantity and badQuantity are required for product '${poProduct.productCode}'`
        )
      );
    }

    if (userItem.goodQuantity < 0 || userItem.badQuantity < 0) {
      return next(new CustomError(400, "Quantities cannot be negative"));
    }

    // Auto-calculate receivedQuantity = goodQuantity + badQuantity
    const receivedQuantity = userItem.goodQuantity + userItem.badQuantity;

    // Validate receivedQuantity doesn't exceed PO's purchaseQuantity
    const poPurchaseQuantity = poProduct.purchaseQuantity || 0;
    if (receivedQuantity > poPurchaseQuantity) {
      return next(
        new CustomError(
          400,
          `Received quantity (${receivedQuantity}) for product '${poProduct.productCode}' (${poProduct.productName}) exceeds purchase order quantity (${poPurchaseQuantity}). Cannot receive more than ordered.`
        )
      );
    }

    // Use unitPrice from request or fallback to PO's buyingPrice
    const unitPrice =
      userItem.unitPrice !== undefined
        ? userItem.unitPrice
        : poProduct.buyingPrice;
    if (unitPrice < 0) {
      return next(new CustomError(400, "Unit price cannot be negative"));
    }

    // Calculate totalPrice = receivedQuantity * unitPrice
    // You pay for what you receive (good + bad), not just good quantity
    const totalPrice = receivedQuantity * unitPrice;

    // Build line item with all data auto-filled from PO
    const grnLineItem = {
      inventoryId: inventoryIdValue, // Auto-filled from PO or looked up by productCode
      receivedQuantity: receivedQuantity, // Auto-calculated: goodQuantity + badQuantity
      goodQuantity: userItem.goodQuantity, // User provides
      badQuantity: userItem.badQuantity, // User provides
      unitPrice: unitPrice, // Uses PO's buyingPrice if not provided
      totalPrice: totalPrice, // Auto-calculated: receivedQuantity * unitPrice (pay for all received items)
      notes: userItem.notes || null,
    };

    grnLineItems.push(grnLineItem);
    calculatedTotalAmount += totalPrice;
  }

  // Validate total received quantities don't exceed PO's total order quantities
  const poTotalOrderQuantity = purchaseOrder.products.reduce(
    (sum, product) => sum + (product.purchaseQuantity || 0),
    0
  );
  const grnTotalReceivedQuantity = grnLineItems.reduce(
    (sum, item) => sum + item.receivedQuantity,
    0
  );

  if (grnTotalReceivedQuantity > poTotalOrderQuantity) {
    return next(
      new CustomError(
        400,
        `Total received quantity (${grnTotalReceivedQuantity}) exceeds total purchase order quantity (${poTotalOrderQuantity}). Cannot receive more than ordered.`
      )
    );
  }

  // Generate GRN number
  const grnNumber = await GoodsRecievedNote.generateGRNNumber();

  // Create GRN
  const grnData = {
    grnNumber,
    purchasingId,
    grnDate: grnDate || new Date(),
    lineItems: grnLineItems,
    notes: notes || null,
    totalAmount: calculatedTotalAmount, // Auto-calculated
    status: "pending",
  };

  const newGRN = await GoodsRecievedNote.create(grnData);

  // Populate references for response
  await newGRN.populate("purchasingId", "status totalAmount");
  await newGRN.populate(
    "lineItems.inventoryId",
    "productName productCode SKU sellingPrice"
  );

  res.status(201).json({
    success: true,
    message: "GRN created successfully",
    data: newGRN,
  });
});

// Get all GRNs
export const getAllGRN = asyncErrorHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    purchasingId,
    status,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    includeDeleted = false,
  } = req.query;

  // Build query
  const query = {};

  if (!includeDeleted || includeDeleted === "false") {
    query.isDeleted = false;
  }

  if (purchasingId) {
    if (!mongoose.Types.ObjectId.isValid(purchasingId)) {
      return next(new CustomError(400, "Invalid purchase order ID format"));
    }
    query.purchasingId = purchasingId;
  }

  if (status) {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { grnNumber: { $regex: search, $options: "i" } },
      { notes: { $regex: search, $options: "i" } },
    ];
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Execute query with population (include sellingPrice for profit calculations)
  const grns = await GoodsRecievedNote.find(query)
    .populate("purchasingId", "status totalAmount")
    .populate(
      "lineItems.inventoryId",
      "productName productCode SKU buyingPrice sellingPrice"
    )
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await GoodsRecievedNote.countDocuments(query);

  res.status(200).json({
    success: true,
    message: "GRNs retrieved successfully",
    data: grns,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  });
});

// Get GRN by ID
export const getGRNById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid GRN ID format"));
  }

  const grn = await GoodsRecievedNote.findOne({
    _id: id,
    isDeleted: false,
  })
    .populate("purchasingId", "status totalAmount products")
    .populate(
      "lineItems.inventoryId",
      "productName productCode SKU category buyingPrice sellingPrice"
    );

  if (!grn) {
    return next(new CustomError(404, "GRN not found"));
  }

  res.status(200).json({
    success: true,
    message: "GRN retrieved successfully",
    data: grn,
  });
});

export const updateGRNStatus = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const grn = await GoodsRecievedNote.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  if (!grn) {
    return next(new CustomError(404, "GRN not found"));
  }

  res.status(200).json({
    success: true,
    message: "GRN status updated successfully",
    data: grn,
  });
});
