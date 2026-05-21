# Frontend Task: Activity Log (မှတ်တမ်း) Feature

## Overview

Activity Log records all user actions across the system — create, update, delete, login, logout, status changes, payment records, quantity adjustments, etc. Logs are **read-only** (view/filter only) and **auto-delete after 180 days** (TTL index on MongoDB). Every log entry records **who did what, when, and from which IP**.

---

## API Endpoints

### 1. Get Activity Logs (paginated + filterable)

```
GET {{base_url}}/activity-log?page=1&limit=20&sortBy=createdAt&sortOrder=desc
Authorization: Bearer {{jwt_token}}
```

**Permissions:** owner, admin

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| sortBy | string | Field to sort by (default: `createdAt`) |
| sortOrder | string | `asc` or `desc` (default: `desc`) |
| admin | ObjectId | Filter by admin ID |
| action | string | Filter by action (create, update, delete, login, logout, create_payment, update_status, update_quantity, update_line_items, mark_converted) |
| feature | string | Filter by feature (order, inventory, purchase, grn, transfer, quotation, expense, credit, supplier, warehouse_stock, storefront_stock, warehouse_profile, storefront_profile, admin) |
| startDate | string | Start date (YYYY-MM-DD) |
| endDate | string | End date (YYYY-MM-DD) |

**Response:**
```json
{
  "success": true,
  "message": "Activity logs fetched successfully",
  "data": {
    "logs": [
      {
        "_id": "LOG_ID",
        "admin": { "_id": "ADMIN_ID", "name": "Admin Name", "role": "admin" },
        "action": "create",
        "feature": "order",
        "description": "Order ORD-20260520-000001 created - 15000 MMK",
        "targetId": "TARGET_ID",
        "targetModel": "Order",
        "metadata": { "saleType": "storefront", "finalAmount": 15000 },
        "ip": "::1",
        "createdAt": "2026-05-20T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 100,
      "itemsPerPage": 20
    }
  }
}
```

### 2. Get Activity Log By ID

```
GET {{base_url}}/activity-log/LOG_ID
Authorization: Bearer {{jwt_token}}
```

**Permissions:** owner, admin

---

## UI Requirements

### Page: Activity Log List

**Route:** `/activity-logs`

**This is a single-page read-only view** — no create/edit/delete.

#### Filters Bar (at top):
- **Feature** — dropdown: All | order | inventory | purchase | grn | transfer | quotation | expense | credit | supplier | warehouse_stock | storefront_stock | warehouse_profile | storefront_profile | admin
- **Action** — dropdown: All | create | update | delete | login | logout | create_payment | update_status | update_quantity | update_line_items | mark_converted
- **Admin** — search/select dropdown (optional, for filtering by specific admin)
- **Date Range** — start date + end date pickers
- **Search / Apply** button

#### Summary Stats (optional, nice to have):
- Total logs count (matching current filter)
- Date range covered (earliest → latest log date in results)

#### Data Table:
| Timestamp | Admin | Action | Feature | Description | IP |
|-----------|-------|--------|---------|-------------|----|
| 20 May 2026, 10:30 AM | Admin Name | create | order | Order ORD-... created - 15000 MMK | ::1 |
| 20 May 2026, 10:25 AM | Admin Name | login | admin | Admin "Admin Name" logged in | 192.168.1.1 |

- **Timestamp** — relative time (e.g., "2 minutes ago") for recent + full date tooltip on hover
- **Action** — display as colored badge:
  - `create` → 🟢 green
  - `update` / `update_*` → 🔵 blue
  - `delete` → 🔴 red
  - `login` / `logout` → 🟣 purple
- **Feature** — display as a tag/badge (gray or subtle color)
- **Description** — main text, clickable row expands to show details
- **IP** — small monospace text

#### Expandable Row Detail:
Clicking a row expands to show:
- **Target ID:** `TARGET_ID` (linkable if known type — e.g., link to order detail if targetModel = "Order")
- **Target Model:** Order
- **Metadata:** (JSON rendered prettily)
  ```json
  { "saleType": "storefront", "finalAmount": 15000 }
  ```
- **Admin:** Admin Name (role: admin)
- **IP Address:** ::1
- **Created At:** 2026-05-20T10:30:00.000Z (full ISO)

#### Pagination:
Standard pagination at bottom. Page size: 20 (default), user can change to 50 or 100.

#### Empty State:
"No activity logs found matching your filters" with clear filters button.

#### Loading State:
Skeleton rows (5-10 shimmer placeholders).

#### Error State:
Error message with retry button.

---

## Component Structure Suggestion

```
src/
  pages/
    ActivityLog/
      ActivityLogListPage.jsx       # Main page: filters + table
        ActivityLogFilters.jsx      # Feature/action/admin/date filter bar
        ActivityLogTable.jsx         # Data table with expandable rows
          ActivityLogRow.jsx         # Single row
          ActivityLogDetail.jsx      # Expanded detail section
        ActivityLogPagination.jsx    # Page controls
  hooks/
    useActivityLogs.js              # API call hooks
  services/
    activityLogApi.js               # Axios/API service functions
```

---

## API Service Functions (activityLogApi.js)

```javascript
export const getActivityLogs = (params) => api.get("/activity-log", { params });
export const getActivityLogById = (id) => api.get(`/activity-log/${id}`);
```

---

## Implementation Notes

1. **Date formatting:** Show relative time for recent logs ("2 minutes ago", "1 hour ago"), full date+time for older. Tooltip on hover shows ISO timestamp.
2. **Action badges:** Use color-coded badges for each action type (green=create, blue=update, red=delete, purple=login/logout).
3. **Feature tags:** Gray/neutral tags, consistent naming.
4. **Admin filter dropdown:** Fetch admin list from existing admin/users endpoint (or use a searchable text input that sends `admin` query param).
5. **Expandable rows:** Click row to toggle detail panel (slide down animation). Only one row expanded at a time.
6. **Metadata display:** Render as a collapsible JSON tree or a simple key-value list (prettified).
7. **Pagination:** Show page X of Y, with page size selector (20/50/100). "Total items: N" text.
8. **Export (optional):** Add "Export to CSV" button that downloads the current filter result (frontend generates CSV from visible data or calls a dedicated export endpoint if available).
9. **Auto-refresh (optional):** Add a "Refresh" button and/or auto-refresh every 30 seconds.
10. **Responsive:** On mobile, show a card layout instead of table (timestamp, action badge, feature tag, description snippet).
11. **Empty state illustration:** Simple icon + "No activity logs" text.
12. **Navigation:** Add "Activity Logs" menu item — place under a "System" or "Settings" section in the sidebar.

## Possible Action Values

| action | Meaning |
|--------|---------|
| create | New record created |
| update | Record updated |
| delete | Record soft/hard deleted |
| login | Admin logged in |
| logout | Admin logged out |
| create_payment | Credit payment recorded |
| update_status | Status changed (PO, GRN, transfer) |
| update_quantity | Stock quantity adjusted (warehouse/storefront) |
| update_line_items | GRN line items updated |
| mark_converted | Quotation marked as converted |

## Possible Feature Values

| feature | Source |
|---------|--------|
| admin | Login / logout |
| order | Orders |
| inventory | Inventory items |
| purchase | Purchase orders |
| grn | Goods Received Notes |
| transfer | Inventory transfers |
| quotation | Quotations |
| expense | Expenses |
| credit | Credit payments |
| supplier | Supplier profiles |
| warehouse_stock | Warehouse stock adjustments |
| storefront_stock | Storefront stock adjustments |
| warehouse_profile | Warehouse profile CRUD |
| storefront_profile | Storefront profile CRUD |
