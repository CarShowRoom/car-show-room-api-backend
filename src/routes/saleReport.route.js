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

// Payment method breakdown report for storefront (paid orders only)
router.get(
  "/sale-report/storefront/:storefrontId/paid-orders",
  getPaymentMethodReportByStorefrontId
);

// Credit sale report with credit records breakdown
router.get(
  "/sale-report/storefront/:storefrontId/credit-orders",
  getCreditSaleReportByStorefrontId
);

// Product/stock sales statistics report
router.get(
  "/sale-report/storefront/:storefrontId/products",
  getProductSalesReportByStorefrontId
);

export default router;
