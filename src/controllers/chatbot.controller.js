import ChatSession from "../models/chatSession.model.js";
import { asyncErrorHandler } from "../utils/asyncErrorHandler.js";
import CustomError from "../utils/customError.js";
import { askGemini } from "../services/openrouter.service.js";

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

  let replyText;
  try {
    replyText = await askGemini(session.messages);
  } catch (err) {
    console.error("Chatbot API error:", err.message);
    session.messages = [{ role: "user", text: message.trim() }];
    try {
      replyText = await askGemini(session.messages);
    } catch (retryErr) {
      console.error("Chatbot retry also failed:", retryErr.message);
      replyText = "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။";
    }
  }

  if (replyText && replyText.includes("image.png")) {
    replyText = "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ကျေးဇူးပြု၍ ပြန်လည်မေးမြန်းပေးပါ။";
  }

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
