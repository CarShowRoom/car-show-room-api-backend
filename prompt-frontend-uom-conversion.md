# Frontend Task: Unit of Measure (UOM) Conversion UI

## Overview

UOM Conversion allows products to be sold in different units than the base stock unit. Example: inventory tracks sand in "ကျင်း" (base unit), but customers can buy in "မူး" (sub-unit, 1 ကျင်း = 10 မူး).

**Convention:** `factor` = number of sub-units per base unit. E.g., `{ unit: "မူး", factor: 10 }` means 1 ကျင်း = 10 မူး.

The base unit (`unitOfMeasure`) is what the product is stocked in. Sub-units (`uomConversions[]`) allow selling in smaller/larger quantities. Auto-conversion happens server-side in `POST /order`, `POST /quotation`, and `PATCH /order/add-items`.

---

## Data Model

### Inventory (already implemented)
```json
{
  "unitOfMeasure": "ကျင်း",
  "uomConversions": [
    { "unit": "မူး", "factor": 10, "isDefaultSellingUnit": true },
    { "unit": "စိတ်", "factor": 5 }
  ]
}
```

### OrderProduct subdocument (auto-computed)
```json
{
  "inventoryId": "...",
  "unit": "မူး",
  "factor": 10,
  "quantity": 5,         // quantity in the selected unit
  "baseQuantity": 0.5,   // quantity / factor — used for stock deduction
  "unitPrice": 700,      // sellingPrice / factor — price per unit
  "subTotal": 3500       // quantity * unitPrice
}
```

**Key:** Stock is always deducted in `baseQuantity` (base unit), not the displayed `quantity`. The order stores both so the UI can show the customer-friendly unit and quantity.

---

## API Endpoints

### 1. Create Inventory with UOM
```
POST {{base_url}}/inventory (multipart/form-data)
Fields:
  unitOfMeasure: "ကျင်း"
  uomConversions: [{"unit":"မူး","factor":10,"isDefaultSellingUnit":true}]
  ... other inventory fields
```

### 2. Update Inventory UOM
```
PATCH {{base_url}}/inventory/:id (application/json)
Body: { "uomConversions": [{ "unit": "မူး", "factor": 10, "isDefaultSellingUnit": true }] }
```

### 3. Create Order with UOM
```
POST {{base_url}}/order (application/json)
Body: {
  "storefrontId": "...",
  "ordersProducts": [
    { "inventoryId": "...", "unit": "မူး", "quantity": 5 }
  ],
  "paidAmount": 3500
}
```
**If `unit` is omitted**, the system uses the base `unitOfMeasure` (no conversion).

### 4. Get Storefront Inventory (with quantityByUnit)
```
GET {{base_url}}/storefront-inventory?storefrontId=YOUR_STOREFRONT_ID
```
**Response includes:**
```json
{
  "inventoryId": { "productName": "သဲ", "unitOfMeasure": "ကျင်း", "uomConversions": [...] },
  "quantity": 50,
  "quantityByUnit": {
    "ကျင်း": 50,
    "မူး": 500,
    "စိတ်": 250
  }
}
```
`quantityByUnit` is a virtual field computed on-the-fly — `quantity` (base unit) × `factor` for each conversion.

---

## UI Requirements

### 1. Inventory Form — UOM Section

In the **Create/Edit Inventory form**, add a "Unit of Measure" section:

**Base Unit field:**
- Text input: `unitOfMeasure`
- Required, free-text (e.g., "ကျင်း", "အုတ်", "piece", "kg", "gallon")
- Label: "Base Unit (Stock Unit)"

**Conversion Units table** (below base unit):
- Table with columns: Unit Name | Factor | Default Selling Unit | Actions
- Unit Name: text input (e.g., "မူး", "liter")
- Factor: number input (min: 0.001, step: 0.01)
  - Factor = number of sub-units per 1 base unit
  - Example: factor=10 means 1 ကျင်း = 10 မူး
  - Example: factor=3.78 means 1 gallon = 3.78 liters
- Default Selling Unit: radio/checkbox (only one can be true)
  - If checked, this unit is pre-selected in the order form
  - If no conversion is marked as default, the base unit is the default
- Actions: Delete row button

**Validation:**
- No duplicate unit names allowed
- Conversion unit cannot be the same as base unit
- At least 1 conversion row? — No, UOM is optional
- Factor must be > 0

**Add Row button:** Adds a new empty row to the conversion table.

### 2. Order/Quotation Form — Unit Selector

When adding a product to an order or quotation, the UI should show a **Unit selector** if the inventory item has `uomConversions`:

**Product row in order form:**
```
| Product | Unit | Qty | Unit Price | Line Total |
|---------|------|-----|------------|------------|
| သဲ       | [မူး ▼] | 5   | 700        | 3,500      |
```

**Unit dropdown behavior:**
- Options: Base unit + all conversion units
- Default: The `isDefaultSellingUnit` conversion, or the base unit if none marked
- When user changes the unit:
  - Unit Price updates: `sellingPrice / factor`
    - Base unit factor = 1
    - Conversion unit factor = the conversion's factor
  - Line Total updates: `quantity × unitPrice`

**Read-only UOM display in order detail:**
- Show the unit next to quantity (e.g., "5 မူး")
- Show base quantity in parentheses (e.g., " (0.5 ကျင်း)") — optional, for admin reference

### 3. Storefront Inventory — quantityByUnit Display

In the **Storefront Inventory** list/detail page, show stock quantities in all available units:

```
Stock: 50 ကျင်း (500 မူး / 250 စိတ်)
```

Use `quantityByUnit` from the API response (already computed server-side).

### 4. Sale Report — Unit Display

In sale reports, show the unit as it was sold (from `order.ordersProducts[].unit`), not just the base unit.

---

## Component Structure Suggestion

```
src/
  components/
    UOM/
      UomConversionTable.jsx       # Reusable table for conversion units
        UomConversionRow.jsx       # Single row: unit, factor, isDefault
      ProductUnitSelector.jsx      # Dropdown for unit selection in order form
  hooks/
    useUomConversions.js           # Helper: compute unitPrice, lineTotal
  utils/
    unitHelpers.js                 # Format quantityByUnit display string
```

**Reuse `UomConversionTable.jsx`** in both InventoryForm and wherever UOM editing is needed.

---

## Utility Functions (unitHelpers.js)

```javascript
// Get available units for a product
export function getAvailableUnits(inventoryItem) {
  const units = [{ unit: inventoryItem.unitOfMeasure, factor: 1, isDefault: true }];
  if (inventoryItem.uomConversions?.length) {
    inventoryItem.uomConversions.forEach((c) => units.push({ ...c, isDefault: !!c.isDefaultSellingUnit }));
  }
  return units;
}

// Find the factor for a given unit
export function getFactor(inventoryItem, unit) {
  if (!unit || unit === inventoryItem.unitOfMeasure) return 1;
  const conversion = inventoryItem.uomConversions?.find((c) => c.unit === unit);
  return conversion?.factor || 1;
}

// Compute unit price for a given unit
export function getUnitPrice(inventoryItem, unit) {
  const factor = getFactor(inventoryItem, unit);
  return inventoryItem.sellingPrice / factor;
}

// Format quantityByUnit display string
export function formatQuantityByUnit(quantityByUnit) {
  if (!quantityByUnit) return "";
  return Object.entries(quantityByUnit)
    .map(([unit, qty]) => `${qty} ${unit}`)
    .join(" / ");
}
```

---

## API Service Functions (uomApi.js)

```javascript
// UOM is part of inventory — no separate endpoints needed
export const createInventory = (formData) => api.post("/inventory", formData, {
  headers: { "Content-Type": "multipart/form-data" },
});
export const updateInventory = (id, data) => api.patch(`/inventory/${id}`, data);
```

---

## Implementation Notes

1. **UOM is optional** — many products only have a base unit. Don't require conversions.
2. **Free-text units** — `unitOfMeasure` and `uomConversions[].unit` are free-text strings. No enum/dropdown.
3. **Factor precision** — Factors can be decimals (e.g., 3.78). Use `Number` type with 2+ decimal places allowed.
4. **Quantity in order form** — When unit is changed, keep the quantity value if possible; only reset if the user explicitly changes it.
5. **Stock check** — The server handles stock check in base units. The UI only needs to show available quantity (from `GET /storefront-inventory` which returns `quantity` in base unit and `quantityByUnit` in all units).
6. **Zero/negative stock** — Don't allow ordering more than available stock. Disable submit or show validation error.
7. **Storefront inventory list** — If the product has UOM conversions, show `quantityByUnit` in the table cell. If no conversions, just show `quantity` + base unit.
8. **Currency formatting:** MMK — use `new Intl.NumberFormat("my-MM").format(amount)`.
9. **Empty state:** Base unit always exists. Show "No conversions defined" message when `uomConversions` is empty.
10. **Loading/Error states:** Standard spinner/skeleton while fetching, error message with retry.

## See Also

- `postman-examples-uom-conversion.json` — 7 API call examples
- `src/models/inventory.model.js` — UOM schema definition
- `src/controllers/order.controller.js` — UOM auto-convert logic in createOrder
- `src/controllers/storefrontInventory.controller.js` — quantityByUnit virtual
