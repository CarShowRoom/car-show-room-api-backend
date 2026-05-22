import mongoose from "mongoose";
import Order from "../models/orders.model.js";
import Inventory from "../models/inventory.model.js";
import Expense from "../models/expense.model.js";
import ChatSession from "../models/chatSession.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { askGemini } from "../services/gemini.service.js";

function getDateRange(dateStr) {
  if (dateStr) {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return { start, end };
  }
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  return { start, end };
}

async function handleDailySales(args) {
  const { date } = args || {};
  const { start, end } = getDateRange(date);

  const orders = await Order.find({
    createdAt: { $gte: start, $lte: end },
    isDeleted: false,
    orderStatus: { $ne: "cancelled" },
  }).lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  const totalPaid = orders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
  const creditCount = orders.filter((o) => o.paymentType === "credit").length;
  const paidCount = orders.filter((o) => o.paymentType === "paid").length;
  const productCount = orders.reduce((sum, o) => sum + (o.ordersProducts?.length || 0), 0);

  return {
    date: date || new Date().toISOString().split("T")[0],
    totalOrders,
    totalRevenue,
    totalPaid,
    creditCount,
    paidCount,
    productCount,
  };
}

async function handleTopProducts(args) {
  const { limit = 5, startDate, endDate } = args || {};
  const end = endDate ? new Date(endDate + "T23:59:59.999Z") : new Date();
  const start = startDate
    ? new Date(startDate + "T00:00:00.000Z")
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const orders = await Order.find({
    createdAt: { $gte: start, $lte: end },
    isDeleted: false,
    orderStatus: { $ne: "cancelled" },
  }).populate("ordersProducts.inventoryId", "productName productCode").lean();

  const productMap = {};
  for (const order of orders) {
    for (const item of order.ordersProducts || []) {
      const invId = item.inventoryId?._id?.toString() || item.inventoryId?.toString();
      if (!invId) continue;
      if (!productMap[invId]) {
        productMap[invId] = {
          productName: item.inventoryId?.productName || "Unknown",
          productCode: item.inventoryId?.productCode || "",
          totalQuantity: 0,
          totalRevenue: 0,
        };
      }
      productMap[invId].totalQuantity += item.quantity || 0;
      productMap[invId].totalRevenue += (item.unitPrice || 0) * (item.quantity || 0);
    }
  }

  const sorted = Object.values(productMap)
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, limit);

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
    products: sorted,
  };
}

async function handleLowStockItems(args) {
  const { threshold } = args || {};
  const inventories = await Inventory.find({ status: "active" }).lean();

  const lowStock = [];
  for (const inv of inventories) {
    const reorderPoint = threshold != null ? threshold : (inv.reorderPoint || 0);
    if (reorderPoint <= 0) continue;

    lowStock.push({
      productName: inv.productName,
      productCode: inv.productCode,
      category: inv.category,
      currentStock: 0,
      reorderPoint,
      sellingPrice: inv.sellingPrice,
      buyingPrice: inv.buyingPrice,
    });
  }

  return {
    count: lowStock.length,
    items: lowStock.slice(0, 20),
  };
}

async function handleMonthlySales(args) {
  const now = new Date();
  const month = args?.month || now.getMonth() + 1;
  const year = args?.year || now.getFullYear();

  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const orders = await Order.find({
    createdAt: { $gte: start, $lte: end },
    isDeleted: false,
    orderStatus: { $ne: "cancelled" },
  }).lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const dailyMap = {};
  for (const order of orders) {
    const day = new Date(order.createdAt).getDate();
    dailyMap[day] = (dailyMap[day] || 0) + 1;
  }
  const busiestDay = Object.entries(dailyMap).sort((a, b) => b[1] - a[1])[0];

  return {
    month,
    year,
    totalOrders,
    totalRevenue,
    avgOrderValue,
    busiestDay: busiestDay ? `Day ${busiestDay[0]} (${busiestDay[1]} orders)` : null,
  };
}

async function handleExpenseSummary(args) {
  const { startDate, endDate, category } = args || {};
  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required");
  }

  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");

  const filter = {
    date: { $gte: start, $lte: end },
    softDeleted: false,
  };
  if (category) {
    filter.category = category;
  }

  const expenses = await Expense.find(filter).lean();
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const categoryBreakdown = {};
  for (const exp of expenses) {
    const cat = exp.category || "Unknown";
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (exp.amount || 0);
  }

  return {
    startDate,
    endDate,
    totalExpenses: totalAmount,
    count: expenses.length,
    categoryBreakdown: category ? { [category]: totalAmount } : categoryBreakdown,
    filteredByCategory: category || null,
  };
}

const functionHandlers = {
  getDailySales: handleDailySales,
  getTopProducts: handleTopProducts,
  getLowStockItems: handleLowStockItems,
  getMonthlySales: handleMonthlySales,
  getExpenseSummary: handleExpenseSummary,
};

export const chatWithBot = asyncErrorHandler(async (req, res, next) => {
  const { message } = req.body;
  const adminId = req.user._id;

  if (!message || !message.trim()) {
    return next(new CustomError(400, "Message is required"));
  }

  let session = await ChatSession.findOne({ admin: adminId });
  if (!session) {
    session = await ChatSession.create({ admin: adminId, messages: [] });
  }

  session.messages.push({ role: "user", text: message.trim() });

  const replyText = await askGemini(session.messages, functionHandlers);

  session.messages.push({ role: "model", text: replyText });
  await session.save();

  res.status(200).json({
    success: true,
    data: { reply: replyText },
  });
});

export const getChatHistory = asyncErrorHandler(async (req, res, next) => {
  const adminId = req.user._id;

  const session = await ChatSession.findOne({ admin: adminId });
  if (!session) {
    return res.status(200).json({
      success: true,
      data: { messages: [] },
    });
  }

  res.status(200).json({
    success: true,
    data: { messages: session.messages },
  });
});

export const clearChatHistory = asyncErrorHandler(async (req, res, next) => {
  const adminId = req.user._id;

  await ChatSession.findOneAndUpdate(
    { admin: adminId },
    { $set: { messages: [] } },
  );

  res.status(200).json({
    success: true,
    message: "Chat history cleared successfully",
  });
});
