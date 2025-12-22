import dotenv from "dotenv";
dotenv.config({ path: "./config.env" });
import express from "express";
import helmet from "helmet";
import { mmTimeZoneMiddleware } from "./configs/timezoneConvertor.config.js";

// User Define Module
import apiRateLimiter from "./middlewares/rateLimiter.middleware.js";
import configureCors from "./configs/cors.config.js";
import globalErrorHandler from "./controllers/error.controller.js";
import CustomError from "./utils/customError.js";

import inventoryRouter from "./routes/inventory.route.js";
import warehouseProfileRouter from "./routes/warehouseProfile.route.js";
import storefrontProfileRouter from "./routes/storefrontProfile.route.js";
import storefrontInventoryRouter from "./routes/storefrontInventory.route.js";
import supplierProfileRouter from "./routes/supplierProfile.route.js";
import purchasingRouter from "./routes/purchasing.route.js";
import warehouseRouter from "./routes/warehouse.route.js";
import grnRouter from "./routes/grn.route.js";
import transferRouter from "./routes/transfer.route.js";

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(configureCors());

app.set("trust proxy", 1);
app.use(apiRateLimiter(60, 60 * 1000)); //60 requests per minute

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10kb" }));
app.use(mmTimeZoneMiddleware);

//Route Mounting
app.use("/api/v1", inventoryRouter);
app.use("/api/v1", warehouseProfileRouter);
app.use("/api/v1", storefrontProfileRouter);
app.use("/api/v1", storefrontInventoryRouter);
app.use("/api/v1", supplierProfileRouter);
app.use("/api/v1", purchasingRouter);
app.use("/api/v1", warehouseRouter);
app.use("/api/v1", grnRouter);
app.use("/api/v1", transferRouter);
//404-Error Handler
app.all("/*any", (req, res, next) => {
  const err = new CustomError(
    404,
    `Can't find ${req.originalUrl} on the server!`
  );
  next(err);
});

app.use(globalErrorHandler);

export default app;
