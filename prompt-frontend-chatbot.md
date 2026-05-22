# Frontend Task: AI Chatbot Page

## Overview

Gemini AI-powered chatbot for i-max POS — **owner only**. Uses Tool Calling (function calling) to query database: sales, products, stock, expenses. Answers in Myanmar language. Last 10 messages history saved per owner.

---

## API Endpoints

### 1. Chat (Ask Question)

```
POST {{base_url}}/chatbot
Authorization: Bearer {{jwt_token}}
Content-Type: application/json

{ "message": "ဒီနေ့ရောင်းရတာဘယ်လောက်လဲ" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reply": "ဒီနေ့ စုစုပေါင်းရောင်းရငွေ 150,000 MMK ရှိပါတယ်။ အမိန့်စုစုပေါင်း ၁၂ ခု၊
ငွေသားပေးချေမှု ၁၀ ခု၊ အကြွေး ၂ ခု ရှိပါတယ်။ ကုန်ပစ္စည်း ၂၅ မျိုး ရောင်းချရပါတယ်။"
  }
}
```

**Permissions:** owner

### 2. Get Chat History

```
GET {{base_url}}/chatbot
Authorization: Bearer {{jwt_token}}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      { "role": "user", "text": "မင်္ဂလာပါ", "createdAt": "2026-05-22T10:00:00.000Z" },
      { "role": "model", "text": "မင်္ဂလာပါ...", "createdAt": "2026-05-22T10:00:02.000Z" }
    ]
  }
}
```

### 3. Clear Chat History

```
DELETE {{base_url}}/chatbot
Authorization: Bearer {{jwt_token}}
```

---

## UI Requirements

### Page: AI Chatbot

**Route:** `/chatbot`

**Layout (full page, not modal):**

```
+-------------------------------------------+
|  AI Chatbot                    [Clear] 🔄 |
+-------------------------------------------+
|                                           |
|  [Bot] မင်္ဂလာပါ။ POS စနစ်နဲ့ပတ်သက်     |
|         တဲ့အကြောင်းတွေ မေးမြန်းနိုင်ပါတယ်။  |
|                                           |
|  [Bot] ဒီနေ့ရောင်းရငွေ 150,000 MMK...    |
|                                           |
|  [You] ဒီလကုန်ကျစရိတ်ဘယ်လောက်လဲ          |
|                                           |
|  [Bot] ဒီလမှာ စုစုပေါင်းကုန်ကျစရိတ်     |
|         2,500,000 MMK ရှိပါတယ်...         |
|                                           |
|                                           |
|  +---------------------------------------+ |
|  | မေးခွန်းရိုက်ထည့်ပါ...       [Send] ➤ | |
|  +---------------------------------------+ |
+-------------------------------------------+
```

**Message Bubbles:**
- **Bot messages:** Left-aligned, gray/light background, bot icon/avatar
- **User messages:** Right-aligned, blue/primary color background
- Show timestamp on hover (e.g., "10:30 AM")
- Loading dots while waiting for reply

**Input Area (sticky bottom):**
- Text input (multiline, max 500 chars)
- Send button (disabled when empty or loading)
- Enter to send, Shift+Enter for newline

**Header:**
- Title: "AI Chatbot"
- Clear button (with confirmation: "မှတ်တမ်းအားလုံးရှင်းမှာသေချာလား?")
- Refresh button (reload history from API)

**Empty State (new session):**
- Bot welcome message: "မင်္ဂလာပါ။ i-max POS စနစ်အတွက် AI အကူအညီဖြစ်ပါတယ်။ ရောင်းအား၊ ကုန်ပစ္စည်း၊ စတော့၊ ကုန်ကျစရိတ်တွေအကြောင်း မေးမြန်းနိုင်ပါတယ်။"
- Example questions below as suggestion chips:
  - "ဒီနေ့ရောင်းရတာဘယ်လောက်လဲ"
  - "အရောင်းအကောင်းဆုံးကုန်ပစ္စည်းပြစမ်း"
  - "ကုန်ချင်းပါတဲ့ပစ္စည်းတွေပြစမ်း"

**Loading State:**
- Loading dots animation (3 bouncing dots) in a bot message bubble

**Error State:**
- Error message bubble (red/orange) with retry button
- "ဖြေဆိုရာတွင်အမှားရှိခဲ့ပါတယ်။ ပြန်ကြိုးစားပါ။"

---

## Component Structure Suggestion

```
src/
  pages/
    Chatbot/
      ChatbotPage.jsx              # Main layout: header + messages + input
        ChatbotMessageList.jsx     # Scrollable message list
          ChatbotMessage.jsx       # Single message bubble (user/bot)
          ChatbotLoadingDots.jsx   # Loading animation
        ChatbotInput.jsx           # Text input + send button
        ChatbotSuggestionChips.jsx # Example question chips
        ChatbotHeader.jsx          # Title + clear/refresh buttons
        ClearConfirmModal.jsx      # Confirmation modal for clear
  hooks/
    useChatbot.js                  # API call hooks + state management
  services/
    chatbotApi.js                  # Axios/API service functions
```

---

## API Service Functions (chatbotApi.js)

```javascript
export const sendMessage = (message) => api.post("/chatbot", { message });
export const getChatHistory = () => api.get("/chatbot");
export const clearChatHistory = () => api.delete("/chatbot");
```

---

## Implementation Notes

1. **Auto-scroll:** Scroll to bottom when new message arrives (unless user scrolled up manually)
2. **Markdown:** Bot replies may contain simple markdown (bold, lists) — render with a lightweight markdown parser
3. **History on mount:** Call `GET /chatbot` on page load to restore last session
4. **10 message limit:** Backend auto-trims to 10 messages. Frontend just saves and restores all messages as-is
5. **Suggestion chips:** Clickable, auto-fills input and sends
6. **Responsive:** Full width on mobile, max-width 800px centered on desktop
7. **Keyboard:** Enter to send, Shift+Enter for newline
8. **Navigation:** Add "AI Chatbot" menu item under owner role only
