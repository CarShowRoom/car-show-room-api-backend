import express from "express";
import { getSaleReportByStorefrontId } from "../controllers/saleReport.controller.js";

const router = express.Router();

// Sale report for storefront
router.get(
  "/sale-report/storefront/:storefrontId",
  getSaleReportByStorefrontId
);

export default router;
