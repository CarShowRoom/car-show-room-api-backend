import express from "express";
import {
  getSaleReportByStorefrontId,
  getPaymentMethodReportByStorefrontId,
  getCreditSaleReportByStorefrontId,
  getProductSalesReportByStorefrontId,
} from "../controllers/saleReport.controller.js";

const router = express.Router();

// Sale report for storefront
router.get(
  "/sale-report/storefront/:storefrontId",
  getSaleReportByStorefrontId
);

// Payment method breakdown report for storefront or all storefronts (paid orders only)
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get("/sale-report/paid-orders", getPaymentMethodReportByStorefrontId);

// Credit sale report with credit records breakdown for storefront or all storefronts
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get("/sale-report/credit-orders", getCreditSaleReportByStorefrontId);

// Product/stock sales statistics report for storefront or all storefronts
// Use ?storefrontId=<id> for specific storefront, omit for all storefronts
router.get("/sale-report/products", getProductSalesReportByStorefrontId);

export default router;
