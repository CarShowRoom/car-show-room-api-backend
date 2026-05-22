import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const tools = [
  {
    functionDeclarations: [
      {
        name: "getDailySales",
        description:
          "Get daily sales summary for a specific date. Returns total orders, total revenue, and payment breakdown.",
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description:
                "Date in YYYY-MM-DD format. If not provided, defaults to today.",
            },
          },
        },
      },
      {
        name: "getTopProducts",
        description:
          "Get top selling products within a date range. Returns product name, total quantity sold, and total revenue.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of top products to return (default: 5).",
            },
            startDate: {
              type: "string",
              description:
                "Start date in YYYY-MM-DD format (optional, default: last 30 days).",
            },
            endDate: {
              type: "string",
              description:
                "End date in YYYY-MM-DD format (optional, default: today).",
            },
          },
        },
      },
      {
        name: "getLowStockItems",
        description:
          "Get inventory items with stock below reorder point. Returns product details, current stock, and reorder info.",
        parameters: {
          type: "object",
          properties: {
            threshold: {
              type: "number",
              description:
                "Stock threshold override (optional, default: uses inventory reorderPoint).",
            },
          },
        },
      },
      {
        name: "getMonthlySales",
        description:
          "Get monthly sales report. Returns total orders, total revenue, average order value, and busiest day.",
        parameters: {
          type: "object",
          properties: {
            month: {
              type: "number",
              description:
                "Month number 1-12. If not provided, defaults to current month.",
            },
            year: {
              type: "number",
              description:
                "Year (e.g. 2026). If not provided, defaults to current year.",
            },
          },
        },
      },
      {
        name: "getExpenseSummary",
        description:
          "Get expense summary within a date range, optionally filtered by category. Returns total expenses and category breakdown.",
        parameters: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in YYYY-MM-DD format (required).",
            },
            endDate: {
              type: "string",
              description: "End date in YYYY-MM-DD format (required).",
            },
            category: {
              type: "string",
              description:
                "Filter by expense category (optional). If omitted, returns all categories.",
            },
          },
          required: ["startDate", "endDate"],
        },
      },
    ],
  },
];

const systemInstruction = `You are a helpful POS assistant for i-max POS system.

RULES:
- Answer in Myanmar language (Burmese).
- Use the available tools when the user asks about sales, products, stock, or expenses.
- If a tool returns empty data, say "ဒီအချိန်အတွင်း အချက်အလက်မရှိသေးပါ" (no data for this period).
- If the user asks something outside POS or no tool is available, say "ဒီအကြောင်းအရာအတွက် ကျွန်တော်မသိပါ၊ POS နဲ့ဆိုင်တဲ့အကြောင်းတွေပဲ ဖြေပေးနိုင်ပါတယ်" (I only answer POS-related questions).
- Be concise, professional, and friendly.
- Use proper Myanmar honorifics and sentence structure.
- Format currency amounts in MMK with commas (e.g. 150,000 MMK).
- If user greets (မင်္ဂလာပါ, ဟိုင်း, etc.), greet back in Myanmar.`;

function convertHistoryToGeminiFormat(messages) {
  const contents = [];
  for (const msg of messages) {
    contents.push({
      role: msg.role,
      parts: [{ text: msg.text }],
    });
  }
  return contents;
}

export async function askGemini(messages, functionHandlers) {
  const historyMessages = messages.slice(0, -1);
  const userMessage =
    messages.length > 0 ? messages[messages.length - 1].text : "";

  const history = convertHistoryToGeminiFormat(historyMessages);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
    tools,
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  const response = result.response;

  const functionCalls = response.functionCalls();
  if (functionCalls && functionCalls.length > 0) {
    const functionCall = functionCalls[0];
    const handler = functionHandlers[functionCall.name];
    if (!handler) {
      throw new Error(`Unknown function: ${functionCall.name}`);
    }

    let functionResult;
    try {
      functionResult = await handler(functionCall.args);
    } catch (error) {
      functionResult = { error: error.message };
    }

    const result2 = await chat.sendMessage([
      {
        functionResponse: {
          name: functionCall.name,
          response: { result: functionResult },
        },
      },
    ]);

    return result2.response.text();
  }

  const text = response.text();
  return text || "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
}
