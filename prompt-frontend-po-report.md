# Frontend Task: Purchase Order (PO) Report Page

## Overview

Build 3 PO report pages/components similar to the existing Sale Report pages. The backend APIs are already implemented.

---

## API Endpoints

### 1. Overall PO Report
```
GET {{base_url}}/purchase-report?page=1&limit=10&status=&supplierId=&startDate=&endDate=
Authorization: Bearer {{jwt_token}}
```
**Permissions:** owner, admin

**Response:**
```json
{
  "success": true,
  "data": {
    "dateRange": { "startDate": "2026-01-01", "endDate": "2026-12-31" },
    "summary": {
      "totalPOs": 25,
      "totalAmount": 12500000,
      "totalProductsOrdered": 5000,
      "totalReceived": 3500,
      "totalRemaining": 1500,
      "statusBreakdown": {
        "pending": 5,
        "confirmed": 3,
        "arrived": 2,
        "completed": 12,
        "cancelled": 3
      }
    },
    "purchases": [
      {
        "_id": "...",
        "poNumber": "PO-2026-05-20-000001",
        "supplierId": { "_id": "...", "supplierName": "ABC Trading", "supplierCode": "ABC001", "contactNumber": "09-xxx" },
        "status": "completed",
        "totalAmount": 500000,
        "products": [
          {
            "inventoryId": "...",
            "productName": "သဲ",
            "productCode": "SAND001",
            "purchaseQuantity": 100,
            "receivedQuantity": 100,
            "buyingPrice": 5000,
            "remainingQuantity": 0  // virtual
          }
        ],
        "purchasedBy": { "_id": "...", "name": "Admin", "role": "owner" },
        "totalRemainingQuantity": 0  // computed
      }
    ],
    "pagination": { "currentPage": 1, "totalPages": 3, "totalItems": 25, "itemsPerPage": 10 }
  }
}
```

### 2. Purchase Product Report
```
GET {{base_url}}/purchase-report/products?page=1&limit=10&supplierId=&category=&startDate=&endDate=&sortBy=totalOrdered&sortOrder=desc
Authorization: Bearer {{jwt_token}}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dateRange": { "startDate": null, "endDate": null },
    "totals": {
      "totalOrdered": 5000,
      "totalReceived": 3500,
      "totalRemaining": 1500,
      "totalAmount": 25000000,
      "uniqueProducts": 50
    },
    "products": [
      {
        "inventoryId": "...",
        "productName": "သဲ",
        "productCode": "SAND001",
        "category": "Construction Materials",
        "subCategory": "Unknown",
        "brand": "Unknown",
        "unitOfMeasure": "ကျင်း",
        "totalOrdered": 100,
        "totalReceived": 75,
        "totalRemaining": 25,
        "totalAmount": 500000,
        "poCount": 8
      }
    ],
    "pagination": { "currentPage": 1, "totalPages": 5, "totalItems": 50, "itemsPerPage": 10 }
  }
}
```

### 3. Purchase Supplier Report
```
GET {{base_url}}/purchase-report/suppliers?page=1&limit=10&startDate=&endDate=&sortBy=totalAmount&sortOrder=desc
Authorization: Bearer {{jwt_token}}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dateRange": { "startDate": null, "endDate": null },
    "totals": {
      "totalSuppliers": 10,
      "totalPOs": 25,
      "totalAmount": 12500000,
      "totalOrdered": 5000,
      "totalReceived": 3500,
      "totalRemaining": 1500
    },
    "suppliers": [
      {
        "supplierId": "...",
        "supplierName": "ABC Trading",
        "supplierCode": "ABC001",
        "contactNumber": "09-xxx",
        "totalPOs": 10,
        "totalAmount": 5000000,
        "totalOrdered": 2000,
        "totalReceived": 1800,
        "totalRemaining": 200,
        "lastPODate": "2026-05-15T00:00:00.000Z"
      }
    ],
    "pagination": { "currentPage": 1, "totalPages": 1, "totalItems": 10, "itemsPerPage": 10 }
  }
}
```

---

## UI Requirements

### Navigation
- Add "Purchase Report" menu item (or sub-item under "Reports")
- Show 3 tabs or sub-pages:
  1. **Overview** — Overall PO Report
  2. **By Product** — Purchase Product Report
  3. **By Supplier** — Purchase Supplier Report

### Page 1: PO Overview

**Filters bar** (at top):
- Date range picker (startDate, endDate)
- Status dropdown: All | Pending | Confirmed | Arrived | Completed | Cancelled
- Supplier search/select (optional)
- Search button / auto-submit on change

**Summary Cards** (row of stat cards):
- Total POs (count)
- Total Amount (formatted as currency, e.g., 12,500,000 MMK)
- Total Products Ordered
- Total Received
- Total Remaining
- Status Breakdown (maybe as a small pie chart or color-coded badges)

**Data Table** (paginated):
| PO Number | Supplier | Status | Total Amount | Products Count | Received | Remaining | Created By | Date |
|-----------|----------|--------|-------------|----------------|----------|-----------|------------|------|
| PO-2026-... | ABC Trading | ✅ Completed | 500,000 | 10 | 100/100 | 0 | Admin | 2026-05-20 |

- Status as color-coded badges:
  - `pending` → 🟡 Yellow
  - `confirmed` → 🔵 Blue
  - `arrived` → 🟠 Orange
  - `completed` → 🟢 Green
  - `cancelled` → 🔴 Red
- Click row to expand and show product details (inventoryId, productName, productCode, purchaseQuantity, receivedQuantity, remainingQuantity, buyingPrice)
- Click PO Number to navigate to PO detail page (existing)

### Page 2: By Product

**Filters bar:**
- Date range picker
- Supplier dropdown (optional)
- Category dropdown (optional)
- Sort by: totalOrdered | totalReceived | totalAmount
- Sort order: asc | desc

**Summary Cards:**
- Total Unique Products
- Total Ordered (all products combined)
- Total Received
- Total Remaining
- Total Amount

**Data Table:**
| Product Name | Product Code | Category | Unit | Total Ordered | Total Received | Total Remaining | Total Amount | PO Count |
|--------------|-------------|----------|------|--------------|----------------|----------------|-------------|----------|
| သဲ | SAND001 | Construction | ကျင်း | 100 | 75 | 25 | 500,000 | 8 |

- Progress bar for Received/Ordered ratio (e.g., 75/100 = 75%)
- Click row to see which POs this product appears in (optional drill-down)

### Page 3: By Supplier

**Filters bar:**
- Date range picker
- Sort by: totalAmount | totalPOs | totalOrdered
- Sort order: asc | desc

**Summary Cards:**
- Total Suppliers
- Total POs
- Total Amount
- Total Ordered
- Total Received
- Total Remaining

**Data Table:**
| Supplier Name | Code | Contact | Total POs | Total Amount | Total Ordered | Total Received | Total Remaining | Last PO Date |
|--------------|------|---------|-----------|-------------|--------------|----------------|----------------|-------------|
| ABC Trading | ABC001 | 09-xxx | 10 | 5,000,000 | 2,000 | 1,800 | 200 | 2026-05-15 |

- Click supplier name to filter Overview page by that supplier

---

## Component Structure Suggestion

```
src/
  pages/
    PurchaseReport/
      PurchaseReportPage.jsx        # Tab container with 3 tabs
      OverviewTab.jsx                # Overall PO Report
        PurchaseSummaryCards.jsx     # Stat cards
        PurchaseFilters.jsx          # Filter bar
        PurchaseTable.jsx           # Paginated PO table
        PurchaseDetailExpand.jsx    # Expanded product rows
      ProductTab.jsx                 # Product-level report
        ProductSummaryCards.jsx
        ProductFilters.jsx
        ProductTable.jsx
      SupplierTab.jsx                # Supplier-level report
        SupplierSummaryCards.jsx
        SupplierFilters.jsx
        SupplierTable.jsx
  hooks/
    usePurchaseReport.js            # API call hooks
  services/
    purchaseReportApi.js            # Axios/API service functions
```

---

## API Service Functions (purchaseReportApi.js)

```javascript
// Overall report
export const getPurchaseReport = (params) => {
  // params: { page, limit, status, supplierId, startDate, endDate }
  return api.get("/purchase-report", { params });
};

// Product report
export const getPurchaseProductReport = (params) => {
  // params: { page, limit, supplierId, category, startDate, endDate, sortBy, sortOrder }
  return api.get("/purchase-report/products", { params });
};

// Supplier report
export const getPurchaseSupplierReport = (params) => {
  // params: { page, limit, startDate, endDate, sortBy, sortOrder }
  return api.get("/purchase-report/suppliers", { params });
};
```

---

## Implementation Notes

1. **Date range:** Use a date range picker library (e.g., react-datepicker) that outputs `startDate` and `endDate` strings (YYYY-MM-DD format).
2. **Currency formatting:** All monetary values are in MMK (Myanmar Kyat). Format with commas: `new Intl.NumberFormat("my-MM").format(amount)`.
3. **Pagination:** All 3 APIs support `page` and `limit` query params and return `pagination` in response.
4. **Empty state:** Show "No data" message when response has empty arrays.
5. **Loading state:** Show spinner/skeleton while fetching.
6. **Error state:** Show error message with retry button.
7. **Responsive:** Tables should be horizontally scrollable on mobile.
8. **Export (optional):** Add "Export to Excel" button that re-fetches all data (no pagination) and downloads as XLSX.
