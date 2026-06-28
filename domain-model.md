# Domain Model: Vegetable Retail + Hotel Supply Business

---

## Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VEGETABLE BUSINESS                            │
├──────────────────┬──────────────────┬───────────────────────────────┤
│                  │                  │                               │
│  PROCUREMENT     │   INVENTORY      │     RETAIL SALES              │
│  (Sourcing, PO,  │   (StockBatch,   │     (Walk-in, Billing,        │
│   Supplier Mgt,  │   Freshness,     │      Weighing, Returns)       │
│   GRN)           │   Transfers)     │                               │
│                  │                  │                               │
├──────────────────┼──────────────────┼───────────────────────────────┤
│                  │                  │                               │
│  HOTEL SUPPLY    │   PRICING        │     QUALITY                   │
│  (Contracts,     │   (MRP Setting,  │     (Inspection, Grading,     │
│   Orders,        │   Margin,        │      QC Checks)               │
│   Delivery,      │   Markdown)      │                               │
│   Invoicing)     │                  │                               │
│                  │                  │                               │
├──────────────────┼──────────────────┼───────────────────────────────┤
│                  │                  │                               │
│  WASTE &         │   FINANCE        │     LOGISTICS                 │
│  SHRINKAGE       │   (Recon, P&L,   │     (Routes, Fleet,           │
│  (Spoilage,      │    Payments,     │      Dispatch, Schedules)     │
│   Disposal)      │    GST)          │                               │
│                  │                  │                               │
└──────────────────┴──────────────────┴───────────────────────────────┘
```

---

## Core Domain: Inventory (the heartbeat of the business)

### Explanation
Inventory is the central domain because everything revolves around produce that is alive, aging, and must be sold before it dies. All other contexts serve this core. The entire business succeeds or fails on how well it manages the mismatch between procurement timing, sales velocity, and spoilage.

---

## 1. PROCUREMENT Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **Supplier** | A vendor/farmer/mandi agent who supplies produce | Name, ContactInfo, Address, GSTIN, PaymentTerms, Rating, CategorySpecialization[] | SupplierId |
| **PurchaseOrder** | An order placed to a supplier for specific produce | PONumber, SupplierId, OrderDate, ExpectedDeliveryDate, Status, TotalCost, StoreId | POId |
| **GoodsReceiptNote** | Record of goods actually received against a PO | GRNNumber, POId, ReceivedDate, ReceivedBy, StoreId, Remarks | GRNId |
| **SupplierPayment** | Payment made to a supplier | PaymentId, SupplierId, Amount, PaymentDate, PaymentMode, PeriodFrom, PeriodTo | PaymentId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **PurchaseOrderLine** | ProduceId, Quantity (Weight), UnitOfMeasure, UnitCost, TotalCost | |
| **GRNLine** | POId, ProduceId, ExpectedQty, ReceivedQty, QualityGrade, RejectedQty, RejectReason | Rejected qty tracked separately |
| **SupplierRating** | DeliveryReliability, QualityConsistency, PriceCompetitiveness, Overall | 1-5 scale |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `POPlaced` | POId, SupplierId, Items[], TotalCost, ExpectedDate | A purchase order was created |
| `POConfirmed` | POId, SupplierId, ConfirmedDeliveryDate | Supplier acknowledged |
| `GRNPosted` | GRNId, POId, ReceivedItems[], RejectedItems[], StoreId | Goods received and recorded |
| `SupplierPaid` | PaymentId, SupplierId, Amount, Period | Payment processed |

### Invariants

- IN-PROC-01: A PO cannot be created for an inactive supplier
- IN-PROC-02: Total GRN received quantity ≤ PO quantity × 1.05 (5% variance tolerance for produce weight)
- IN-PROC-03: A PO must belong to exactly one Store
- IN-PROC-04: Rejected quantity on GRN must have a recorded reason

### Business Rules

- BR-PROC-01: High-value items (English veg, mushrooms) require PO approval from store manager
- BR-PROC-02: Daily procurement is placed before 6 PM for next-day delivery
- BR-PROC-03: Emergency procurement (< 2-hour lead time) requires manager override

---

## 2. INVENTORY Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **Produce** | A type of vegetable/fruit/mushroom in the catalog | Name, Category, ExpectedShelfLifeDays, DefaultUOM, HSNCode, StorageTempRange, IsSeasonal, SeasonMonths[] | ProduceId |
| **StockBatch** | A specific received lot of a produce item — the fundamental inventory unit | BatchId, ProduceId, SupplierId, StoreId, GRNId, ReceivedDate, ReceivedQty, AvailableQty, CostPrice, Grade, ExpiryDate, StorageLocation | BatchId |
| **Store** | A physical retail location | StoreId, Name, Address, ContactNo, ManagerId, OpeningHours, StorageCapacity | StoreId |
| **TransferOrder** | Inter-store stock movement | TransferId, SourceStoreId, DestStoreId, InitiatedDate, CompletedDate, Status, Reason | TransferId |
| **StockCount** | Physical inventory count event | CountId, StoreId, CountDate, CountedBy, Status (DRAFT/VERIFIED/CLOSED) | CountId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **UnitOfMeasure** | Value, Unit (kg/g/piece/bunch) | |
| **ShelfLife** | ExpectedDays, RemainingDays (computed) | |
| **StorageRequirement** | MinTemp, MaxTemp, Humidity, LightSensitivity | |
| **ProduceCategory** | COMMON_VEG, LEAFY_GREEN, ENGLISH_VEG, MUSHROOM, FRUIT | |
| **QualityGrade** | A (Premium), B (Standard), C (Aging), D (Spoiled) | |
| **TransferLineItem** | BatchId, ProduceId, TransferQty, UnitCost | Cost for valuation |
| **CountLineItem** | BatchId, ExpectedQty, ActualQty, Variance, Reason | |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `BatchCreated` | BatchId, ProduceId, StoreId, Qty, CostPrice, Grade | New stock enters the system |
| `BatchAdjusted` | BatchId, OldQty, NewQty, Reason (SALE/WASTE/TRANSFER/COUNT_ADJUST) | Quantity changed |
| `StockExpiring` | BatchId, ProduceId, RemainingQty, HoursUntilExpiry | Trigger at 20% shelf life remaining |
| `StockExpired` | BatchId, ProduceId, Qty, Value | Shelf life fully elapsed |
| `StockTransferred` | TransferId, SourceStore, DestStore, Items[] | Transfer completed |

### Invariants

- IN-INV-01: AvailableQty ≥ 0 for any StockBatch (never negative)
- IN-INV-02: AvailableQty = ReceivedQty - Σ(Sold) - Σ(Wasted) - Σ(TransferredOut) + Σ(TransferredIn)
- IN-INV-03: A StockBatch belongs to exactly one Store
- IN-INV-04: A TransferOrder's SourceStore ≠ DestStore
- IN-INV-05: Transfer quantity ≤ source store's AvailableQty at time of dispatch
- IN-INV-06: Each StockBatch must have a QualityGrade assigned

### Business Rules

- BR-INV-01: Produce with shelf life < 2 days cannot be transferred (too risky)
- BR-INV-02: Aged stock (>80% shelf life elapsed) auto-flagged as "Markdown Eligible"
- BR-INV-03: Stock > 100% shelf life auto-moved to Waste
- BR-INV-04: Mushroom and leafy green batches get daily dual count (11 AM and 5 PM)
- BR-INV-05: Full stock count for all stores every Sunday close of business

### Lifecycle: StockBatch

```
 ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌────────┐
 │ ORDERED │───→│ RECEIVED │───→│ AVAILABLE │───→│ CLOSED │
 └─────────┘    └──────────┘    └───────────┘    └────────┘
                    │                 │
                    │                 ├──→ SOLD (via sale line item)
                    │                 ├──→ TRANSFERRED_OUT
                    │                 ├──→ WASTED (spoiled/damaged)
                    │                 ├──→ EXPIRED (auto-closed)
                    │                 └──→ RETURNED (customer return → waste)
                    │
                    ▼
              [QC Check]
              Grade Assigned
```

---

## 3. RETAIL SALES Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **RetailTransaction** | A single B2C purchase at the counter | TransactionId, StoreId, Timestamp, CashierId, TotalAmount, PaymentMethod, ItemsCount | TransactionId |
| **CustomerReturn** | Customer returning produce | ReturnId, TransactionId, StoreId, ReturnDate, Reason, RefundAmount, ApprovedBy | ReturnId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **SaleLineItem** | LineNumber, BatchId, ProduceId, Quantity, UnitPrice, LineTotal, WeightAtSale | Weight captured at counter |
| **ReturnLineItem** | SaleLineItemId, ReturnQty, ReturnAmount, Condition (UNOPENED/SPOILED/DAMAGED) | |
| **PaymentDetail** | Method (CASH/UPI/CARD/CREDIT), Amount, ReferenceNo, TxnId | |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `RetailSaleCompleted` | TransactionId, StoreId, Items[], Total, Method, Timestamp | Walk-in sale done |
| `CustomerReturnProcessed` | ReturnId, TransactionId, Items[], Refund, Reason | Return accepted |
| `PriceOverridden` | TransactionId, ItemId, StandardPrice, ActualPrice, OverrideReason | Billing override (loyalty/bulk) |

### Invariants

- IN-RTL-01: Sum(SaleLineItem.Total) = Transaction.TotalAmount
- IN-RTL-02: Payment received ≥ Transaction.TotalAmount (allows exact change)
- IN-RTL-03: Each SaleLineItem must reference a valid BatchId with sufficient AvailableQty
- IN-RTL-04: CustomerReturn must reference a valid TransactionId
- IN-RTL-05: RefundAmount ≤ OriginalTransaction.TotalAmount

### Business Rules

- BR-RTL-01: No credit sales to retail customers (payment upfront only)
- BR-RTL-02: Returns accepted without question for items ≤ Rs. 50; above requires manager
- BR-RTL-03: Customer-returned produce immediately written off — cannot be resold
- BR-RTL-04: Bulk discount (≥5 kg same item) can apply at cashier discretion up to 5% off

---

## 4. HOTEL SUPPLY Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **HotelAccount** | A B2B customer (hotel, restaurant, caterer) | AccountId, Name, ContactInfo, Address, GSTIN, CreditLimit, CurrentOutstanding, Status, OnboardingDate | AccountId |
| **HotelContract** | Supply agreement with pricing terms | ContractId, AccountId, StartDate, EndDate, PaymentTermDays, DeliverySchedule, Status, AutoRenew | ContractId |
| **SalesOrder** | A specific delivery order from a hotel | OrderId, AccountId, ContractId, OrderDate, DeliveryDate, DeliveryTimeSlot, Status, Notes | OrderId |
| **DeliveryNote** | Proof of delivery with actual quantities | DNoteId, OrderId, DriverId, DispatchTime, DeliveryTime, ActualItems[], Signature | DNoteId |
| **DebitNote** | Quality/quantity adjustment reducing invoice | DebitNoteId, InvoiceId, Reason, Amount, SupportingProof | DebitNoteId |
| **CreditNote** | Additional charge or correction increasing invoice | CreditNoteId, InvoiceId, Reason, Amount | CreditNoteId |
| **Invoice** | Billing document for B2B delivery | InvoiceId, AccountId, PeriodFrom, PeriodTo, GrossAmount, NetAmount, GST, Status, DueDate | InvoiceId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **ContractLineItem** | ProduceId, AgreedPrice, MinQtyPerDelivery, MaxQtyPerDelivery | Per-produce pricing in contract |
| **OrderLineItem** | ProduceId, OrderedQty, UnitPrice (from contract), ExpectedGrade | |
| **DeliveryLineItem** | OrderLineId, ProduceId, OrderedQty, DeliveredQty, RejectedQty, RejectReason | Rejection documented |
| **DeliverySchedule** | DayOfWeek[], TimeSlot, StandingOrderQty[] | Weekly repeating pattern |
| **PaymentTerm** | CreditDays, LatePenalty%, DiscountForEarlyPayment% | |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `HotelOrderPlaced` | OrderId, AccountId, Items[], DeliveryDate | Hotel placed delivery request |
| `HotelOrderConfirmed` | OrderId, ConfirmedDispatchTime | Store accepted order |
| `HotelDeliveryDispatched` | DNoteId, OrderId, Items[], DriverInfo | Goods left store |
| `HotelDeliveryDelivered` | DNoteId, DeliveredItems[], RejectedItems[], Signature | Customer received |
| `HotelDeliveryRejected` | DNoteId, RejectedItems[], Reason | Full/partial rejection |
| `HotelOrderInvoiced` | InvoiceId, OrderId, Amount, DueDate | Invoice generated |
| `HotelPaymentReceived` | PaymentId, InvoiceId, Amount, Date | Payment collected |
| `PaymentOverdue` | InvoiceId, DaysOverdue, Amount, AccountId | Auto-triggered escalation |

### Invariants

- IN-HTL-01: A SalesOrder can only be created for a HotelAccount with an Active contract
- IN-HTL-02: DeliveredQty ≤ OrderedQty (cannot over-deliver)
- IN-HTL-03: Invoice Amount = Σ(DeliveredQty × UnitPrice) - DebitNotes + CreditNotes
- IN-HTL-04: CurrentOutstanding ≤ CreditLimit (block new orders if exceeded)
- IN-HTL-05: A HotelAccount cannot have two Active contracts for overlapping periods
- IN-HTL-06: Each DeliveryNote must have at least one delivery line item

### Lifecycle: SalesOrder

```
 ┌───────┐    ┌───────────┐    ┌──────────────────┐    ┌──────────┐    ┌───────┐
 │ DRAFT │───→│ PLACED    │───→│ PARTIALLY_DELVD  │───→│ DELIVERED│───→│ CLOSED│
 └───────┘    └───────────┘    └──────────────────┘    └──────────┘    └───────┘
                  │                                         │
                  ├──→ CANCELLED                             ├──→ INVOICED → PAID
                  │                                         │
                  └──→ REJECTED (by hotel)                  └──→ DISPUTED
```

### Business Rules

- BR-HTL-01: Order cutoff is 10 AM for same-day delivery; orders after 10 AM go to next day
- BR-HTL-02: New hotel accounts get 7-day credit for first 3 months
- BR-HTL-03: Credit period: < Rs. 50K/month = 15 days; Rs. 50K-2L = 30 days; > Rs. 2L = 45 days
- BR-HTL-04: Payment delay > 7 days beyond due → supply suspended
- BR-HTL-05: Payment delay > 15 days → contract termination process initiated
- BR-HTL-06: Delivery rejection requires documented reason AND receiving staff signature
- BR-HTL-07: Contract prices renegotiable if mandi rate swings > 30% in a rolling 7-day window
- BR-HTL-08: At least 70% of hotel order must be Grade A; remainder can be Grade B at 10% discount

---

## 5. PRICING Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **PriceList** | A set of prices active for a period/channel | PriceListId, Name, Channel (RETAIL/HOTEL), StoreId, ValidFrom, ValidTo, Status, CreatedBy | PriceListId |
| **PriceOverride** | Temporary deviation from standard price | OverrideId, PriceListItemId, OverridePrice, Reason, StartTime, EndTime, ApprovedBy | OverrideId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **PriceListItem** | ProduceId, UnitPrice, MinMargin%, MaxQtyForPrice (for bulk), Grade | |
| **MarginComponent** | PurchaseCost, HandlingCost%, WastageAllowance%, TargetMargin%, FinalPrice | Price build-up |
| **MarkdownRule** | ShelfLifePercentElapsed, DiscountPercent (e.g., 60% → 10%, 80% → 30%) | |
| **Channel** | RETAIL, HOTEL_CONTRACT, HOTEL_SPOT, BULK | Selling channel |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `PriceListActivated` | PriceListId, Channel, StoreId, ValidFrom | New prices go live |
| `PriceChanged` | ProduceId, OldPrice, NewPrice, Channel, Timestamp | Individual price update |
| `MarkdownApplied` | ProduceId, StoreId, BatchId, OriginalPrice, MarkedDownPrice, Reason | Aging stock discounted |
| `PriceDeactivated` | PriceListId, DeactivatedAt | Price list retired |

### Invariants

- IN-PRC-01: A store can have exactly ONE active retail PriceList per day
- IN-PRC-02: Retail UnitPrice ≥ PurchaseCost × (1 + MinimumMargin%)
- IN-PRC-03: MarkdownPrice ≤ OriginalPrice (cannot mark up)
- IN-PRC-04: Hotel contract price is fixed for contract duration (unless force majeure clause triggered)
- IN-PRC-05: A Produce can have multiple prices across channels simultaneously

### Business Rules

- BR-PRC-01: Minimum margin: Common veg = 20%, Leafy greens = 25%, English veg = 40%, Mushrooms = 40%, Fruits = 25%
- BR-PRC-02: Morning price set daily by 7 AM combining yesterday's mandi rate + today's mandi auction rate
- BR-PRC-03: Hotel contract price = Daily retail rate × (1 - ContractDiscount%)
- BR-PRC-04: Contract discount: 10% for < Rs. 30K/month, 15% for Rs. 30-75K, 20% for Rs. 75K-1.5L, 25% for > Rs. 1.5L
- BR-PRC-05: If mandi rate spikes > 30% in 7 days, hotel contract can be renegotiated with 48-hour notice
- BR-PRC-06: Markdown ladder: 60% shelf life → 10% off; 80% → 30% off; 90% → 50% off; 100% → write-off
- BR-PRC-07: Grade A stock cannot be marked down without store manager approval

---

## 6. QUALITY Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **QualityCheck** | An inspection event on a stock batch | QCId, BatchId, StoreId, InspectorId, CheckType, CheckTime, OverallGrade, PassStatus | QCId |
| **QualityTemplate** | Standard checklist for a produce category | TemplateId, Category, Parameters[] | TemplateId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **QcParameter** | Name (e.g. COLOR, FIRMNESS, FRESHNESS), Score (1-5), Weight, PassThreshold | |
| **QcResult** | ParameterName, Score, IsPass, Notes | |
| **CheckType** | INCOMING, PRE_DISPATCH, DAILY_AUDIT, SPOT_CHECK | When check happens |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `QualityCheckPassed` | QCId, BatchId, Grade, Inspector | Batch cleared for sale |
| `QualityCheckFailed` | QCId, BatchId, FailedParameters[], Action (REJECT/RETURN/REGRADE) | Batch flagged |
| `BatchDowngraded` | BatchId, OldGrade, NewGrade, Reason | Grade reduced |
| `QualityAlert` | ProduceId, SupplierId, RepeatedIssueCount, Last30DaysFailRate | Systemic issue detected |

### Invariants

- IN-QTY-01: Every incoming StockBatch must have an INCOMING QualityCheck before marked Available
- IN-QTY-02: A failed QC must specify Action (REJECT/RETURN/REGRADE/DISCARD)
- IN-QTY-03: Grade D stock must be immediately moved to Waste

### Business Rules

- BR-QTY-01: Mushroom and leafy green batches require temperature check at receiving (must be ≤ 4°C)
- BR-QTY-02: Hotel-destined batches get PRE_DISPATCH QC within 2 hours of dispatch
- BR-QTY-03: Any supplier with > 20% failure rate in a rolling 30-day window is auto-flagged
- BR-QTY-04: Daily DAILY_AUDIT for all stock that is > 50% through shelf life
- BR-QTY-05: Quality check results retained for each batch until batch closure

---

## 7. WASTE & SHRINKAGE Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **WasteRecord** | Documentation of produce disposed | WasteId, StoreId, RecordedDate, RecordedBy, TotalValue, DisposalMethod | WasteId |
| **WasteTarget** | Acceptable waste limit per store/category | TargetId, StoreId, Category, Month, TargetPercent, ActualPercent | TargetId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **WasteLineItem** | BatchId, ProduceId, Quantity, UnitCost, TotalValue, SpoilageReason | |
| **SpoilageReason** | EXPIRED, OVER_ORDERING, HANDLING_DAMAGE, TEMP_FAILURE, CUSTOMER_RETURN, TRANSIT_DAMAGE, QUALITY_REJECT | Root cause classification |
| **DisposalMethod** | LANDFILL, DONATION, COMPOST, PIG_FEED, DISCOUNT_SALE | |
| **WasteSummary** | TotalWasteKg, TotalWasteValue, WastePercentOfReceived, CategoryBreakdown[] | Daily flash metric |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `WasteRecorded` | WasteId, StoreId, Items[], TotalValue, DisposalMethod | Waste logged |
| `WasteThresholdBreached` | StoreId, Category, Actual%, Target%, Date | Waste over target |
| `RepeatedWastePattern` | StoreId, SpoilageReason, OccurrenceCount, ConsecutiveDays | Same reason 3+ days |

### Invariants

- IN-WST-01: Every WasteRecord must have at least one WasteLineItem with a SpoilageReason
- IN-WST-02: WasteLineItem quantity must reference quantity removed from the StockBatch
- IN-WST-03: Customer return waste is tracked separately from operational waste

### Business Rules

- BR-WST-01: Target waste: Common veg ≤ 5%, Leafy greens ≤ 8%, English veg ≤ 3%, Mushrooms ≤ 5%, Fruits ≤ 6%
- BR-WST-02: Waste > target requires written explanation from store manager
- BR-WST-03: Same SpoilageReason for ≥ 3 consecutive days triggers manager review meeting
- BR-WST-04: Customer-returned produce is written off immediately (cannot re-enter inventory)
- BR-WST-05: Donated produce (edible but past saleable shelf life) tracked at ₹0 value but recorded separately

---

## 8. FINANCE Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **B2BInvoice** | Invoice raised against hotel deliveries | InvoiceId, AccountId, PeriodFrom, PeriodTo, GrossAmount, Discount, TaxableAmount, GST, NetAmount, Status, DueDate | InvoiceId |
| **PaymentReceived** | B2B payment from hotel | PaymentId, InvoiceId, Amount, PaymentDate, PaymentMode, ReferenceNo, BankDate | PaymentId |
| **DailyFlash** | Daily P&L for a store | FlashId, StoreId, Date, TotalRevenue, TotalPurchases, TotalWaste, GrossMargin, MarginPercent, Notes | FlashId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **GSTDetail** | GSTIN, HSNCode, Rate (5%/12%/18%), IGST/CGST/SGST Split | |
| **AgingBucket** | 0-15 days, 16-30 days, 31-45 days, 46-60 days, 60+ days | Outstanding classification |
| **PaymentAllocation** | InvoiceId, AmountAllocated, AllocationDate | For partial payments |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `InvoiceGenerated` | InvoiceId, AccountId, Amount, DueDate | B2B invoice raised |
| `DebitNoteIssued` | DebitNoteId, InvoiceId, Amount, Reason | Amount reduced |
| `CreditNoteIssued` | CreditNoteId, InvoiceId, Amount, Reason | Amount added |
| `PaymentAllocated` | PaymentId, InvoiceId, Amount | Payment matched to invoice |
| `InvoiceOverdue` | InvoiceId, DaysOverdue, Amount | 1 day past due date |
| `InvoiceSettled` | InvoiceId, SettledDate | Fully paid |
| `DailyFlashComputed` | FlashId, StoreId, Date, Revenue, Margin% | End-of-day snapshot |

### Invariants

- IN-FIN-01: Total outstanding across all hotels ≤ 30% of trailing 30-day revenue
- IN-FIN-02: PaymentAllocation sum across invoices ≤ PaymentReceived.Amount
- IN-FIN-03: Each B2BInvoice is associated with at least one DeliveryNote
- IN-FIN-04: DailyFlash.Revenue = sum of RetailTransactions for that store+date + sum of B2BDeliveries

### Business Rules

- BR-FIN-01: Invoices generated weekly for hotel supply (every Saturday)
- BR-FIN-02: Payment received within 7 days of due date gets 2% early payment discount
- BR-FIN-03: Payments must be allocated to specific invoices within 3 business days
- BR-FIN-04: Invoice aging > 45 days → auto-escalation to management
- BR-FIN-05: Write-off for uncollectible invoices > 90 days requires owner approval

---

## 9. LOGISTICS Context

### Entities

| Entity | Description | Key Attributes | Identity |
|---|---|---|---|
| **DeliveryRun** | A planned route for deliveries | RunId, Date, DriverId, VehicleId, Route, StartTime, EstimatedEndTime, Status | RunId |
| **Driver** | Delivery personnel | DriverId, Name, ContactNo, VehicleAssigned, LicenseNo, ShiftTiming | DriverId |
| **Vehicle** | Transport asset | VehicleId, RegistrationNo, Capacity(kg), TemperatureControl, InsuranceExpiry, LastMaintenance | VehicleId |

### Value Objects

| Value Object | Attributes | Notes |
|---|---|---|
| **RouteStop** | StopOrder, DeliveryNoteId, AccountId, Address, TimeSlot, EstimatedArrival, ActualArrival | |
| **DeliveryManifest** | RunId, TotalStops, TotalWeight, TotalValue, Distance | Trip summary |

### Domain Events

| Event | Payload | Meaning |
|---|---|---|
| `DeliveryRunStarted` | RunId, DriverId, Items[], Stops[], StartTime | Left the store |
| `DeliveryStopCompleted` | RunId, StopOrder, DNoteId, DeliveryTime, Status | One hotel done |
| `DeliveryRunCompleted` | RunId, EndTime, TotalStops, Issues[] | All deliveries done |
| `DeliveryDelayed` | RunId, StopOrder, Reason, NewETA | Traffic/breakdown |

### Invariants

- IN-LOG-01: A DeliveryRun cannot have duplicate AccountId on same date (merge orders per hotel)
- IN-LOG-02: Total run weight ≤ Vehicle capacity
- IN-LOG-03: Temperature-sensitive items (mushrooms, leafy greens) must go in temperature-controlled vehicles

### Business Rules

- BR-LOG-01: Delivery runs optimized by geography — hotels on same route get same run
- BR-LOG-02: Hotel delivery time windows must be honored (± 30 min tolerance)
- BR-LOG-03: Driver captures delivery confirmation photo with hotel receiving staff
- BR-LOG-04: Inter-store transfer runs done in off-peak hours (11 AM - 2 PM or after 7 PM)
- BR-LOG-05: Vehicle temp log maintained for every run carrying perishable items

---

## Aggregate Definitions & Boundaries

| Aggregate Root | Contained Entities/VOs | Transaction Boundary | Why This Root? |
|---|---|---|---|
| **StockBatch** | StockBatch, QualityCheck (INCOMING), GRNLine, PurchaseOrderLine (read-only) | Stock movement, quality check, quantity adjustment | Stock is the atomic inventory unit — all operations on it must be consistent |
| **RetailTransaction** | SaleLineItem[], PaymentDetail | Sale completion, payment, stock deduction | Sale must be all-or-nothing — partial failure invalid |
| **SalesOrder** | OrderLineItem[], DeliveryNote[], Invoice, DebitNote[], CreditNote[] | Order fulfillment pipeline | Complete order lifecycle from placement to payment |
| **HotelContract** | ContractLineItem[], PaymentTerm, DeliverySchedule | Pricing and terms changes | Contract terms affect pricing, ordering, and billing |
| **PurchaseOrder** | PurchaseOrderLine[] | Procurement commitment | PO lines are committed together with supplier |
| **PriceList** | PriceListItem[] | Price activation/deactivation | Prices are published as a set — partial activation breaks consistency |
| **WasteRecord** | WasteLineItem[] | Waste logging | Multiple batch deductions happen together in a single waste event |
| **TransferOrder** | TransferLineItem[] | Inter-store movement | Source deduction + destination addition must be atomic |
| **DeliveryRun** | RouteStop[], DeliveryManifest | Route execution | Stops are ordered and executed as a single trip |

---

## Aggregate Design Rules Applied

| Rule | How It's Applied |
|---|---|
| **Reference by identity, not by object** | Aggregates reference each other by ID (e.g., StockBatch references StoreId, not Store) |
| **Transaction boundary = 1 aggregate** | Changes that must be atomic happen within one aggregate (e.g., sale = transaction + stock deduction within a single service call) |
| **Eventually consistent across aggregates** | Stock deduction from a sale is eventually consistent with the financial report |
| **Small aggregates** | WasteRecord doesn't contain Store — just references StoreId; Store is a separate aggregate |
| **No cross-aggregate transactions** | A PurchaseOrder aggregate doesn't directly update StockBatch — the GRN post creates a new StockBatch |

---

## Context Mapping (How bounded contexts communicate)

| Source Context | Destination Context | Channel | Mechanism | Notes |
|---|---|---|---|---|
| **Procurement** | Inventory | Event | `GRNPosted` → creates `StockBatch` | After GRN, inventory takes over |
| **Inventory** | Retail Sales | Shared Kernel | StockBatch.AvailableQty | Sales checks availability before billing |
| **Inventory** | Hotel Supply | Shared Kernel | StockBatch.AvailableQty | Hotel orders check stock before confirmation |
| **Inventory** | Waste | Event | `BatchAdjusted(WASTE)` → creates `WasteRecord` | |
| **Pricing** | Retail Sales | Conformist | PriceListItem → SaleLineItem.UnitPrice | Sales uses published prices |
| **Pricing** | Hotel Supply | Conformist | ContractLineItem → OrderLineItem.UnitPrice | Hotel uses contract prices |
| **Quality** | Inventory | Event | `QualityCheckPassed` → updates `StockBatch.Grade` | Grade changes based on QC |
| **Quality** | Waste | Event | `BatchDowngraded(D)` → auto-creates `WasteRecord` | Grade D = automatic waste |
| **Finance** | Hotel Supply | Event | `InvoiceGenerated` → `SalesOrder` linked | Billing follows delivery |
| **Logistics** | Hotel Supply | Event | `DeliveryRunStarted` → `DeliveryNote` status update | Dispatch triggers logistics |
| **Hotel Supply** | Finance | Event | `DeliveryNoteDelivered` → triggers `InvoiceGeneration` | Delivery completed → invoice |

---

## Strategic Domain Analysis

| Domain Type | Contexts | Rationale |
|---|---|---|
| **Core Domain** | Inventory | Competitive advantage lies in minimizing waste while maximizing availability — this is where the business lives or dies |
| **Supporting Subdomain** | Procurement, Retail Sales, Hotel Supply, Pricing, Quality | Necessary for inventory to function but could use off-the-shelf logic |
| **Generic Subdomain** | Finance, Logistics, HR | Standard functionality, potential for 3rd party integration |

---

## Key Business Metrics (Derived from Domain Model)

| Metric | Formula | Domain Source |
|---|---|---|
| **Waste %** | WasteValue / (PurchaseCost + TransferredInValue) | Inventory + Waste |
| **Same-Day Sell-Through** | QtySoldInFirst24h / ReceivedQty | Inventory + RetailSales + HotelSupply |
| **Hotel Margin** | HotelRevenue - CostOfGoodsSoldForHotel | HotelSupply + Inventory |
| **Retail Margin** | RetailRevenue - CostOfGoodsSoldForRetail | RetailSales + Inventory |
| **Aged Stock %** | ValueOfStockOver50%ShelfLife / TotalStockValue | Inventory |
| **Hotel Payment Days** | Average days from invoice date to payment received | Finance |
| **Contract Compliance** | Number of on-time complete deliveries / Total deliveries | HotelSupply |
| **Quality Reject Rate** | Rejected deliveries / Total deliveries | HotelSupply + Quality |
| **Supplier Reliability** | On-time delivery rate × Quality pass rate | Procurement + Quality |
| **Daily Flash Margin** | (Revenue - PurchaseCost - WasteValue) / Revenue | Finance (cross-domain) |
| **Stock Turnover** | COGS / Average Inventory Value | Inventory + RetailSales + HotelSupply |
| **Stockout Incidents** | Count of Produce × Store × Day where AvailableQty = 0 | Inventory |

---

## Event Storming Summary (Key Business Moments)

```
Time → Timeline of a typical day:

5:00 AM ─── Procurement Arrives → GRN → QC → StockBatch Created
6:00 AM ─── PriceList Activated for the day (Morning price setting)
7:00 AM ─── Store Opens → Retail Customers arrive
9:00 AM ─── Hotel Orders Received → SalesOrders Placed
10:00 AM ── Order Cutoff → Hotel Orders Confirmed
11:00 AM ── Leafy Green + Mushroom Count #1
12:00 PM ── Hotel Picking + Packing + Pre-Dispatch QC
2:00 PM ─── Hotel Delivery Dispatched → DeliveryRun Started
3:00 PM ─── Inter-Store Transfer Run (off-peak)
4:00 PM ─── Hotel Deliveries → DeliveryNotes Signed
5:00 PM ─── Leafy Green + Mushroom Count #2 → Markdown decisions
6:00 PM ─── Evening Retail Rush
8:00 PM ─── Store Closes → Daily Waste Recording
9:00 PM ─── Daily Flash Computed (Revenue, Waste, Margin)
9:30 PM ─── Next-Day Procurement Order Placed → POs Created
9:30 PM ─── Weekly B2B Invoice Batch Generated
```

---

## Edge Cases & Their Domain Impact

| Edge Case | Affected Aggregates | Business Rule Breached | Handling |
|---|---|---|---|
| Supplier delivers 20% less than ordered | PurchaseOrder, StockBatch, GRNLine | IN-PROC-02 (variance tolerance) → triggers partial fulfillment workflow | Price renegotiated or emergency PO placed |
| Hotel rejects entire delivery | SalesOrder, DeliveryNote, QualityCheck | BR-HTL-06 (documented rejection) | Stock returns to store → markdown sale or reallocate to other hotel |
| Power outage at store (cold chain fails) | StockBatch, QualityCheck, WasteRecord | All mushroom/leafy batches at risk | Emergency QC → downgrade or mass write-off |
| Mandi price doubles overnight | PriceList, HotelContract, SalesOrder | BR-PRC-05 (30% swing clause) triggers | Hotel contracts renegotiated; retail price raised |
| Customer returns 5 kg "bad" tomatoes | CustomerReturn, StockBatch, WasteRecord | BR-RTL-02 (return policy) | Verify → refund → write-off. If pattern → check procurement batch |
| Same supplier has 3 quality failures in a row | QualityCheck, Supplier | BR-QTY-03 (20% failure rule) | Supplier auto-flagged → review → suspend or retain with conditions |
| Festival demand: 5x normal for 3 SKUs | SalesOrder, RetailTransaction, Inventory | Stockout risk for all channels | Allocation rule AR3 kicks in (60/40 retail/hotel split) |

---

## Domain Model Diagram (Textual)

```
 ┌───────────────────────┐         ┌──────────────────────────┐
 │     PROCUREMENT        │         │        INVENTORY          │
 │  ┌─────────────────┐   │ Events  │  ┌──────────────────┐    │
 │  │ PurchaseOrder   │───┼─────┬───→│ StockBatch        │    │
 │  └─────────────────┘   │     │   │  - AvailableQty    │    │
 │  ┌─────────────────┐   │     │   │  - Grade           │    │
 │  │ GoodsReceiptNote│   │     │   │  - ReceivedQty     │    │
 │  └─────────────────┘   │     │   └──────────────────┘    │
 │  ┌─────────────────┐   │     │   ┌──────────────────┐    │
 │  │ Supplier         │   │     │   │ TransferOrder    │    │
 │  └─────────────────┘   │     │   └──────────────────┘    │
 └───────────────────────┘     │   ┌──────────────────┐    │
                               │   │ StockCount       │    │
                               │   └──────────────────┘    │
 ┌───────────────────────┐     │   └──────────────────────────┘
 │     QUALITY            │     │        ▲
 │  ┌─────────────────┐   │     │        │ BatchId / ProduceId
 │  │ QualityCheck     │───┼─────┘        │
 │  │ - CheckType      │   │       ┌──────┴───────┐         ┌──────────────────────────┐
 │  │ - OverallGrade   │   │       │              │         │       RETAIL SALES        │
 │  └─────────────────┘   │       │    PRODUCE    │─────ref──│  ┌──────────────────┐    │
 └───────────────────────┘       │   (Catalog)   │         │  │ RetailTransaction │    │
                                 │              │         │  │ - SaleLineItem[] │    │
 ┌───────────────────────┐       └──────┬───────┘         │  │ - Payment        │    │
 │      PRICING           │              │                  │  └──────────────────┘    │
 │  ┌─────────────────┐   │              │ ProduceId         │  ┌──────────────────┐    │
 │  │ PriceList       │   │              │                  │  │ CustomerReturn   │    │
 │  │ - Channel       │───┤──────────────┘                  │  └──────────────────┘    │
 │  │ - PriceListItem │   │                                 └──────────────────────────┘
 │  └─────────────────┘   │
 │  ┌─────────────────┐   │         ┌──────────────────────────┐
 │  │ PriceOverride   │   │         │       HOTEL SUPPLY        │
 │  └─────────────────┘   │         │  ┌──────────────────┐    │
 └───────────────────────┘         │  │ HotelAccount     │    │
                                   │  └──────────────────┘    │
 ┌───────────────────────┐         │  ┌──────────────────┐    │
 │       WASTE            │         │  │ HotelContract    │───→│  ContractLineItem (uses ProduceId)
 │  ┌─────────────────┐   │ Events  │  │ - PaymentTerm   │    │
 │  │ WasteRecord     │◄──┼─────────│  │ - DeliverySched │    │
 │  │ - SpoilageReason│   │         │  └──────────────────┘    │
 │  │ - WasteLineItem │   │         │  ┌──────────────────┐    │
 │  └─────────────────┘   │         │  │ SalesOrder       │───→│  OrderLineItem (uses ProduceId)
 │  ┌─────────────────┐   │         │  └──────────────────┘    │
 │  │ WasteTarget     │   │         │  ┌──────────────────┐    │
 │  └─────────────────┘   │         │  │ DeliveryNote     │    │
 └───────────────────────┘         │  └──────────────────┘    │
                                   │  ┌──────────────────┐    │
 ┌───────────────────────┐         │  │ Invoice          │    │
 │      LOGISTICS         │         │  │ DebitNote        │    │
 │  ┌─────────────────┐   │         │  │ CreditNote       │    │
 │  │ DeliveryRun     │───┼────────→│  └──────────────────┘    │
 │  │ - RouteStop[]   │   │         └──────────────────────────┘
 │  │ - Driver         │   │
 │  │ - Vehicle        │   │         ┌──────────────────────────┐
 │  └─────────────────┘   │         │        FINANCE            │
 └───────────────────────┘         │  ┌──────────────────┐    │
                                   │  │ DailyFlash       │    │
                                   │  │ - Revenue        │    │
                                   │  │ - Purchases      │    │
                                   │  │ - Waste          │    │
                                   │  │ - Margin         │    │
                                   │  └──────────────────┘    │
                                   │  ┌──────────────────┐    │
                                   │  │ PaymentReceived  │    │
                                   │  │ PaymentAllocation│    │
                                   │  └──────────────────┘    │
                                   └──────────────────────────┘
```

---

## Key Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| **StockBatch as aggregate root** (not Produce) | Each received lot has its own cost, grade, and shelf life trajectory. A Produce is a catalog item — it doesn't change. StockBatch is where the action happens. |
| **RetailTransaction is an aggregate** (not just a document) | A sale must atomically deduct stock and record payment. Splitting these would allow inconsistency. |
| **HotelContract separated from HotelAccount** | A hotel can have multiple contracts over time (different periods, renegotiated terms). Separating allows contract versioning. |
| **SalesOrder lifecycle is long** (includes delivery + invoicing) | In B2B perishable supply, order → delivery → acceptance → invoice is one continuous flow. Breaking it would create reconciliation nightmares. |
| **Waste as separate context** (not part of Inventory) | Waste tracking requires its own analytics, targets, and root cause analysis. Mixing it into inventory ops would dilute focus. |
| **PriceList as aggregate** (not individual prices) | Prices are published as a set for a channel/store/day. Partial updates would break consistency (e.g., some items priced, others missing). |
| **QualityCheck separate from StockBatch** | A batch can have multiple QC events (receiving, pre-dispatch, daily audit). Making QC part of StockBatch would bloat it. |
| **DailyFlash is computed, not a live P&L** | End-of-day snapshot is authoritative. Live P&L is derived from events. This avoids mutable financial aggregates. |
| **DeliveryRun includes route optimization** | For 5+ hotels daily, manual routing becomes a bottleneck. Making the route an explicit entity enables optimization. |
