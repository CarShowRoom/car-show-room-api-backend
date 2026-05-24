import OpenAI from "openai";
import Order from "../models/orders.model.js";
import Inventory from "../models/inventory.model.js";
import WarehouseStock from "../models/warehouse.model.js";
import StorefrontInventory from "../models/storefrontInventory.model.js";
import Purchasing from "../models/purchasing.model.js";
import Expense from "../models/expense.model.js";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = "openai/gpt-4o-mini";

const systemInstruction = `You are a helpful POS assistant for Shwe-Pyi POS system.

RULES:
- Answer in Myanmar language (Burmese).
- The POS system name is "Shwe-Pyi POS System". "i-max" is just a branch/location name, NOT the system name. NEVER refer to the system as "i-max POS".
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

const tools = [
  {
    type: "function",
    function: {
      name: "getSalesReport",
      description:
        "Get total sales amount for a specific date. Returns total revenue, order count, and payment breakdown.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format. If not provided, defaults to today.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkStock",
      description:
        "Check remaining stock count of a specific product by name or code. Returns total stock across all warehouses and storefronts.",
      parameters: {
        type: "object",
        properties: {
          productName: {
            type: "string",
            description: "Product name or product code to search for.",
          },
        },
        required: ["productName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPOReport",
      description:
        "Get purchase order (PO) report within a date range, optionally filtered by status. Returns total POs, total amount, and status breakdown.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format.",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format.",
          },
          status: {
            type: "string",
            description: "Filter by status: pending, confirmed, arrived, completed, cancelled. If omitted, returns all statuses.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getExpenseReport",
      description:
        "Get expense report within a date range, optionally filtered by category. Returns total expenses, count, and category breakdown.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format.",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format.",
          },
          category: {
            type: "string",
            description: "Filter by expense category (e.g. လျှပ်စစ်, လစာ, ငှားရမ်း). If omitted, returns all categories.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
];

const toolHandlers = {
  getSalesReport: async ({ date }) => {
    console.log("[Tool Call] getSalesReport with:", { date });
    const d = date ? new Date(date) : new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const orders = await Order.find({
      createdAt: { $gte: start, $lte: end },
      isDeleted: false,
      orderStatus: { $ne: "cancelled" },
    }).lean();

    const result = {
      date: d.toISOString().split("T")[0],
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + (o.finalAmount || 0), 0),
      totalPaid: orders.reduce((s, o) => s + (o.paidAmount || 0), 0),
      creditCount: orders.filter((o) => o.paymentType === "credit").length,
      paidCount: orders.filter((o) => o.paymentType !== "credit").length,
    };
    console.log("[Tool Result] getSalesReport:", JSON.stringify(result));
    return result;
  },

  checkStock: async ({ productName }) => {
    console.log("[Tool Call] checkStock with:", { productName });
    const escaped = escapeRegex(productName);
    const inventory = await Inventory.findOne({
      $or: [
        { productName: { $regex: escaped, $options: "i" } },
        { productCode: { $regex: escaped, $options: "i" } },
      ],
      status: "active",
    }).lean();

    if (!inventory) {
      console.log("[Tool Result] checkStock: not found");
      return { found: false, message: `Product "${productName}" not found` };
    }

    const warehouseStock = await WarehouseStock.find({ inventoryId: inventory._id }).lean();
    const storefrontStock = await StorefrontInventory.find({ inventoryId: inventory._id }).lean();

    const result = {
      found: true,
      productName: inventory.productName,
      productCode: inventory.productCode,
      totalStock: warehouseStock.reduce((s, w) => s + (w.quantity || 0), 0)
        + storefrontStock.reduce((s, sf) => s + (sf.quantity || 0), 0),
      warehouseStock: warehouseStock.reduce((s, w) => s + (w.quantity || 0), 0),
      storefrontStock: storefrontStock.reduce((s, sf) => s + (sf.quantity || 0), 0),
      unit: inventory.unitOfMeasure,
      sellingPrice: inventory.sellingPrice,
    };
    console.log("[Tool Result] checkStock:", JSON.stringify(result));
    return result;
  },

  getPOReport: async ({ startDate, endDate, status }) => {
    console.log("[Tool Call] getPOReport with:", { startDate, endDate, status });
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");

    const filter = { createdAt: { $gte: start, $lte: end }, isDeleted: false };
    if (status) filter.status = status;

    const pos = await Purchasing.find(filter).populate("supplierId", "supplierName").lean();

    const statusBreakdown = {};
    for (const po of pos) {
      const s = po.status || "unknown";
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    }

    const result = {
      startDate, endDate,
      totalPOs: pos.length,
      totalAmount: pos.reduce((s, p) => s + (p.totalAmount || 0), 0),
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
    console.log("[Tool Result] getPOReport:", JSON.stringify(result));
    return result;
  },

  getExpenseReport: async ({ startDate, endDate, category }) => {
    console.log("[Tool Call] getExpenseReport with:", { startDate, endDate, category });
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");

    const filter = { date: { $gte: start, $lte: end }, softDeleted: false };
    if (category) filter.category = category;

    const expenses = await Expense.find(filter).lean();

    const categoryBreakdown = {};
    for (const exp of expenses) {
      const cat = exp.category || "Unknown";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (exp.amount || 0);
    }

    const result = {
      startDate, endDate,
      totalExpenses: expenses.reduce((s, e) => s + (e.amount || 0), 0),
      count: expenses.length,
      categoryBreakdown,
      filteredByCategory: category || null,
    };
    console.log("[Tool Result] getExpenseReport:", JSON.stringify(result));
    return result;
  },
};

async function runToolLoop(messages) {
  let msgs = messages;
  let maxSteps = 5;

  for (let step = 0; step < maxSteps; step++) {
    console.log(`\n--- OpenAI API Call (step ${step}) ---`);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: msgs,
      tools,
      tool_choice: "auto",
    });

    const choice = response.choices?.[0];
    const message = choice?.message;

    if (!message) {
      console.log("No response from API");
      return "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
    }

    console.log(`  finish_reason: ${choice.finish_reason}`);
    if (message.content) {
      console.log(`  content: "${message.content.substring(0, 100)}"`);
    }
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        console.log(`  tool_call: ${tc.function.name}(${tc.function.arguments})`);
      }
    }

    // If the model wants to respond directly, return its content
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
    }

    // Execute all tool calls
    const assistantMsg = { role: "assistant", content: message.content || null, tool_calls: message.tool_calls };
    const toolResultMsgs = [];

    for (const tc of message.tool_calls) {
      const handler = toolHandlers[tc.function.name];
      if (!handler) {
        toolResultMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}` }),
        });
        continue;
      }

      try {
        const args = JSON.parse(tc.function.arguments);
        const result = await handler(args);
        toolResultMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        console.error(`Error executing ${tc.function.name}:`, err.message);
        toolResultMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err.message }),
        });
      }
    }

    msgs = [...msgs, assistantMsg, ...toolResultMsgs];
  }

  return "တောင်းပန်ပါတယ်။ အဆင့်များလွန်းလို့ ပြန်မဖြေနိုင်တော့ပါ။ ထပ်မေးပေးပါ။";
}

export async function askGemini(messages) {
  const history = convertHistory(messages.slice(0, -1));
  const userMessage = messages.length > 0 ? messages[messages.length - 1].text : "";

  console.log("\n========== CHATBOT REQUEST ==========");
  console.log("User:", userMessage);
  console.log("History:", history.length, "messages");

  const openaiMessages = [
    { role: "system", content: systemInstruction },
    ...history,
    { role: "user", content: userMessage },
  ];

  const reply = await runToolLoop(openaiMessages);

  console.log("Final reply:", reply?.substring(0, 200));
  console.log("=====================================\n");

  return reply;
}
