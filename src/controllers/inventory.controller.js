import mongoose from "mongoose";
import Inventory from "../models/inventory.model.js";
import WarehouseStock from "../models/warehouse.model.js";
import StorefrontInventory from "../models/storefrontInventory.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { logActivity } from "../services/activityLog.service.js";
import XLSX from "xlsx";
import multer from "multer";
import {
  uploadToR2,
  deleteFromR2,
  generateR2Key,
} from "../configs/cloudflareR2.config.js";

// Create new inventory item (multipart: fields + images)
export const createInventory = asyncErrorHandler(async (req, res, next) => {
  const inventoryData = { ...req.body };

  // Convert comma-separated tags string to array (from FormData)
  if (typeof inventoryData.tags === "string") {
    inventoryData.tags = inventoryData.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Parse wholesalePrices JSON string from FormData
  if (typeof inventoryData.wholesalePrices === "string") {
    try {
      inventoryData.wholesalePrices = JSON.parse(inventoryData.wholesalePrices);
    } catch {
      return next(new CustomError(400, "Invalid wholesalePrices format. Must be a valid JSON array."));
    }
  }

  // Parse uomConversions JSON string from FormData
  if (typeof inventoryData.uomConversions === "string") {
    try {
      inventoryData.uomConversions = JSON.parse(inventoryData.uomConversions);
    } catch {
      return next(new CustomError(400, "Invalid uomConversions format. Must be a valid JSON array."));
    }
  }

  // Parse ecommerce purchase limit fields from FormData
  if (inventoryData.ecommerceMaxPerUser !== undefined && inventoryData.ecommerceMaxPerUser !== "") {
    inventoryData.ecommerceMaxPerUser = Number(inventoryData.ecommerceMaxPerUser);
    if (isNaN(inventoryData.ecommerceMaxPerUser) || inventoryData.ecommerceMaxPerUser < 1) {
      return next(new CustomError(400, "ecommerceMaxPerUser must be a positive number"));
    }
  }

  // Remove empty string fields from FormData (no file selected, empty text field, etc.)
  Object.keys(inventoryData).forEach((key) => {
    if (inventoryData[key] === "") delete inventoryData[key];
  });

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

  // Upload images to R2 FIRST (before saving to DB)
  // If upload fails, product won't be saved — prevents partial data
  let uploadedImages = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const key = generateR2Key(file.originalname, "inventory");
      const url = await uploadToR2(file, key);
      uploadedImages.push({
        url,
        key,
        isPrimary: uploadedImages.length === 0,
      });
    }
  }

  inventoryData.images = uploadedImages;
  const newInventory = await Inventory.create(inventoryData);

  logActivity({
    admin: req.user?._id,
    action: "create",
    feature: "inventory",
    description: `Created inventory item ${newInventory.productCode} - ${newInventory.productName}`,
    targetId: newInventory._id,
    targetModel: "Inventory",
    metadata: { productCode: newInventory.productCode, sellingPrice: newInventory.sellingPrice },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: "Inventory item created successfully",
    data: newInventory,
  });
});

// Get all inventory items
export const getAllInventory = asyncErrorHandler(async (req, res, next) => {
  const {
    page,
    limit,
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
    ];
  }

  // Sort
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Build query chain
  let queryChain = Inventory.find(query).sort(sort);

  // Apply pagination only if page or limit is provided
  const usePagination = page !== undefined || limit !== undefined;
  let paginationInfo = null;

  if (usePagination) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    queryChain = queryChain.skip(skip).limit(limitNum);

    // Get total count for pagination
    const total = await Inventory.countDocuments(query);

    paginationInfo = {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    };
  }

  // Execute query
  const inventory = await queryChain;

  const response = {
    success: true,
    message: "Inventory items retrieved successfully",
    data: inventory,
  };

  // Only include pagination info if pagination was applied
  if (paginationInfo) {
    response.pagination = paginationInfo;
  }

  res.status(200).json(response);
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
      "locationName locationCode locationAddress type status",
    )
    .select("warehouseId quantity lastUpdated");

  // Get stock availability for all storefronts
  const storefrontStocks = await StorefrontInventory.find({
    inventoryId: id,
  })
    .populate(
      "storefrontId",
      "locationName locationCode locationAddress type status",
    )
    .select("storefrontId quantity lastUpdated");

  // Format warehouse stock data - filter out null warehouseId (deleted locations)
  const warehouseStockAvailability = warehouseStocks
    .filter(
      (stock) => stock.warehouseId !== null && stock.warehouseId !== undefined,
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
      (stock) =>
        stock.storefrontId !== null && stock.storefrontId !== undefined,
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
      (stock) => stock.warehouseId !== null && stock.warehouseId !== undefined,
    )
    .reduce((sum, stock) => sum + (stock.quantity || 0), 0);
  const totalStorefrontQuantity = storefrontStocks
    .filter(
      (stock) =>
        stock.storefrontId !== null && stock.storefrontId !== undefined,
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
  // productCode is required and unique, so always check if provided
  if (updateData.productCode !== undefined) {
    const trimmedProductCode = String(updateData.productCode).trim();
    if (!trimmedProductCode) {
      return next(new CustomError(400, "Product code cannot be empty"));
    }
    const existingProduct = await Inventory.findOne({
      productCode: trimmedProductCode.toUpperCase(),
      _id: { $ne: id },
    });
    if (existingProduct) {
      return next(new CustomError(400, "Product code already exists"));
    }
  }

  // SKU is optional but unique when provided (sparse unique)
  if (updateData.SKU !== undefined) {
    const trimmedSKU = String(updateData.SKU).trim();
    // Allow empty string/null for sparse unique fields
    if (trimmedSKU) {
      const existingSKU = await Inventory.findOne({
        SKU: trimmedSKU.toUpperCase(),
        _id: { $ne: id },
      });
      if (existingSKU) {
        return next(new CustomError(400, "SKU already exists"));
      }
    }
  }

  // barcode is optional but unique when provided (sparse unique)
  if (updateData.barcode !== undefined) {
    const trimmedBarcode = String(updateData.barcode).trim();
    // Allow empty string/null for sparse unique fields
    if (trimmedBarcode) {
      const existingBarcode = await Inventory.findOne({
        barcode: trimmedBarcode,
        _id: { $ne: id },
      });
      if (existingBarcode) {
        return next(new CustomError(400, "Barcode already exists"));
      }
    }
  }

  // saleCode is optional but unique when provided (sparse unique)
  if (updateData.saleCode !== undefined) {
    const trimmedSaleCode = String(updateData.saleCode).trim();
    // Allow empty string/null for sparse unique fields
    if (trimmedSaleCode) {
      const existingSaleCode = await Inventory.findOne({
        saleCode: trimmedSaleCode.toUpperCase(),
        _id: { $ne: id },
      });
      if (existingSaleCode) {
        return next(new CustomError(400, "Sale code already exists"));
      }
    }
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

  logActivity({
    admin: req.user?._id,
    action: "update",
    feature: "inventory",
    description: `Updated inventory item ${updatedInventory.productCode} - ${updatedInventory.productName}`,
    targetId: updatedInventory._id,
    targetModel: "Inventory",
    ip: req.ip,
  });

  res.status(200).json({
    success: true,
    message: "Inventory item updated successfully",
    data: updatedInventory,
  });
});

// Bulk import inventory from Excel file
// Supports two formats:
// 1. Single-row per product (legacy): uses uom_1_unit, uom_1_factor columns
// 2. Multi-row per product (new): same productCode in multiple rows, hierarchical UOM
//    - Last row = base unit (unitOfMeasure, buyingPrice, sellingPrice)
//    - Previous rows = conversion units (factor relative to unit below)
//    - Flat factor computed by multiplying from base up
export const importInventoryFromExcel = asyncErrorHandler(
  async (req, res, next) => {
    if (!req.file) {
      return next(new CustomError(400, "Please upload an Excel file"));
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return next(new CustomError(400, "Excel file is empty"));
    }

    // Group rows by productCode
    const grouped = {};
    for (const row of rows) {
      const code = (
        row.productCode ||
        row.product_code ||
        row["Product Code"]
      );
      if (!code) continue;
      const codeUpper = String(code).trim().toUpperCase();
      if (!grouped[codeUpper]) grouped[codeUpper] = [];
      grouped[codeUpper].push(row);
    }

    if (Object.keys(grouped).length === 0) {
      return next(new CustomError(400, "No valid product codes found in Excel"));
    }

    const results = {
      total: Object.keys(grouped).length,
      success: 0,
      failed: 0,
      errors: [],
      created: [],
    };

    const validStatuses = ["active", "inactive", "discontinued"];

    for (const [codeUpper, productRows] of Object.entries(grouped)) {
      const rowNum = rows.indexOf(productRows[0]) + 2; // First occurrence row

      try {
        // Last row = base unit
        const baseRow = productRows[productRows.length - 1];

        const productName =
          baseRow.productName ||
          baseRow.product_name ||
          baseRow["Product Name"];
        const productCode =
          baseRow.productCode ||
          baseRow.product_code ||
          baseRow["Product Code"];
        const category = baseRow.category || baseRow["Category"];
        const buyingPrice =
          baseRow.buyingPrice !== undefined ? baseRow.buyingPrice :
          baseRow.buying_price !== undefined ? baseRow.buying_price :
          baseRow["Buying Price"];
        const sellingPrice =
          baseRow.sellingPrice !== undefined ? baseRow.sellingPrice :
          baseRow.selling_price !== undefined ? baseRow.selling_price :
          baseRow["Selling Price"];

        if (!productName) {
          throw new Error("Product name is required");
        }
        if (!productCode) {
          throw new Error("Product code is required");
        }
        if (!category) {
          throw new Error("Category is required");
        }
        if (
          buyingPrice === undefined ||
          buyingPrice === null ||
          buyingPrice === ""
        ) {
          throw new Error("Buying price is required");
        }
        if (
          sellingPrice === undefined ||
          sellingPrice === null ||
          sellingPrice === ""
        ) {
          throw new Error("Selling price is required");
        }

        const numBuyingPrice = Number(buyingPrice);
        const numSellingPrice = Number(sellingPrice);

        if (isNaN(numBuyingPrice) || numBuyingPrice < 0) {
          throw new Error("Buying price must be a valid non-negative number");
        }
        if (isNaN(numSellingPrice) || numSellingPrice < 0) {
          throw new Error("Selling price must be a valid non-negative number");
        }

        const existingProduct = await Inventory.findOne({
          productCode: codeUpper,
        });
        if (existingProduct) {
          throw new Error(`Product code '${codeUpper}' already exists`);
        }

        const SKU = baseRow.SKU || baseRow.sku;
        if (SKU) {
          const existingSKU = await Inventory.findOne({
            SKU: String(SKU).toUpperCase(),
          });
          if (existingSKU) {
            throw new Error(`SKU '${SKU}' already exists`);
          }
        }

        const barcode = baseRow.barcode || baseRow["Barcode"];
        if (barcode) {
          const existingBarcode = await Inventory.findOne({
            barcode: String(barcode),
          });
          if (existingBarcode) {
            throw new Error(`Barcode '${barcode}' already exists`);
          }
        }

        const saleCode =
          baseRow.saleCode || baseRow.sale_code || baseRow["Sale Code"];
        if (saleCode) {
          const existingSaleCode = await Inventory.findOne({
            saleCode: String(saleCode).toUpperCase(),
          });
          if (existingSaleCode) {
            throw new Error(`Sale code '${saleCode}' already exists`);
          }
        }

        const unitOfMeasure =
          baseRow.unitOfMeasure ||
          baseRow.unit_of_measure ||
          baseRow["Unit of Measure"] ||
          "piece";

        const status = baseRow.status || baseRow["Status"] || "active";
        if (!validStatuses.includes(String(status).toLowerCase())) {
          throw new Error(`Invalid status: '${status}'`);
        }

        const taxRate =
          baseRow.taxRate || baseRow.tax_rate || baseRow["Tax Rate"] || 0;
        const numTaxRate = Number(taxRate);
        if (isNaN(numTaxRate) || numTaxRate < 0 || numTaxRate > 100) {
          throw new Error("Tax rate must be between 0 and 100");
        }

        const inventoryData = {
          productName: String(productName).trim(),
          productCode: codeUpper,
          saleCode: saleCode
            ? String(saleCode).trim().toUpperCase()
            : undefined,
          SKU: SKU ? String(SKU).trim().toUpperCase() : undefined,
          barcode: barcode ? String(barcode).trim() : undefined,
          category: String(category).trim(),
          subCategory:
            baseRow.subCategory ||
            baseRow.sub_category ||
            baseRow["Sub Category"] ||
            "Unknown",
          brand: baseRow.brand || baseRow["Brand"] || "Unknown",
          description:
            baseRow.description ||
            baseRow["Description"] ||
            "No description available",
          buyingPrice: numBuyingPrice,
          sellingPrice: numSellingPrice,
          unitOfMeasure: String(unitOfMeasure).toLowerCase(),
          reorderPoint: Number(
            baseRow.reorderPoint ||
              baseRow.reorder_point ||
              baseRow["Reorder Point"] ||
              0,
          ),
          reorderQuantity: Number(
            baseRow.reorderQuantity ||
              baseRow.reorder_quantity ||
              baseRow["Reorder Quantity"] ||
              0,
          ),
          taxRate: numTaxRate,
          status: String(status).toLowerCase(),
          tags: baseRow.tags
            ? String(baseRow.tags)
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          note: baseRow.note || baseRow["Note"] || "",
        };

        // Parse wholesale prices from prefix-based columns (wp_1 ~ wp_10)
        const wholesalePrices = [];
        for (let t = 1; t <= 10; t++) {
          const unit = baseRow[`wp_${t}_unit`] || null;
          const qty = baseRow[`wp_${t}_qty`];
          const price = baseRow[`wp_${t}_price`];
          if (
            qty !== undefined &&
            qty !== null &&
            qty !== "" &&
            price !== undefined &&
            price !== null &&
            price !== ""
          ) {
            const entry = { quantity: Number(qty), price: Number(price) };
            if (unit) entry.unit = String(unit).trim();
            wholesalePrices.push(entry);
          }
        }
        if (wholesalePrices.length > 0) {
          inventoryData.wholesalePrices = wholesalePrices;
        }

        // Build UOM conversions
        // Case 1: Multi-row format (2+ rows for same productCode)
        //   - Last row = base unit
        //   - Previous rows = conversion units with hierarchical factors
        //   - Flat factor = multiply all factors from that row down to base
        // Case 2: Single-row format (1 row)
        //   - Legacy: use uom_1_unit, uom_1_factor columns
        if (productRows.length > 1) {
          // Multi-row hierarchical format
          const uomConversions = [];
          let flatFactor = 1;

          // Read from second-to-last row up to first row (bottom-up)
          for (let i = productRows.length - 2; i >= 0; i--) {
            const row = productRows[i];
            const unit =
              row.unitOfMeasure || row.unit_of_measure || row["Unit of Measure"];
            const factor = Number(
              row.factor || row["Factor"] || row.conversion_factor,
            );

            if (unit && !isNaN(factor) && factor > 0) {
              flatFactor *= factor;
              uomConversions.push({
                unit: String(unit).trim(),
                factor: flatFactor,
              });
            }
          }

          // Reverse so smallest unit comes first
          uomConversions.reverse();

          if (uomConversions.length > 0) {
            inventoryData.uomConversions = uomConversions;
          }
        } else {
          // Single-row legacy format: parse uom_1 ~ uom_5 columns
          const uomConversions = [];
          for (let t = 1; t <= 5; t++) {
            const unit = baseRow[`uom_${t}_unit`];
            const factor = baseRow[`uom_${t}_factor`];
            if (
              unit &&
              factor !== undefined &&
              factor !== null &&
              factor !== ""
            ) {
              const entry = {
                unit: String(unit).trim(),
                factor: Number(factor),
              };
              const def = baseRow[`uom_${t}_default`];
              if (def)
                entry.isDefaultSellingUnit =
                  String(def).toLowerCase() === "true";
              uomConversions.push(entry);
            }
          }
          if (uomConversions.length > 0) {
            inventoryData.uomConversions = uomConversions;
          }
        }

        const newItem = await Inventory.create(inventoryData);
        results.success++;
        results.created.push({
          row: rowNum,
          id: newItem._id,
          productCode: newItem.productCode,
          productName: newItem.productName,
          unitOfMeasure: newItem.unitOfMeasure,
          uomConversions: newItem.uomConversions,
        });
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: rowNum,
          productCode: codeUpper,
          message: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Import completed: ${results.success} created, ${results.failed} failed out of ${results.total}`,
      data: results,
    });
  },
);

// Bulk update inventory from Excel (by productCode)
// Supports same multi-row format as import:
// - Multi-row: last row = base unit, previous rows = UOM conversions
// - Single-row: legacy format with uom_1_unit, uom_1_factor columns
export const importUpdateInventoryFromExcel = asyncErrorHandler(
  async (req, res, next) => {
    if (!req.file) {
      return next(new CustomError(400, "Please upload an Excel file"));
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return next(new CustomError(400, "Excel file is empty"));
    }

    // Group rows by productCode
    const grouped = {};
    for (const row of rows) {
      const code =
        row.productCode || row.product_code || row["Product Code"];
      if (!code) continue;
      const codeUpper = String(code).trim().toUpperCase();
      if (!grouped[codeUpper]) grouped[codeUpper] = [];
      grouped[codeUpper].push(row);
    }

    if (Object.keys(grouped).length === 0) {
      return next(new CustomError(400, "No valid product codes found in Excel"));
    }

    const results = {
      total: Object.keys(grouped).length,
      success: 0,
      failed: 0,
      errors: [],
      updated: [],
    };

    for (const [codeUpper, productRows] of Object.entries(grouped)) {
      const rowNum = rows.indexOf(productRows[0]) + 2;

      try {
        const existingItem = await Inventory.findOne({
          productCode: codeUpper,
        });
        if (!existingItem) {
          throw new Error(`Product code '${codeUpper}' not found`);
        }

        // Last row = base unit
        const baseRow = productRows[productRows.length - 1];

        // Update simple fields — only update if provided
        const simpleFields = [
          "brand",
          "category",
          "subCategory",
          "description",
          "status",
          "note",
        ];
        for (const field of simpleFields) {
          const val =
            baseRow[field] ||
            baseRow[field.replace(/([A-Z])/g, "_$1").toLowerCase()] ||
            baseRow[field.replace(/([a-z])([A-Z])/g, "$1 $2")];
          if (val) existingItem[field] = String(val).trim();
        }

        if (
          baseRow.buyingPrice !== undefined &&
          baseRow.buyingPrice !== null &&
          baseRow.buyingPrice !== ""
        ) {
          existingItem.buyingPrice = Number(baseRow.buyingPrice);
        }
        if (
          baseRow.sellingPrice !== undefined &&
          baseRow.sellingPrice !== null &&
          baseRow.sellingPrice !== ""
        ) {
          existingItem.sellingPrice = Number(baseRow.sellingPrice);
        }
        if (
          baseRow.unitOfMeasure ||
          baseRow.unit_of_measure ||
          baseRow["Unit of Measure"]
        ) {
          existingItem.unitOfMeasure = String(
            baseRow.unitOfMeasure ||
              baseRow.unit_of_measure ||
              baseRow["Unit of Measure"],
          ).trim();
        }

        // Parse wholesale prices from prefix-based columns (wp_1 ~ wp_10)
        const wholesalePrices = [];
        for (let t = 1; t <= 10; t++) {
          const unit = baseRow[`wp_${t}_unit`] || null;
          const qty = baseRow[`wp_${t}_qty`];
          const price = baseRow[`wp_${t}_price`];
          if (
            qty !== undefined &&
            qty !== null &&
            qty !== "" &&
            price !== undefined &&
            price !== null &&
            price !== ""
          ) {
            const entry = { quantity: Number(qty), price: Number(price) };
            if (unit) entry.unit = String(unit).trim();
            wholesalePrices.push(entry);
          }
        }
        if (wholesalePrices.length > 0) {
          existingItem.wholesalePrices = wholesalePrices;
        }

        // Build UOM conversions (same logic as import)
        if (productRows.length > 1) {
          // Multi-row hierarchical format
          const uomConversions = [];
          let flatFactor = 1;

          for (let i = productRows.length - 2; i >= 0; i--) {
            const row = productRows[i];
            const unit =
              row.unitOfMeasure ||
              row.unit_of_measure ||
              row["Unit of Measure"];
            const factor = Number(
              row.factor || row["Factor"] || row.conversion_factor,
            );

            if (unit && !isNaN(factor) && factor > 0) {
              flatFactor *= factor;
              uomConversions.push({
                unit: String(unit).trim(),
                factor: flatFactor,
              });
            }
          }

          uomConversions.reverse();

          if (uomConversions.length > 0) {
            existingItem.uomConversions = uomConversions;
          }
        } else {
          // Single-row legacy format: parse uom_1 ~ uom_5 columns
          const uomConversions = [];
          for (let t = 1; t <= 5; t++) {
            const unit = baseRow[`uom_${t}_unit`];
            const factor = baseRow[`uom_${t}_factor`];
            if (
              unit &&
              factor !== undefined &&
              factor !== null &&
              factor !== ""
            ) {
              const entry = {
                unit: String(unit).trim(),
                factor: Number(factor),
              };
              const def = baseRow[`uom_${t}_default`];
              if (def)
                entry.isDefaultSellingUnit =
                  String(def).toLowerCase() === "true";
              uomConversions.push(entry);
            }
          }
          if (uomConversions.length > 0) {
            existingItem.uomConversions = uomConversions;
          }
        }

        await existingItem.save();
        results.success++;
        results.updated.push(existingItem.productCode);
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: rowNum,
          productCode: codeUpper,
          message: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Update completed: ${results.success} updated, ${results.failed} failed out of ${results.total}`,
      data: results,
    });
  },
);

// Get all unique categories from inventory
export const getAllCategories = asyncErrorHandler(async (req, res, next) => {
  const categories = await Inventory.distinct("category");

  res.status(200).json({
    success: true,
    message: "Categories retrieved successfully",
    data: categories.filter(Boolean), // Remove any null or undefined values
  });
});

// --- Inventory Image Management ---

// Multer config for inventory images (max 5, each up to 5MB)
export const inventoryMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new CustomError(400, "Only JPEG, PNG, and WebP images are allowed"),
        false
      );
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Upload images to inventory item (max 5 total)
export const uploadInventoryImages = [
  inventoryMulter.array("images", 5),
  asyncErrorHandler(async (req, res, next) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new CustomError(400, "Invalid inventory ID format"));
    }

    if (!req.files || req.files.length === 0) {
      return next(new CustomError(400, "Please upload at least one image"));
    }

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return next(new CustomError(404, "Inventory item not found"));
    }

    const currentCount = inventory.images?.length || 0;
    const incomingCount = req.files.length;
    if (currentCount + incomingCount > 5) {
      return next(
        new CustomError(
          400,
          `Cannot add ${incomingCount} images. Product already has ${currentCount} image(s). Maximum total is 5.`
        )
      );
    }

    const uploadedImages = [];

    for (const file of req.files) {
      const key = generateR2Key(file.originalname, "inventory");
      const url = await uploadToR2(file, key);
      uploadedImages.push({
        url,
        key,
        isPrimary: currentCount === 0 && uploadedImages.length === 0,
      });
    }

    inventory.images.push(...uploadedImages);
    await inventory.save();

    res.status(200).json({
      success: true,
      message: `${uploadedImages.length} image(s) uploaded successfully`,
      data: { images: uploadedImages, totalImages: inventory.images.length },
    });
  }),
];

// Delete a single image from inventory item
export const deleteInventoryImage = asyncErrorHandler(
  async (req, res, next) => {
    const { id, imageId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(imageId)
    ) {
      return next(new CustomError(400, "Invalid ID format"));
    }

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return next(new CustomError(404, "Inventory item not found"));
    }

    const imageIndex = inventory.images.findIndex(
      (img) => img._id.toString() === imageId
    );
    if (imageIndex === -1) {
      return next(new CustomError(404, "Image not found"));
    }

    const removedImage = inventory.images[imageIndex];
    const wasPrimary = removedImage.isPrimary;

    await deleteFromR2(removedImage.key);

    inventory.images.splice(imageIndex, 1);

    if (wasPrimary && inventory.images.length > 0) {
      inventory.images[0].isPrimary = true;
    }

    await inventory.save();

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: { totalImages: inventory.images.length },
    });
  }
);

// Set primary image for inventory item
export const setPrimaryInventoryImage = asyncErrorHandler(
  async (req, res, next) => {
    const { id, imageId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(imageId)
    ) {
      return next(new CustomError(400, "Invalid ID format"));
    }

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return next(new CustomError(404, "Inventory item not found"));
    }

    const imageExists = inventory.images.some(
      (img) => img._id.toString() === imageId
    );
    if (!imageExists) {
      return next(new CustomError(404, "Image not found"));
    }

    inventory.images.forEach((img) => {
      img.isPrimary = img._id.toString() === imageId;
    });

    await inventory.save();

    res.status(200).json({
      success: true,
      message: "Primary image updated successfully",
      data: { images: inventory.images },
    });
  }
);
