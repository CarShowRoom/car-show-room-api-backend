import mongoose from "mongoose";
import Inventory from "../models/inventory.model.js";
import WarehouseStock from "../models/warehouse.model.js";
import StorefrontInventory from "../models/storefrontInventory.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";

// Create new inventory item
export const createInventory = asyncErrorHandler(async (req, res, next) => {
  const inventoryData = req.body;

  // Check if productCode already exists
  if (inventoryData.productCode) {
    const existingProduct = await Inventory.findOne({
      productCode: inventoryData.productCode.toUpperCase(),
    });
    if (existingProduct) {
      return next(new CustomError(400, "Product code already exists"));
    }
  }

  // Check if SKU already exists
  if (inventoryData.SKU) {
    const existingSKU = await Inventory.findOne({
      SKU: inventoryData.SKU.toUpperCase(),
    });
    if (existingSKU) {
      return next(new CustomError(400, "SKU already exists"));
    }
  }

  // Check if barcode already exists (if provided)
  if (inventoryData.barcode) {
    const existingBarcode = await Inventory.findOne({
      barcode: inventoryData.barcode,
    });
    if (existingBarcode) {
      return next(new CustomError(400, "Barcode already exists"));
    }
  }

  // Check if saleCode already exists (if provided)
  if (inventoryData.saleCode) {
    const existingSaleCode = await Inventory.findOne({
      saleCode: inventoryData.saleCode.toUpperCase(),
    });
    if (existingSaleCode) {
      return next(new CustomError(400, "Sale code already exists"));
    }
  }

  const newInventory = await Inventory.create(inventoryData);

  res.status(201).json({
    success: true,
    message: "Inventory item created successfully",
    data: newInventory,
  });
});

// Get all inventory items
export const getAllInventory = asyncErrorHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    category,
    status,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build query
  const query = {};

  if (category) {
    query.category = category;
  }

  if (status) {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { productName: { $regex: search, $options: "i" } },
      { productCode: { $regex: search, $options: "i" } },
      { SKU: { $regex: search, $options: "i" } },
      { barcode: { $regex: search, $options: "i" } },
    ];
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Execute query
  const inventory = await Inventory.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await Inventory.countDocuments(query);

  res.status(200).json({
    success: true,
    message: "Inventory items retrieved successfully",
    data: inventory,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  });
});

// Get inventory item by ID
export const getInventoryById = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid inventory ID format"));
  }

  const inventory = await Inventory.findById(id);

  if (!inventory) {
    return next(new CustomError(404, "Inventory item not found"));
  }

  // Get stock availability for all warehouses
  const warehouseStocks = await WarehouseStock.find({
    inventoryId: id,
  })
    .populate(
      "warehouseId",
      "locationName locationCode locationAddress type status"
    )
    .select("warehouseId quantity lastUpdated");

  // Get stock availability for all storefronts
  const storefrontStocks = await StorefrontInventory.find({
    inventoryId: id,
  })
    .populate(
      "storefrontId",
      "locationName locationCode locationAddress type status"
    )
    .select("storefrontId quantity lastUpdated");

  // Format warehouse stock data - filter out null warehouseId (deleted locations)
  const warehouseStockAvailability = warehouseStocks
    .filter(
      (stock) => stock.warehouseId !== null && stock.warehouseId !== undefined
    )
    .map((stock) => ({
      locationId: stock.warehouseId._id,
      locationName: stock.warehouseId.locationName,
      locationCode: stock.warehouseId.locationCode,
      locationAddress: stock.warehouseId.locationAddress,
      locationType: stock.warehouseId.type,
      status: stock.warehouseId.status,
      quantity: stock.quantity,
      lastUpdated: stock.lastUpdated,
    }));

  // Format storefront stock data - filter out null storefrontId (deleted locations)
  const storefrontStockAvailability = storefrontStocks
    .filter(
      (stock) => stock.storefrontId !== null && stock.storefrontId !== undefined
    )
    .map((stock) => ({
      locationId: stock.storefrontId._id,
      locationName: stock.storefrontId.locationName,
      locationCode: stock.storefrontId.locationCode,
      locationAddress: stock.storefrontId.locationAddress,
      locationType: stock.storefrontId.type,
      status: stock.storefrontId.status,
      quantity: stock.quantity,
      lastUpdated: stock.lastUpdated,
    }));

  // Calculate total quantities - only count stocks with valid locations
  const totalWarehouseQuantity = warehouseStocks
    .filter(
      (stock) => stock.warehouseId !== null && stock.warehouseId !== undefined
    )
    .reduce((sum, stock) => sum + (stock.quantity || 0), 0);
  const totalStorefrontQuantity = storefrontStocks
    .filter(
      (stock) => stock.storefrontId !== null && stock.storefrontId !== undefined
    )
    .reduce((sum, stock) => sum + (stock.quantity || 0), 0);
  const totalQuantity = totalWarehouseQuantity + totalStorefrontQuantity;

  res.status(200).json({
    success: true,
    message: "Inventory item retrieved successfully",
    data: {
      ...inventory.toObject(),
      stockAvailability: {
        warehouses: {
          count: warehouseStockAvailability.length,
          locations: warehouseStockAvailability,
          totalQuantity: totalWarehouseQuantity,
        },
        storefronts: {
          count: storefrontStockAvailability.length,
          locations: storefrontStockAvailability,
          totalQuantity: totalStorefrontQuantity,
        },
        totalQuantity: totalQuantity,
      },
    },
  });
});

// Update inventory metadata
export const updateInventory = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new CustomError(400, "Invalid inventory ID format"));
  }

  // Check if inventory exists
  const existingInventory = await Inventory.findById(id);
  if (!existingInventory) {
    return next(new CustomError(404, "Inventory item not found"));
  }

  // Check for uniqueness conflicts if unique fields are being updated
  if (updateData.productCode) {
    const existingProduct = await Inventory.findOne({
      productCode: updateData.productCode.toUpperCase(),
      _id: { $ne: id },
    });
    if (existingProduct) {
      return next(new CustomError(400, "Product code already exists"));
    }
  }

  if (updateData.SKU) {
    const existingSKU = await Inventory.findOne({
      SKU: updateData.SKU.toUpperCase(),
      _id: { $ne: id },
    });
    if (existingSKU) {
      return next(new CustomError(400, "SKU already exists"));
    }
  }

  if (updateData.barcode) {
    const existingBarcode = await Inventory.findOne({
      barcode: updateData.barcode,
      _id: { $ne: id },
    });
    if (existingBarcode) {
      return next(new CustomError(400, "Barcode already exists"));
    }
  }

  if (updateData.saleCode) {
    const existingSaleCode = await Inventory.findOne({
      saleCode: updateData.saleCode.toUpperCase(),
      _id: { $ne: id },
    });
    if (existingSaleCode) {
      return next(new CustomError(400, "Sale code already exists"));
    }
  }

  // Validate sellingPrice >= buyingPrice
  // Merge updateData with existing data to get the final values
  const finalBuyingPrice =
    updateData.buyingPrice !== undefined
      ? updateData.buyingPrice
      : existingInventory.buyingPrice;
  const finalSellingPrice =
    updateData.sellingPrice !== undefined
      ? updateData.sellingPrice
      : existingInventory.sellingPrice;

  if (finalSellingPrice < finalBuyingPrice) {
    return next(
      new CustomError(
        400,
        `Selling price (${finalSellingPrice}) should be greater than or equal to buying price (${finalBuyingPrice})`
      )
    );
  }

  // Apply updates to the existing document and save
  // This ensures validators have access to the complete merged document
  Object.keys(updateData).forEach((key) => {
    if (updateData[key] !== undefined) {
      existingInventory[key] = updateData[key];
    }
  });

  // Save the updated inventory (this will run all validators with the complete document)
  const updatedInventory = await existingInventory.save();

  res.status(200).json({
    success: true,
    message: "Inventory item updated successfully",
    data: updatedInventory,
  });
});
