# Frontend Task: Quotation (ယာယီ Order) Feature

## Overview

Quotation is a **draft order** — same body as `POST /order`, but **no stock deduction** and **no payment processing**. The user creates a quotation first, shows it to the customer, then later converts it to a real order.

**Key difference from order:** Quotation saves product snapshots (productName, productCode, unitPrice at creation time). Order API re-computes prices from current inventory data.

---

## API Endpoints

### 1. Create Quotation
```
POST {{base_url}}/quotation
Authorization: Bearer {{jwt_token}}
Content-Type: application/json

{
  "saleType": "storefront",
  "storefrontId": "STOREFRONT_ID",
  "customerName": "ဦးဘ",
  "customerPhone": "09-123456789",
  "note": "ဒီကိုအရင်ပို့ပေးပါ",
  "ordersProducts": [
    {
      "inventoryId": "INVENTORY_ID",
      "unit": "မူး",
      "quantity": 5
    }
  ],
  "subTotal": 3500,
  "tax": 0,
  "discount": 0,
  "finalAmount": 3500
}
```
**Response:** `{ success: true, data: { quotationNumber: "QT-20260520-000001", status: "draft", ... } }`

**Permissions:** owner, admin, cashier

**Notes:**
- `saleType` = `"storefront"` or `"direct-sale"`
- For direct-sale, omit `storefrontId`
- `ordersProducts[].unit` is optional (only if using UOM conversion)
- `subTotal`, `finalAmount` are optional — if omitted, auto-calculated from prices
- Auto-generates `quotationNumber` = `QT-YYYYMMDD-NNNNNN`

### 2. Get All Quotations
```
GET {{base_url}}/quotation?status=draft&saleType=storefront&page=1&limit=10&startDate=2026-01-01&endDate=2026-12-31
Authorization: Bearer {{jwt_token}}
```
**Permissions:** owner, admin, cashier

**Query params:** status (`draft|converted|cancelled`), saleType, page, limit, startDate, endDate, sortBy, sortOrder

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": { "totalQuotations": 10, "totalAmount": 35000, "totalProducts": 25 },
    "quotations": [{ "_id": "...", "quotationNumber": "QT-20260520-000001", "status": "draft", "finalAmount": 3500, "products": [...], "customerName": "ဦးဘ", "createdAt": "..." }],
    "pagination": { "currentPage": 1, "totalPages": 1, "totalItems": 10, "itemsPerPage": 10 }
  }
}
```

### 3. Get Quotation By ID
```
GET {{base_url}}/quotation/QUOTATION_ID
Authorization: Bearer {{jwt_token}}
```
**Response:** `{ success: true, data: { quotation } }` — populated with storefrontId (name, code) and products.inventoryId (productName, productCode, SKU, sellingPrice, unitOfMeasure)

### 4. Update Quotation
```
PATCH {{base_url}}/quotation/QUOTATION_ID
Authorization: Bearer {{jwt_token}}
Content-Type: application/json

{
  "customerName": "ဦးဘကြီး",
  "finalAmount": 4000,
  "discount": 500
}
```
**Permissions:** owner, admin, cashier

**Rules:** Only `draft` quotations can be updated. Allowed fields: customerName, customerPhone, note, products, subTotal, tax, discount, finalAmount, saleType, storefrontId. If `products` is sent, UOM conversion is re-processed server-side.

### 5. Delete Quotation (Soft Delete)
```
DELETE {{base_url}}/quotation/QUOTATION_ID
Authorization: Bearer {{jwt_token}}
```
**Permissions:** owner, admin

### 6. Mark Quotation as Converted
```
PATCH {{base_url}}/quotation/QUOTATION_ID/convert-to-order
Authorization: Bearer {{jwt_token}}
Content-Type: application/json

{
  "convertedOrderId": "ORDER_ID_FROM_POST_ORDER"
}
```
**Permissions:** owner, admin, cashier

**This is NOT the convert endpoint — it only marks the status.** The actual order creation is done by the frontend via `POST /order` first (see Convert Flow below).

---

## Convert Quotation → Order Flow (Frontend Logic)

This is the most important part. The frontend handles the full conversion:

```
Step 1: Load quotation data
  GET /quotation/:id

Step 2: Display editable order form
  - Show all quotation fields pre-filled
  - Let user edit: discount, tax, finalAmount, paidAmount
  - Let user choose: paymentType ("paid" | "credit"), paymentMethod ("cash" | "bank_transfer" | "mobile_payment" | "card")
  - If paymentType = "credit", show creditPersonId selector

Step 3: Create the real order
  POST /order
  Body: {
    saleType: "storefront" (from quotation),
    storefrontId: (from quotation),
    customerName, customerPhone, note: (from quotation),
    ordersProducts: [
      {
        inventoryId: product.inventoryId,
        unit: product.unit,      // pass the UOM unit if used
        quantity: product.quantity
      }
    ],
    subTotal: (from user edit or quotation),
    tax: (from user edit or quotation),
    discount: (from user edit or quotation),
    finalAmount: (from user edit or quotation),
    paidAmount: (user input - how much the customer paid),
    paymentType: (user choice),
    paymentMethod: (user choice),
    creditPersonId: (only if paymentType = "credit")
  }

Step 4: Mark quotation as converted
  PATCH /quotation/:id/convert-to-order
  Body: { "convertedOrderId": "ORDER_ID" }
```

**Important:** The quotation's `products` array contains snapshots (productName, productCode, factor, baseQuantity, unitPrice at creation time). When building the `ordersProducts` for `POST /order`, only send `{ inventoryId, unit, quantity }` — the server re-computes prices/quantities from current inventory data.

---

## UI Requirements

### Page 1: Quotation List

**Route:** `/quotations`

**Filters bar:**
- Status dropdown: All | Draft | Converted | Cancelled
- Sale type dropdown: All | Storefront | Direct-Sale
- Date range picker (startDate, endDate)
- Search/filter button

**Summary Cards:**
- Total Quotations (count)
- Total Amount (sum of finalAmount, formatted as MMK)
- Total Products (sum of all product counts)

**Data Table:**
| Quotation # | Customer | Sale Type | Products | Amount | Status | Created By | Date | Actions |
|-------------|----------|-----------|----------|--------|--------|------------|------|---------|
| QT-2026-... | ဦးဘ | Storefront | 3 items | 3,500 | 🟡 Draft | Admin | 2026-05-20 | [View] [Edit] [Convert] [Delete] |

- Status badges:
  - `draft` → 🟡 Yellow / Warning
  - `converted` → 🟢 Green / Success
  - `cancelled` → 🔴 Red / Danger
- Click row → navigate to Quotation Detail page
- "Convert" button shown only for `draft` quotations
- "Delete" shown only for owner/admin

**Pagination** at bottom (`GET /quotation?page=1&limit=10`)

### Page 2: Create/Edit Quotation

**Route:** `/quotations/new` | `/quotations/:id/edit`

This form is **identical to the Create Order form** with one difference: **no stock is deducted**.

**Fields:**
1. **Sale Type** — radio/select: "Storefront" | "Direct-Sale"
2. **Storefront** — dropdown (required if storefront, hidden if direct-sale)
3. **Customer Info** — name (text), phone (text), note (textarea) — all optional
4. **Product List** — add/remove products:
   - Inventory search/select
   - UOM unit selector (if inventory has uomConversions)
   - Quantity input
   - Unit price auto-calculated (from inventory sellingPrice / UOM factor)
   - Line total = quantity × unitPrice
5. **Totals** — auto-calculated:
   - SubTotal = sum of line totals
   - Tax (user editable, default 0)
   - Discount (user editable, default 0)
   - FinalAmount = SubTotal + Tax - Discount (auto, but user can override)
6. **Save button** → `POST /quotation` or `PATCH /quotation/:id`

**Validation:**
- At least 1 product required
- Quantity ≥ 1
- FinalAmount ≥ 0
- If `unit` is specified for a product, inventory must have matching `uomConversions[].unit`

### Page 3: Quotation Detail & Convert

**Route:** `/quotations/:id`

**View Mode:**
- Show all quotation data (read-only)
- Products table with: No. | Product Name | Code | Unit | Qty | Unit Price | Line Total
- Totals section: SubTotal, Tax, Discount, FinalAmount
- Status badge
- If `converted`, show link to the converted order

**Convert Button** (only for `draft` status):

Clicking "Convert to Order" opens a **modal or new page** with:

1. **Quotation data pre-filled** (read-only reference)
2. **Editable payment fields:**
   - Discount (pre-filled from quotation, user can change)
   - Tax (pre-filled, user can change)
   - FinalAmount (auto-calculated or user can override)
   - Payment Type: radio "Paid" | "Credit"
   - Payment Method: dropdown (cash | bank_transfer | mobile_payment | card)
   - Paid Amount: number input (default = FinalAmount)
   - Credit Person: search/select dropdown (only shown if Payment Type = "Credit")
3. **Confirm button** — triggers:
   - `POST /order` with full body
   - On success → `PATCH /quotation/:id/convert-to-order` with the order ID
   - On success → redirect to order detail page or show success

**Cancel Quotation** button:
- Changes status to `cancelled` (use `PATCH /quotation/:id` with `{ status: "cancelled" }`)
- Or use soft delete

---

## Component Structure Suggestion

```
src/
  pages/
    Quotation/
      QuotationListPage.jsx          # List with filters, summary, table
        QuotationSummaryCards.jsx
        QuotationFilters.jsx
        QuotationTable.jsx
      QuotationFormPage.jsx          # Create / Edit (shared with order form)
        QuotationProductList.jsx     # Product rows with UOM selector
        QuotationTotals.jsx          # SubTotal, Tax, Discount, FinalAmount
      QuotationDetailPage.jsx        # View + Convert
        QuotationConvertModal.jsx    # Convert to order modal
  hooks/
    useQuotations.js                 # API call hooks
  services/
    quotationApi.js                  # Axios/API service functions
```

**Reuse existing order form components if possible** — the quotation form body is identical to the order form.

---

## API Service Functions (quotationApi.js)

```javascript
export const createQuotation = (data) => api.post("/quotation", data);
export const getQuotations = (params) => api.get("/quotation", { params });
export const getQuotationById = (id) => api.get(`/quotation/${id}`);
export const updateQuotation = (id, data) => api.patch(`/quotation/${id}`, data);
export const deleteQuotation = (id) => api.delete(`/quotation/${id}`);
export const markQuotationAsConverted = (id, convertedOrderId) =>
  api.patch(`/quotation/${id}/convert-to-order`, { convertedOrderId });
```

**Order service (for convert flow):**
```javascript
export const createOrder = (data) => api.post("/order", data);
```

---

## Implementation Notes

1. **Currency formatting:** MMK — use `new Intl.NumberFormat("my-MM").format(amount)`
2. **Date formatting:** Show `createdAt` as readable date (e.g., "20 May 2026")
3. **Pagination:** All list endpoints support `page` & `limit` and return `pagination` object
4. **Empty state:** "No quotations found" with create button
5. **Loading state:** Skeleton/spinner while fetching
6. **Error state:** Error message with retry
7. **Convert flow is async:** Show loading state during `POST /order` + `PATCH convert-to-order`. Handle failure gracefully (order may have been created but mark failed — show "Order created but failed to mark quotation. You can manually mark it.")
8. **UOM fields:** When creating quotation with `unit`, the server auto-converts. The frontend should show the UOM selector if the inventory item has `uomConversions` (available from `GET /inventory/:id` or inventory list)
9. **Responsive:** Tables should scroll horizontally on mobile
10. **Navigation:** Add "Quotations" menu item — show count badge for draft quotations (optional)
