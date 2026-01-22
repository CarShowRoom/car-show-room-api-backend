import express from "express";
import {
  getSaleReportByStorefrontId,
  getPaymentMethodReportByStorefrontId,
  getCreditSaleReportByStorefrontId,
  getProductSalesReportByStorefrontId,
} from "../controllers/saleReport.controller.js";
import { protect } from "../controllers/administrationPolicy.controller.js";
import { permissionGranted } from "../controllers/administrationPolicy.controller.js";

const router = express.Router();

// Sale report for storefront or all storefronts
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get(
  "/sale-report",
  protect,
  permissionGranted("Owner"),
  getSaleReportByStorefrontId
);

// Payment method breakdown report for storefront or all storefronts (paid orders only)
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get(
  "/sale-report/paid-orders",
  protect,
  permissionGranted("Owner"),
  getPaymentMethodReportByStorefrontId
);

// Credit sale report with credit records breakdown for storefront or all storefronts
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get(
  "/sale-report/credit-orders",
  protect,
  permissionGranted("Owner"),
  getCreditSaleReportByStorefrontId
);

// Product/stock sales statistics report for storefront or all storefronts
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get(
  "/sale-report/products",
  protect,
  permissionGranted("Owner"),
  getProductSalesReportByStorefrontId
);

export default router;
