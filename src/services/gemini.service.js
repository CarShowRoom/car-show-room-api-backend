import { generateText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import Order from "../models/orders.model.js";
import Inventory from "../models/inventory.model.js";
import WarehouseStock from "../models/warehouse.model.js";
import StorefrontInventory from "../models/storefrontInventory.model.js";
import Purchasing from "../models/purchasing.model.js";
import Expense from "../models/expense.model.js";

const systemInstruction = `You are a helpful POS assistant for Shwe-Pyi POS system.

RULES:
- Answer in Myanmar language (Burmese).
- Use the available tools when the user asks about sales, product stock, purchase orders (PO), or expenses.
- If a tool returns empty data, say "ဒီအချိန်အတွင်း အချက်အလက်မရှိသေးပါ" (no data for this period).
- If the user asks something outside POS or no tool is available, say "ဒီအကြောင်းအရာအတွက် ကျွန်တော်မသိပါ၊ POS နဲ့ဆိုင်တဲ့အကြောင်းတွေပဲ ဖြေပေးနိုင်ပါတယ်" (I only answer POS-related questions).
- Be concise, professional, and friendly.
- Use proper Myanmar honorifics and sentence structure.
- Format currency amounts in MMK with commas (e.g. 150,000 MMK).
- If user greets (မင်္ဂလာပါ, ဟိုင်း, etc.), greet back in Myanmar.`;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function convertHistory(messages) {
  return messages.map((msg) => ({
    role: msg.role === "model" ? "assistant" : "user",
    content: msg.text,
  }));
}

const tools = {
  getSalesReport: tool({
    description:
      "Get total sales amount for a specific date. Returns total revenue, order count, and payment breakdown.",
    parameters: z.object({
      date: z
        .string()
        .describe(
          "Date in YYYY-MM-DD format. If not provided, defaults to today.",
        ),
    }),
    execute: async ({ date }) => {
      const d = date ? new Date(date) : new Date();
      const start = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        0,
        0,
        0,
      );
      const end = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
        999,
      );

      const orders = await Order.find({
        createdAt: { $gte: start, $lte: end },
        isDeleted: false,
        orderStatus: { $ne: "cancelled" },
      }).lean();

      const totalRevenue = orders.reduce(
        (sum, o) => sum + (o.finalAmount || 0),
        0,
      );
      const totalPaid = orders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
      const creditCount = orders.filter(
        (o) => o.paymentType === "credit",
      ).length;

      return {
        date: d.toISOString().split("T")[0],
        totalOrders: orders.length,
        totalRevenue,
        totalPaid,
        creditCount,
        paidCount: orders.length - creditCount,
      };
    },
  }),

  checkStock: tool({
    description:
      "Check remaining stock count of a specific product by name or code. Returns total stock across all warehouses and storefronts.",
    parameters: z.object({
      productName: z
        .string()
        .describe("Product name or product code to search for."),
    }),
    execute: async ({ productName }) => {
      const escaped = escapeRegex(productName);

      const inventory = await Inventory.findOne({
        $or: [
          { productName: { $regex: escaped, $options: "i" } },
          { productCode: { $regex: escaped, $options: "i" } },
        ],
        status: "active",
      }).lean();

      if (!inventory) {
        return { found: false, message: `Product "${productName}" not found` };
      }

      const warehouseStock = await WarehouseStock.find({
        inventoryId: inventory._id,
      }).lean();
      const warehouseTotal = warehouseStock.reduce(
        (sum, w) => sum + (w.quantity || 0),
        0,
      );

      const storefrontStock = await StorefrontInventory.find({
        inventoryId: inventory._id,
      }).lean();
      const storefrontTotal = storefrontStock.reduce(
        (sum, s) => sum + (s.quantity || 0),
        0,
      );

      return {
        found: true,
        productName: inventory.productName,
        productCode: inventory.productCode,
        totalStock: warehouseTotal + storefrontTotal,
        warehouseStock: warehouseTotal,
        storefrontStock: storefrontTotal,
        unit: inventory.unitOfMeasure,
        sellingPrice: inventory.sellingPrice,
      };
    },
  }),

  getPOReport: tool({
    description:
      "Get purchase order (PO) report within a date range, optionally filtered by status. Returns total POs, total amount, and status breakdown.",
    parameters: z.object({
      startDate: z.string().describe("Start date in YYYY-MM-DD format."),
      endDate: z.string().describe("End date in YYYY-MM-DD format."),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by status: pending, confirmed, arrived, completed, cancelled. If omitted, returns all statuses.",
        ),
    }),
    execute: async ({ startDate, endDate, status }) => {
      const start = new Date(startDate + "T00:00:00.000Z");
      const end = new Date(endDate + "T23:59:59.999Z");

      const filter = {
        createdAt: { $gte: start, $lte: end },
        isDeleted: false,
      };
      if (status) {
        filter.status = status;
      }

      const pos = await Purchasing.find(filter)
        .populate("supplierId", "supplierName")
        .lean();

      const totalAmount = pos.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

      const statusBreakdown = {};
      for (const po of pos) {
        const s = po.status || "unknown";
        statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
      }

      return {
        startDate,
        endDate,
        totalPOs: pos.length,
        totalAmount,
        statusBreakdown,
        pos: pos.map((po) => ({
          poNumber: po.poNumber,
          supplier: po.supplierId?.supplierName || "Unknown",
          totalAmount: po.totalAmount,
          status: po.status,
          productCount: po.products?.length || 0,
          createdAt: po.createdAt,
        })),
      };
    },
  }),

  getExpenseReport: tool({
    description:
      "Get expense report within a date range, optionally filtered by category. Returns total expenses, count, and category breakdown.",
    parameters: z.object({
      startDate: z.string().describe("Start date in YYYY-MM-DD format."),
      endDate: z.string().describe("End date in YYYY-MM-DD format."),
      category: z
        .string()
        .optional()
        .describe(
          "Filter by expense category (e.g. လျှပ်စစ်, လစာ, ငှားရမ်း). If omitted, returns all categories.",
        ),
    }),
    execute: async ({ startDate, endDate, category }) => {
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
        categoryBreakdown,
        filteredByCategory: category || null,
      };
    },
  }),
};

export async function askGemini(messages) {
  const history = convertHistory(messages.slice(0, -1));
  const userMessage =
    messages.length > 0 ? messages[messages.length - 1].text : "";

  const result = await generateText({
    model: google("gemini-2.0-flash", { apiKey: process.env.GEMINI_API_KEY }),
    system: systemInstruction,
    messages: [...history, { role: "user", content: userMessage }],
    tools,
    maxSteps: 5,
  });

  if (result.text) return result.text;

  const lastStep = result.steps?.[result.steps.length - 1];
  if (lastStep?.text) return lastStep.text;

  const stepTexts = result.steps
    ?.map((s, i) => `[step${i}] text="${s.text}" finish=${s.finishReason} toolCalls=${s.toolCalls?.length || 0}`)
    .join(" | ");
  console.log("generateText result:", { text: result.text, steps: result.steps?.length, details: stepTexts });

  const fullText = result.steps
    ?.map((s) => s.text)
    .filter(Boolean)
    .join("\n");
  if (fullText) return fullText;

  return "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
}
