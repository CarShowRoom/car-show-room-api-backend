import Order from "../models/orders.model.js";
import Inventory from "../models/inventory.model.js";
import WarehouseStock from "../models/warehouse.model.js";
import StorefrontInventory from "../models/storefrontInventory.model.js";
import Purchasing from "../models/purchasing.model.js";
import Expense from "../models/expense.model.js";

const MODEL = "google/gemini-2.5-flash";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;

const systemInstruction = `You are a helpful POS assistant for Shwe-Pyi POS system.

CURRENT DATE: Today is ${new Date().toISOString().split("T")[0]}. The current year is ${new Date().getFullYear()}.

RULES:
- Answer in Myanmar language (Burmese).
- The POS system name is "Shwe-Pyi POS System". "i-max" is just a branch/location name, NOT the system name. NEVER refer to the system as "i-max POS".
- Use the available tools when the user asks about sales, product stock, purchase orders (PO), or expenses.
- When using getSalesReport: the date parameter is OPTIONAL. Only include a date if the user explicitly mentions a specific date. If the user doesn't mention any date, do NOT include the date parameter at all.
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
        "Get total sales amount. The date parameter is OPTIONAL. If the user doesn't specify a date, DO NOT include date — the system will use today's date automatically.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "OPTIONAL. Date in YYYY-MM-DD format. Only include if the user explicitly asks for a specific date.",
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
      description: "Check remaining stock of a product by name or code.",
      parameters: {
        type: "object",
        properties: {
          productName: {
            type: "string",
            description: "Product name or code to search.",
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
      description: "Get purchase order report within a date range.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date YYYY-MM-DD." },
          endDate: { type: "string", description: "End date YYYY-MM-DD." },
          status: {
            type: "string",
            description:
              "Filter: pending, confirmed, arrived, completed, cancelled.",
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
      description: "Get expense report within a date range.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date YYYY-MM-DD." },
          endDate: { type: "string", description: "End date YYYY-MM-DD." },
          category: { type: "string", description: "Filter by category." },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
];

const toolHandlers = {
  getSalesReport: async ({ date }) => {
    console.log("[Tool Call] getSalesReport with:", { date });
    let d;
    if (date) {
      d = new Date(date);
      if (isNaN(d.getTime()) || d.getFullYear() < 2026) d = new Date();
    } else {
      d = new Date();
    }
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
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
    return {
      date: d.toISOString().split("T")[0],
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + (o.finalAmount || 0), 0),
      totalPaid: orders.reduce((s, o) => s + (o.paidAmount || 0), 0),
      creditCount: orders.filter((o) => o.paymentType === "credit").length,
    };
  },
  checkStock: async ({ productName }) => {
    console.log("[Tool Call] checkStock with:", { productName });
    const inventory = await Inventory.findOne({
      $or: [
        { productName: { $regex: escapeRegex(productName), $options: "i" } },
        { productCode: { $regex: escapeRegex(productName), $options: "i" } },
      ],
      status: "active",
    }).lean();
    if (!inventory)
      return { found: false, message: `Product "${productName}" not found` };
    const warehouseStock = await WarehouseStock.find({
      inventoryId: inventory._id,
    }).lean();
    const storefrontStock = await StorefrontInventory.find({
      inventoryId: inventory._id,
    }).lean();
    return {
      found: true,
      productName: inventory.productName,
      productCode: inventory.productCode,
      totalStock:
        warehouseStock.reduce((s, w) => s + (w.quantity || 0), 0) +
        storefrontStock.reduce((s, sf) => s + (sf.quantity || 0), 0),
      unit: inventory.unitOfMeasure,
      sellingPrice: inventory.sellingPrice,
    };
  },
  getPOReport: async ({ startDate, endDate, status }) => {
    console.log("[Tool Call] getPOReport with:", {
      startDate,
      endDate,
      status,
    });
    const filter = {
      createdAt: {
        $gte: new Date(startDate + "T00:00:00.000Z"),
        $lte: new Date(endDate + "T23:59:59.999Z"),
      },
      isDeleted: false,
    };
    if (status) filter.status = status;
    const pos = await Purchasing.find(filter)
      .populate("supplierId", "supplierName")
      .lean();
    const statusBreakdown = {};
    for (const po of pos) {
      const s = po.status || "unknown";
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    }
    return {
      totalPOs: pos.length,
      totalAmount: pos.reduce((s, p) => s + (p.totalAmount || 0), 0),
      statusBreakdown,
      pos: pos.map((po) => ({
        poNumber: po.poNumber,
        supplier: po.supplierId?.supplierName || "Unknown",
        totalAmount: po.totalAmount,
        status: po.status,
      })),
    };
  },
  getExpenseReport: async ({ startDate, endDate, category }) => {
    console.log("[Tool Call] getExpenseReport with:", {
      startDate,
      endDate,
      category,
    });
    const filter = {
      date: {
        $gte: new Date(startDate + "T00:00:00.000Z"),
        $lte: new Date(endDate + "T23:59:59.999Z"),
      },
      softDeleted: false,
    };
    if (category) filter.category = category;
    const expenses = await Expense.find(filter).lean();
    const categoryBreakdown = {};
    for (const exp of expenses) {
      const cat = exp.category || "Unknown";
      categoryBreakdown[cat] =
        (categoryBreakdown[cat] || 0) + (exp.amount || 0);
    }
    return {
      totalExpenses: expenses.reduce((s, e) => s + (e.amount || 0), 0),
      count: expenses.length,
      categoryBreakdown,
    };
  },
};

async function callOpenRouter(messages, opts = {}) {
  const { includeTools = true } = opts;
  const requestBody = { model: MODEL, messages };
  if (includeTools) {
    requestBody.tools = tools;
    requestBody.tool_choice = "auto";
  }

  const body = JSON.stringify(requestBody);
  console.log("--- API Request ---");
  console.log("Model:", MODEL);
  console.log(
    "Messages:",
    messages.length,
    "Tools:",
    includeTools ? tools.length : 0,
  );
  if (includeTools)
    console.log("Tool names:", tools.map((t) => t.function.name).join(", "));

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5000",
      "X-Title": "Shwe-Pyi POS",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    const rawError = data.error?.metadata?.raw || JSON.stringify(data);
    const errMsg = data.error?.message || `API error ${response.status}`;
    console.error("=== API ERROR ===");
    console.error("Status:", response.status);
    console.error("Error message:", errMsg);
    console.error("Raw error:", rawError);
    console.error("Request body (truncated):", body.substring(0, 500));
    throw new Error(errMsg);
  }

  return data;
}

async function runToolLoop(messages) {
  let msgs = messages;

  for (let step = 0; step < 5; step++) {
    console.log(`\n=== Step ${step} ===`);

    // Only send tools on the FIRST step. After that, no tools → model must respond with text.
    const data = await callOpenRouter(msgs, { includeTools: step === 0 });
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (!message) {
      return "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
    }

    console.log(`Finish reason: ${choice.finish_reason}`);
    if (message.content)
      console.log(`Content: ${message.content.substring(0, 100)}`);
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        console.log(`Tool call: ${tc.function.name}(${tc.function.arguments})`);
      }
    }

    // No tool calls — model responded with text
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
    }

    // Build assistant message (use original content if present, otherwise null)
    const assistantMsg = {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.tool_calls,
    };

    // Execute all tool calls
    const toolMsgs = [];
    for (const tc of message.tool_calls) {
      const handler = toolHandlers[tc.function.name];
      if (!handler) {
        toolMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: `Unknown tool: ${tc.function.name}`,
          }),
        });
        continue;
      }
      try {
        const args = JSON.parse(tc.function.arguments);
        const result = await handler(args);
        toolMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        console.log(
          `[Tool result] ${tc.function.name}:`,
          JSON.stringify(result).substring(0, 100),
        );
      } catch (err) {
        console.error(`Error in ${tc.function.name}:`, err.message);
        toolMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err.message }),
        });
      }
    }

    msgs = [...msgs, assistantMsg, ...toolMsgs];
  }

  return "တောင်းပန်ပါတယ်။ အဆင့်များလွန်းလို့ ပြန်မဖြေနိုင်တော့ပါ။ ထပ်မေးပေးပါ။";
}

export async function askGemini(messages) {
  const history = convertHistory(messages.slice(0, -1));
  const userMessage =
    messages.length > 0 ? messages[messages.length - 1].text : "";

  console.log("\n========== CHATBOT REQUEST ==========");
  console.log("User:", userMessage);

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
