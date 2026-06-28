# Business Workflows: Vegetable Retail + Hotel Supply

All sequence diagrams use Mermaid.js syntax.

---

## 1. PROCUREMENT WORKFLOW

**Actors**: Store Manager, Supplier (Mandi Agent/Farmer), Accountant, Quality Inspector

**Flow**: Daily procurement from order to goods receipt

```mermaid
sequenceDiagram
    participant SM as Store Manager
    participant S as Supplier
    participant QI as Quality Inspector
    participant ST as Store (Back Office)
    participant AC as Accountant

    Note over SM,S: Evening (Day-1): Procurement Planning
    SM->>SM: Check yesterday's sales vs stock remaining
    SM->>SM: Calculate order qty = forecast - current stock - safety buffer
    SM->>SM: Check hotel contracts for committed quantities
    SM->>SM: Review aging stock to avoid over-ordering
    SM->>S: Call/WhatsApp: Place order (produce, qty, expected price)
    S->>S: Confirm availability & quote price
    S->>SM: Send confirmation (voice/call/WhatsApp message)
    SM->>SM: Note estimated cost in purchase log

    Note over SM,S: Morning (Day): Goods Receipt
    S->>SM: Deliver produce at store (5:00 - 6:30 AM)
    SM->>QI: Call for quality inspection
    QI->>QI: Visual inspection: color, freshness, firmness, damage
    QI->>QI: Weight check: weigh each crate/bag
    QI->>QI: Reject damaged/ substandard items
    QI->>SM: Report: accepted qty, rejected qty, grade assigned

    alt Rejected Items Exist
        SM->>S: Negotiate discount on rejected portion OR return
        S->>SM: Accept return or offer reduced price
    end

    SM->>SM: Record in stock register: item, qty, cost/kg, supplier, date
    SM->>ST: Enter into daily purchase sheet
    SM->>SM: Assign batch identifier (e.g., TOM-28JUN-A)
    SM->>SM: Update display & storage with new stock
    SM->>SM: Tag stock with received date & grade

    Note over SM,S: Payment (variable: COD / weekly / credit)
    alt Cash on Delivery
        SM->>SM: Pay from cash drawer
        SM->>AC: Record payment in expense log
    else Weekly Settlement
        SM->>AC: Record as supplier payable
        AC->>S: Settle at end of week
    end
```

### Key Business Rules
- Order placed by 6 PM day-prior for next-day delivery
- Produce must arrive by 7 AM for morning opening
- 5% weight variance tolerance (above → negotiate; below → accept at reduced cost)
- All incoming batches get quality grade assignment before acceptance
- Batch code format: `{PRODUCE_CODE}-{DDMMM}-{GRADE}` (e.g., TOM-28JUN-A)

### Edge Cases
| Situation | Handling |
|---|---|
| Supplier delivers 30% less than ordered | Emergency PO to backup supplier OR ration across channels (hotel gets priority) |
| Entire batch rejected (quality failure) | No backup = stockout. Activate emergency sourcing from nearest retail competitor |
| Supplier no-show (no call, no delivery) | Emergency mandi run by store staff before 7 AM |
| Price dispute: delivered price > agreed price | Negotiate on the spot; if no resolution, reject delivery, source elsewhere |

---

## 2. INVENTORY WORKFLOW

**Actors**: Store Manager, Sales Staff, Quality Inspector

**Flow**: Stock from receipt through sale or disposal

```mermaid
sequenceDiagram
    participant SM as Store Manager
    participant SS as Sales Staff
    participant QI as Quality Inspector
    participant DISP as Display Area
    participant STOR as Storage/Backroom

    Note over SM,STOR: Receiving Phase
    SM->>SM: Receive produce (from Procurement workflow)
    SM->>QI: Quality grade assigned (A/B/C/D)
    SM->>STOR: Place in storage area

    Note over SM,DISP: Storage & Rotation
    SM->>STOR: Apply FEFO: older batches placed in front
    SM->>SM: Tag each batch with: received date, grade, expiry (computed)

    Note over SM,DISP: Display Management
    SM->>DISP: Move required qty to retail display
    SM->>DISP: Arrange by category & grade
    SM->>SM: Update price signage (from Pricing workflow)

    Note over SM,QI: Throughout Day: Freshness Monitoring
    loop Every 2-3 hours for leafy greens, mushrooms
        SS->>DISP: Inspect display stock for wilting/spoilage
        SS->>SM: Report any deteriorating items
        SM->>SM: Remove spoiled items → spoilage workflow
        SM->>DISP: Replace with fresh stock from backroom
    end

    Note over SM,DISP: Mid-Day (Leafy Green + Mushroom Count)
    SM->>SM: Count remaining qty of mushroom & leafy greens (11 AM, 5 PM)
    SM->>SM: Compute expected sell-through

    alt Sell-through < 50% by 5 PM (leafy greens)
        SM->>SM: Initiate markdown pricing
        SM->>DISP: Apply discount sticker (10-30% off)
        SM->>SS: Verbally inform customers of discount
    end

    Note over SM,STOR: End of Day: Stock Reconciliation
    SM->>SM: Physical count of remaining stock by batch
    SM->>SM: Record closing stock qty per batch
    SM->>SM: Identify batches past shelf life
    SM->>SM: Move expired stock → spoilage workflow
    SM->>SM: Update stock register (opening + received - sold - spoiled = closing)

    Note over SM,STOR: Stock Replenishment Trigger
    SM->>SM: If closing stock < reorder level, flag for next order
    SM->>SM: Prepare order quantities (feeds into Procurement workflow)
```

### Batch Flow Visualization

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ RECEIVED │───→│ STORED   │───→│ DISPLAY  │───→│ SOLD     │
│ (Grade A)│    │ (FEFO)   │    │ (Priced) │    │ (Retail) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                      │               │
                      ▼               ▼
               ┌──────────┐    ┌──────────┐
               │TRANSFERRED│    │ MARKDOWN │───→│ SOLD (discounted)
               │(to other)│    │ (aging)  │
               └──────────┘    └──────────┘    ┌──────────┐
                      │               │        │ WASTE    │
                      ▼               └───────→│(expired) │
               ┌──────────┐                     └──────────┘
               │ SOLD     │
               │ (Hotel)  │
               └──────────┘
```

---

## 3. HOTEL ORDER WORKFLOW

**Actors**: Hotel (B2B Customer), Store Manager, Picker, Quality Inspector, Driver, Accountant

**Flow**: End-to-end hotel order lifecycle

```mermaid
sequenceDiagram
    participant H as Hotel
    participant SM as Store Manager
    participant PI as Picker
    participant QI as Quality Inspector
    participant DR as Driver
    participant AC as Accountant

    Note over H,DR: Order Placement (5:00 - 10:00 AM)
    H->>SM: WhatsApp/Call: Place order (items, quantities, delivery window)
    SM->>SM: Check hotel contract for agreed prices & credit terms
    SM->>SM: Check stock availability across all batches

    alt Sufficient Stock Available
        SM->>H: Confirm order with estimated total
        SM->>SM: Create order entry in hotel order log
        SM->>SM: Reserve stock for this order (deduct from available in plan)
    else Partial Stock Available
        SM->>H: Inform about shortfall, offer substitute or partial
        H->>SM: Accept or adjust order
    else Stockout
        SM->>H: Apologize, offer next-day delivery
    end

    Note over H,DR: Picking & Packing (10:00 AM - 1:00 PM)
    SM->>PI: Give picking list (items, qty, grades required)
    PI->>PI: Pick stock from storage/display
    PI->>SM: Bring picked items to packing area
    SM->>QI: Pre-dispatch quality check
    QI->>QI: Inspect picked items: freshness, weight, packaging
    QI->>SM: PASS / REJECT items

    alt QC Rejection
        SM->>PI: Replace rejected items
        QI->>SM: Re-inspect replacements
    end

    SM->>SM: Weigh each item & record actual qty
    SM->>SM: Pack items (crates, polybags as per hotel requirement)
    SM->>SM: Generate delivery note (handwritten/printed)
    SM->>SM: Attach delivery note to package

    Note over H,DR: Dispatch & Delivery (1:00 - 4:00 PM)
    DR->>SM: Collect delivery packages
    SM->>DR: Hand over with delivery note
    DR->>H: Transport to hotel
    DR->>H: Hand over packages to hotel receiving
    H->>H: Weigh & inspect at receiving

    alt Hotel Accepts Delivery
        H->>DR: Sign delivery note (acceptance)
        DR->>SM: Return signed delivery note
        SM->>AC: Submit for invoicing
    else Partial Rejection (quality/quantity issue)
        H->>DR: Sign with rejection noted (items, qty, reason)
        DR->>SM: Return signed note with rejection details
        SM->>SM: Record rejected items
        SM->>SM: Rejected stock → retail markdown OR spoilage
        SM->>H: Note debit amount for next invoice
    end

    Note over H,AC: Invoicing & Settlement
    AC->>AC: Generate invoice (weekly: every Saturday)
    AC->>H: Send invoice (WhatsApp/Email)
    H->>AC: Process payment (as per credit terms)
    AC->>SM: Update payment received in ledger
```

### Order Timeline Constraints

```
Time    Activity                    Cutoff
────────────────────────────────────────────
05:00   Hotel starts ordering       10:00 AM (same-day delivery)
10:00   Order cutoff                10:00 AM
10-11   Picking & QC                Must start by 10:00
11-12   Packing & weighing          12:00 PM
12-13   Dispatch preparation        1:00 PM
13-16   Delivery                    4:00 PM (or as per hotel slot)
16-17   Signed delivery note back   5:00 PM
```

### Edge Cases

| Situation | Handling |
|---|---|
| Hotel orders after 10 AM cutoff | Offer next-day delivery; if urgent, check stock & dispatch at manager's discretion with overtime |
| Hotel rejects entire delivery | Full return → stock goes to retail markdown. Supply suspended for investigation if pattern |
| Driver delayed (traffic/breakdown) | Notify hotel immediately with new ETA. If past hotel receiving hours, reschedule |
| Signed D/Note lost | Ask hotel to re-sign on next delivery; use delivery photo as interim proof |
| Hotel disputes invoice quantity | Cross-check with signed delivery note. If error, issue corrected invoice. If dispute, debit note |

---

## 4. RETAIL BILLING WORKFLOW

**Actors**: Customer, Cashier, Weighing Scale

**Flow**: Walk-in customer purchase from selection to payment

```mermaid
sequenceDiagram
    participant C as Customer
    participant CA as Cashier
    participant SC as Weighing Scale

    Note over C,SC: Customer Shopping Phase
    C->>C: Select vegetables/fruits from display
    C->>C: Place selected items in bag/basket

    Note over C,SC: Billing Phase
    C->>CA: Hand over items at counter
    CA->>C: Greet customer

    loop Each item type
        CA->>SC: Place item on weighing scale
        SC->>CA: Display weight (kg/g/piece)
        CA->>CA: Look up today's price for this produce
        CA->>CA: Compute: weight × unit price = line total
        CA->>CA: Note in bill (paper or billing counter book)
    end

    CA->>CA: Sum all line totals = gross amount

    alt Discount Applicable
        CA->>CA: Apply discount (bulk / regular customer / aging stock)
        CA->>CA: Compute net amount
    end

    CA->>C: Declare total amount
    C->>CA: Offer payment (cash / UPI / card)

    alt Cash Payment
        C->>CA: Hand cash
        CA->>CA: Count cash received
        CA->>CA: Compute change = cash - total
        alt Change Required
            CA->>C: Return change
        end
        CA->>CA: Drop cash in cash drawer
    else UPI Payment
        C->>CA: Show UPI app (PhonePe/GPay/Paytm)
        CA->>CA: Open store UPI QR code / enter amount on UPI app
        C->>CA: Scan & pay
        CA->>CA: Verify payment confirmation on phone
        CA->>C: Show confirmation to customer
    else Card Payment
        C->>CA: Hand card
        CA->>CA: Swipe/tap on POS machine
        CA->>CA: Enter amount, wait for approval
        CA->>CA: Collect signed receipt (if required)
    end

    CA->>C: Hand over printed/handwritten bill
    CA->>C: Hand over packed items
    C->>CA: Leave store
    CA->>CA: Record sale in daily sales log

    Note over CA,SC: End of transaction
```

### Billing Log Entry Format

```
Date: 28-Jun-2026 | Cashier: Rajesh | Txn#: R-0284
Items:
  - Tomato (3.2 kg × Rs. 40) = Rs. 128
  - Spinach (0.5 kg × Rs. 60) = Rs. 30
  - Mushroom (0.4 kg × Rs. 240) = Rs. 96
Gross: Rs. 254 | Discount: Rs. 0 | Net: Rs. 254
Payment: UPI (Yes Bank, Ref: UPI284712)
Time: 10:23 AM
```

### Edge Cases

| Situation | Handling |
|---|---|
| Customer disputes weight | Re-weigh in front of customer. If scale discrepancy, check calibration immediately |
| Customer forgets wallet after bagging | Hold items for 15 min; if no return, return stock to display |
| UPI payment fails but shows deducted from bank | Request customer not to re-pay; wait 30 min for auto-refund. If no refund, give phone number for follow-up |
| Price dispute: "Yesterday it was Rs. 30, today Rs. 45" | Explain daily price variation. If regular customer, apply small discount (5%) to retain goodwill |
| Customer wants half-quantity return after billing | No returns accepted once customer leaves counter (except spoilage) |
| Peak hour: long queue | If queue > 5 people, call second cashier (if available) or pre-weigh fast-moving items |

---

## 5. CUSTOMER PAYMENTS WORKFLOW

**Actors**: Customer, Cashier, Accountant

**Flow**: Payment collection, verification, and daily settlement

```mermaid
sequenceDiagram
    participant C as Customer
    participant CA as Cashier
    participant AC as Accountant

    Note over C,AC: Per-Transaction Payment
    C->>CA: Pay for purchase (cash/UPI/card)
    CA->>CA: Verify authenticity of currency (cash)

    alt Cash Payment
        CA->>CA: Check notes for counterfeits (feel/see/tilt)
        CA->>CA: Count & store in cash drawer by denomination
        CA->>CA: Enter amount in manual cash register / sales log
    else UPI Payment
        CA->>CA: Verify UPI confirmation message (name & amount match)
        CA->>CA: Note UPI reference ID in billing log
        CA->>CA: Check UPI app daily transaction list at end of shift
    else Card Payment
        CA->>CA: Verify POS machine prints approval slip
        CA->>CA: File approval slip with daily records
    end

    Note over C,AC: Shift Handover (End of Cashier Shift)
    CA->>AC: Hand over cash drawer
    AC->>AC: Count cash by denomination
    AC->>AC: Match cash count with sales log total
    AC->>AC: Compute variance = actual - expected
    AC->>CA: Discuss any variance

    alt Cash Variance ≤ Rs. 50
        AC->>AC: Record as "cash difference" — adjust in P&L
    else Cash Variance > Rs. 50
        AC->>CA: Investigate — recount, check bills
        CA->>AC: Identify error (wrong change, missed entry)
        AC->>AC: Correct cash record
        alt Unexplained > Rs. 100
            AC->>SM: Escalate to store manager
        end
    end

    Note over C,AC: Daily Payment Summary
    AC->>AC: Prepare end-of-day payment summary:
    AC->>AC:   Total Cash Collection (by denomination)
    AC->>AC:   Total UPI Collection (from UPI app settlement report)
    AC->>AC:   Total Card Collection (from POS machine settlement)
    AC->>AC:   Total Sales (cross-check with billing log)
    AC->>AC:   Variance (should be zero after adjustment)
    AC->>AC: Deposit cash in safe / bank (as per policy)
```

### Payment Mix & Reconciliation

```
Payment Method     Check Source                   Settlement Speed
─────────────────────────────────────────────────────────────────
Cash               Physical count + sales log     Immediate
UPI                UPI app transaction report     T+1 (bank account)
Card               POS machine settlement          T+1 (bank account)

Daily Check: Sum(Cash + UPI + Card) = Total Sales as per billing log
```

### Edge Cases

| Situation | Handling |
|---|---|
| UPI payment settles T+1 but customer asks for refund today | Cannot process; ask customer to wait for auto-refund |
| POS machine fails (no network) | Switch to backup POS or take only cash/UPI |
| Customer pays with damaged/soiled note | Do not accept; politely ask for alternative |
| Cash drawer short at end of day (Rs. 500 missing) | Review CCTV footage. If theft suspected → escalate. If error → adjust |
| UPI app shows extra transaction not in billing log | Could be customer scanned but no sale completed → check billing log for orphan entry |

---

## 6. SUPPLIER PAYMENTS WORKFLOW

**Actors**: Store Manager, Supplier, Accountant

**Flow**: Payment to produce/vegetable suppliers

```mermaid
sequenceDiagram
    participant SM as Store Manager
    participant S as Supplier
    participant AC as Accountant

    Note over SM,AC: Payment Trigger
    alt Cash on Delivery (COD)
        SM->>AC: Notify: payment due for today's delivery
    else Weekly Settlement
        AC->>AC: Every Saturday: list all purchases from supplier for the week
        AC->>SM: Confirm supplier list with amounts
    else Monthly Credit
        AC->>AC: End of month: compile all purchases
        AC->>S: Send statement to supplier for verification
        S->>AC: Confirm or dispute amounts
    end

    Note over SM,AC: Verification
    AC->>SM: Cross-check: delivery notes vs purchase log vs agreed rates
    AC->>AC: Verify no duplicate payments
    AC->>AC: Deduct any advances already paid
    AC->>AC: Compute net payable = gross purchases - returns - advances

    Note over SM,AC: Payment Execution
    SM->>SM: Obtain cash from cash drawer / safe
    SM->>SM: OR request bank transfer from owner

    alt Cash Payment
        SM->>S: Hand over cash
        S->>SM: Provide receipt / sign payment register
        SM->>AC: Record payment with receipt
    else Bank Transfer
        SM->>AC: Authorize transfer
        AC->>S: Transfer via net banking / UPI
        AC->>SM: Share transaction confirmation
        SM->>AC: File confirmation
    end

    Note over SM,AC: Recording
    AC->>AC: Update supplier ledger:
    AC->>AC:   Date, Invoice/PO#, Amount, Payment Mode
    AC->>AC:   Running balance (for credit suppliers)
    AC->>AC: Update daily expense sheet
```

### Edge Cases

| Situation | Handling |
|---|---|
| Supplier asks for advance payment (for large order) | Record as advance; deduct from final settlement. Track in "Advances Paid" register |
| Supplier claims higher rate than agreed | Check purchase order / WhatsApp record. If SM's error, negotiate. If supplier incorrect, hold to agreed rate |
| Multiple invoices, part payment | Track by invoice. Ensure each payment is allocated to specific invoices |
| Supplier wants early payment for discount | Verify discount % vs. cash flow benefit. If ≥ 2% discount for ≤ 7 days early → accept |
| Supplier disputes deduction (returns) | Show signed delivery note with rejection recorded |

---

## 7. EXPENSE ENTRY WORKFLOW

**Actors**: Store Manager, Staff Member, Accountant

**Flow**: Recording all non-procurement operational expenses

```mermaid
sequenceDiagram
    participant E as Staff Member
    participant SM as Store Manager
    participant AC as Accountant

    Note over E,AC: Expense Incurrence
    E->>SM: Request money for expense (e.g., transport, repairs, supplies)
    SM->>E: Approve & provide cash from drawer
    E->>E: Purchase goods/service
    E->>SM: Submit bill/invoice + any change

    Note over E,AC: Recording
    SM->>SM: Create expense entry in expense register:

    Note right of SM: Fields: Date | Category | Description | Vendor | Amount | Payment Mode | Bill# | EnteredBy

    SM->>AC: Hand over all bills at end of day

    Note over E,AC: Categorization & Review
    AC->>AC: Review each expense for reasonableness
    AC->>AC: Assign category:
    AC->>AC:   - TRANSPORT (delivery vehicle fuel, driver wages)
    AC->>AC:   - UTILITIES (electricity, water, phone)
    AC->>AC:   - PACKAGING (polybags, crates, stickers, rubber bands)
    AC->>AC:   - MAINTENANCE (shelves, weighing scales, store fixtures)
    AC->>AC:   - LABOUR (casual workers for loading/unloading)
    AC->>AC:   - STATIONERY (billing books, pens, labels)
    AC->>AC:   - MISCELLANEOUS (tea, cleaning supplies)
    AC->>AC: Check for duplicate / suspicious entries
    AC->>AC: Enter into expense tracking spreadsheet

    Note over E,AC: End of Month
    AC->>AC: Summarize expenses by category
    AC->>SM: Report: category-wise spend vs budget
    SM->>SM: Identify cost-saving opportunities
```

### Expense Categories & Budget Benchmarks

| Category | Typical % of Revenue | Check |
|---|---|---|
| Transport | 2-4% | Fuel receipts vs distance covered |
| Packaging | 1-2% | Polybag usage per sale count |
| Labour | 3-6% | Daily wages vs store traffic |
| Utilities | 0.5-1.5% | Compare month-on-month |
| Maintenance | 0.5-1% | Unexpected spikes = investigate |
| Miscellaneous | 0.5-1% | Cap at 1% without manager approval |

### Edge Cases

| Situation | Handling |
|---|---|
| Staff paid from cash but no bill (e.g., tips, loading/unloading) | Record as "Labour" with note of work done and staff name |
| Expense exceeds Rs. 1000 without prior approval | Flag to owner; require justification. Policy: > Rs. 1000 needs pre-approval |
| Recurring expense (e.g., daily transport) | Create standing entry template to avoid daily re-entry |
| Expense in foreign currency (rare: imported English veg supplies) | Convert to INR at day's exchange rate, note forex rate used |

---

## 8. VEHICLE EXPENSES WORKFLOW

**Actors**: Driver, Store Manager, Accountant, Mechanic

**Flow**: Tracking all costs associated with delivery/transport vehicles

```mermaid
sequenceDiagram
    participant D as Driver
    participant M as Mechanic
    participant SM as Store Manager
    participant AC as Accountant

    Note over D,AC: Daily Fuel & Trip
    D->>SM: Request fuel money / fuel card
    SM->>D: Provide cash or authorize fuel
    D->>D: Fill fuel at petrol pump
    D->>SM: Submit fuel receipt (liters, rate, total, odometer reading)
    SM->>SM: Record in vehicle log:

    Note right of SM: Date | Vehicle# | Odometer(Start) | Odometer(End) | KM | Fuel(L) | Fuel(Rs.) | Route

    Note over D,AC: Scheduled Maintenance
    SM->>SM: Track odometer for service due (e.g., every 5000 km)
    SM->>M: Schedule service (oil change, tire rotation, etc.)
    M->>SM: Perform service & provide bill
    SM->>AC: Submit maintenance bill
    AC->>AC: Record under "Vehicle Maintenance" expense category

    Note over D,AC: Unscheduled Repairs
    D->>SM: Report vehicle issue (engine noise, brake problem, puncture)
    SM->>M: Get diagnosis & repair estimate
    SM->>SM: Approve repair (if above Rs. 2000, call owner)
    M->>SM: Repair & provide invoice
    SM->>AC: Submit repair invoice

    Note over D,AC: Other Vehicle Costs
    D->>SM: Submit: toll receipts, parking charges, cleaning, permits
    SM->>SM: Record each with supporting receipt

    Note over D,AC: Monthly Vehicle P&L
    AC->>AC: Compile monthly per-vehicle costing:
    AC->>AC:   Total KM driven
    AC->>AC:   Total fuel cost
    AC->>AC:   Total maintenance + repairs
    AC->>AC:   Total other (toll, parking, cleaning)
    AC->>AC:   Cost per KM = Total Cost / Total KM
    AC->>SM: Report: vehicle-wise efficiency
    SM->>SM: Compare cost/KM across vehicles → identify issues
```

### Vehicle Tracking Sheet

```
Vehicle: UP-78-AB-1234 (Tata Ace)
─────────────────────────────────────────
Date    Odo.Start   Odo.End   KM    Fuel(L)   Cost   Route
─────────────────────────────────────────
28-Jun   12,340     12,410    70      8       Rs. 840  Store→Hotel5→Hotel3→Store
29-Jun   12,410     12,455    45      5       Rs. 525  Store→Hotel1→Hotel2→Store
─────────────────────────────────────────
Service Due: 15,000 km (currently 12,455 km)
Last Service: 10-Apr-2026 (at 10,000 km)
```

### Edge Cases

| Situation | Handling |
|---|---|
| Driver reports fuel consumption far above normal | Check route distance, check for fuel theft (pumping more than tank capacity) |
| Accident / vehicle damage | Record separately under insurance claim. Track out-of-pocket expenses |
| Vehicle breakdown during delivery run | Notify SM → arrange backup vehicle or auto for that delivery |
| Personal use of vehicle by driver | Policy: no personal use. Check odometer vs delivery schedule |
| No receipt (small expense like parking ₹20) | Accept verbal with note; policy: > Rs. 50 needs receipt |

---

## 9. SPOILAGE WORKFLOW

**Actors**: Store Manager, Quality Inspector, Accountant

**Flow**: Detection, recording, root cause analysis of spoiled produce

```mermaid
sequenceDiagram
    participant SS as Sales Staff
    participant SM as Store Manager
    participant QI as Quality Inspector
    participant AC as Accountant

    Note over SS,AC: Detection
    SS->>SS: During display monitoring: spot spoiled/wilted/damaged items
    SS->>SM: Report: which produce, estimated quantity, visible condition

    Note over SS,AC: Inspection & Classification
    SM->>QI: Call for inspection
    QI->>QI: Examine spoiled items
    QI->>SM: Classify into spoilage reason:

    Note right of SM: EXPIRED → Past shelf life
    Note right of SM: OVER_ORDER → Bought too much, couldn't sell
    Note right of SM: HANDLING → Rough handling during transport/storage
    Note right of SM: TEMP_FAILURE → Cold chain broken
    Note right of SM: CUSTOMER_RETURN → Returned by customer
    Note right of SM: TRANSIT_DAMAGE → Damaged during delivery
    Note right of SM: PEST/DISEASE → Infestation or rot

    SM->>QI: Grade items: still sellable (C) vs total loss (D)

    alt Grade C (Aging but sellable at discount)
        SM->>SM: Move to markdown rack with clear discount label
        SM->>SS: Instruct staff to offer at discount
    else Grade D (Total loss)
        SM->>SM: Separate into disposal bin
        SM->>SM: Weigh before disposal
    end

    Note over SS,AC: Recording
    SM->>SM: Create spoilage record:
    SM->>SM:   Date, Time, Produce, Batch#, Grade, Qty (kg), Cost/kg, Total Value
    SM->>SM:   Spoilage Reason (primary)
    SM->>SM:   Disposal Method: DONATION / COMPOST / PIG_FEED / LANDFILL
    SM->>AC: Submit spoilage record end of day

    Note over SS,AC: Disposal
    alt Donation (still safe but past saleable)
        SM->>SM: Contact local food bank / NGO for pickup
    else Compost / Pig Feed
        SM->>SM: Give to local composter / pig farmer (often free pickup)
    else Landfill
        SM->>SM: Dispose in municipal waste
    end

    Note over SS,AC: Weekly Analysis
    AC->>AC: Compile weekly spoilage report:
    AC->>AC:   Total waste value (Rs.)
    AC->>AC:   Waste % = Waste Value / Total COGS
    AC->>AC:   Top 3 spoilage reasons
    AC->>AC:   Top 5 produce items by waste value
    AC->>SM: Report with recommendations
    SM->>SM: Action plan: adjust ordering / improve handling / change supplier
```

### Target Waste Rates

| Category | Target | Alert Level | Critical |
|---|---|---|---|
| Common vegetables | ≤ 5% | 5-8% | > 8% |
| Leafy greens | ≤ 8% | 8-12% | > 12% |
| English vegetables | ≤ 3% | 3-5% | > 5% |
| Mushrooms | ≤ 5% | 5-8% | > 8% |
| Fruits | ≤ 6% | 6-10% | > 10% |

### Edge Cases

| Situation | Handling |
|---|---|
| Same spoilage reason 3 days in a row | Mandatory manager review meeting — systemic issue |
| Massive spoilage (e.g., power outage killed all cold storage) | Emergency: photograph evidence, record total loss, insurance claim (if covered) |
| Customer returns spoiled item — was it spoiled when sold or after? | If > 50% of item is spoiled → refund; if slight → check if customer stored wrong |
| Staff trying to hide spoilage (mixing bad with good) | Train staff; policy: spoilage is expected, hiding it is not. Surprise audits |
| Donation partner not showing up | If scheduled pickup missed, switch to compost to avoid pest issues |

---

## 10. RETURNS WORKFLOW

**Actors**: Customer, Cashier, Store Manager

**Flow**: Customer returning purchased produce for refund/replacement

```mermaid
sequenceDiagram
    participant C as Customer
    participant CA as Cashier
    participant SM as Store Manager

    Note over C,SM: Return Initiation
    C->>CA: Return with produce item(s) — claim of spoilage or poor quality
    CA->>C: Ask: "What is the issue?" + "When was it purchased?"

    alt Has Original Bill
        C->>CA: Show original bill
    else No Bill
        C->>CA: Verbal: approximate date & amount
        CA->>C: Request phone number to look up in sales log
    end

    Note over C,SM: Verification
    CA->>CA: Inspect returned produce
    SM->>SM: Determine if issue is genuine:

    alt Genuine Spoilage (produce was bad at purchase)
        SM->>SM: Accept return
    else Customer Mis-handling (stored wrong, kept too long)
        SM->>SM: Decide: goodwill or deny
    else No Visible Issue (customer changed mind)
        SM->>SM: Policy: No return for non-spoilage reasons
    end

    Note over C,SM: Resolution

    alt Full Refund (genuine spoilage, ≤ Rs. 50)
        CA->>C: Refund full amount in cash / UPI
    else Full Refund (genuine spoilage, > Rs. 50)
        SM->>C: Refund full amount — requires manager approval
    else Replacement (item still available to sell)
        SM->>C: Exchange for fresh produce of same value
    else Partial Refund (slight issue, goodwill gesture)
        SM->>C: Offer 50% refund or discount on next purchase
    else Denied
        CA->>C: Politely explain policy (non-spoilage returns not accepted)
    end

    Note over C,SM: Recording
    SM->>SM: Record return in return register:
    SM->>SM:   Date, Time, Customer Name/Phone, Bill#, Produce, Qty, Refund Amount
    SM->>SM:   Reason (SPOILED / WRONG_ITEM / CHANGE_MIND / OTHER)
    SM->>SM:   Resolution (FULL_REFUND / PARTIAL_REFUND / REPLACEMENT / DENIED)

    alt Refund Issued
        SM->>SM: Update sales log: deduct returned amount from total sales
        SM->>SM: Write "RETURNED" on original bill (if available)
        SM->>SM: Move returned produce → spoilage workflow (Grade D — cannot resell)
    end
```

### Return Policy Summary

| Scenario | Refund? | Condition |
|---|---|---|
| Produce spoiled on purchase day | Full refund | Original bill required; > Rs. 50 needs manager OK |
| Produce spoiled next day | Depends | Leafy greens = deny (1-day life); potato = partial |
| Customer bought wrong item | Deny (change mind) | Exception: exchange if returned within 30 min unused |
| Customer claims short weight | Re-weigh | If our scale was wrong → refund difference |
| Regular customer, no bill, small amount (≤ Rs. 30) | Goodwill refund | Trusted customer, no questions asked |
| Same customer returning frequently | Flag | Investigate pattern — possible abuse |

### Edge Cases

| Situation | Handling |
|---|---|
| Customer returns produce purchased at different store (chain) | Accept if other store in same chain; adjust in inter-store settlement |
| Customer becomes aggressive when return denied | De-escalate: offer small discount (Rs. 10-20) to defuse; involve owner if needed |
| Returned produce is only partly spoiled | Full refund on whole item — policy: customer shouldn't sort good from bad |
| Customer asks to return without item ("I threw it away") | Deny — must see the item to verify |
| Employee-related return (staff gave wrong item/weight) | Full refund + apology → investigate staff training gap |

---

## 11. STOCK TRANSFER WORKFLOW

**Actors**: Source Store Manager, Destination Store Manager, Driver, Accountant

**Flow**: Inter-store transfer of excess/aging stock to where it's needed

```mermaid
sequenceDiagram
    participant SRC as Source Store (Manager)
    participant DST as Destination Store (Manager)
    participant DR as Driver
    participant AC as Accountant

    Note over SRC,AC: Transfer Trigger
    alt Excess Stock at Source
        SRC->>SRC: Identify: aging produce unlikely to sell before expiry
        SRC->>SRC: Check: can hotel orders absorb it? No → consider transfer
    else Stockout at Destination
        DST->>DST: Identify: running low on certain produce
        DST->>DST: Check: can we order fresh? If too late → request transfer
    end

    Note over SRC,AC: Transfer Request
    DST->>SRC: Call/WhatsApp: "Do you have [produce, qty] available?"
    SRC->>SRC: Check stock availability & remaining shelf life

    alt Available & Shelf Life > 2 days
        SRC->>DST: Confirm availability
    else Insufficient / Too old
        SRC->>DST: Decline — insufficient or shelf life too short
    end

    Note over SRC,AC: Authorization
    SRC->>SRC: Verify: shelf life at arrival ≥ 1 day (transfer + sale window)
    SRC->>SRC: Fix transfer price (usually cost price + 5% handling)

    Note over SRC,AC: Execution
    SRC->>SRC: Create transfer note (handwritten, 2 copies):
    SRC->>SRC:   Transfer# T-001 | Date | Produce | Batch# | Qty | Cost/kg
    SRC->>SRC: Pick & pack items
    SRC->>DR: Hand over items + transfer note (1 copy)
    DR->>DST: Transport items to destination store
    DST->>DST: Receive & verify: item, qty, condition match note
    DST->>DR: Sign transfer note (2nd copy) — confirm receipt
    DR->>SRC: Return signed copy as proof

    Note over SRC,AC: Recording
    SRC->>SRC: Update stock register: deduct transferred qty
    DST->>DST: Update stock register: add received qty at transfer price
    SRC->>AC: Submit transfer note
    DST->>AC: Submit signed copy
    AC->>AC: Record transfer in inter-store transfer ledger
    AC->>AC: Note: no cash changes hands — internal adjustment

    Note over SRC,AC: Settlement (Monthly)
    AC->>AC: End of month: calculate net transfer balance
    AC->>AC: Store A sent 200 kg to Store B = Rs. 8,000
    AC->>AC: Store B sent 150 kg to Store A = Rs. 6,000
    AC->>AC: Net: Store B owes Store A Rs. 2,000
    AC->>AC: Adjust in overall P&L (internal accounting only)
```

### Transfer Decision Matrix

```
Source Stock Age      Destination Distance     Decision
──────────────────────────────────────────────────────────
> 80% shelf life      Any                      DON'T TRANSFER — too risky
50-80% shelf life     < 5 km                   TRANSFER (can sell same day)
50-80% shelf life     5-15 km                  TRANSFER with fast delivery
< 50% shelf life      Any distance             TRANSFER (good rotation)
```

### Edge Cases

| Situation | Handling |
|---|---|
| Items damaged in transit during transfer | Source store bears loss (since they picked). Record as transit waste |
| Destination store claims wrong quantity received | Cross-check signed transfer note. If discrepancy, reconcile |
| No vehicle available for transfer | Use auto-rickshaw for small qty (< 50 kg); batch with delivery run if aligned |
| Same-day transfer needed urgently | Use priority transport (motorcycle/courier) for small urgent qty |
| Transfer between stores with different pricing | Transfer at cost price; destination applies its own retail margin |

---

## 12. MULTI-SHOP WORKFLOW

**Actors**: Owner/Regional Manager, Store Manager (Store A), Store Manager (Store B), Central Accountant

**Flow**: Coordination, reporting, and decision-making across multiple store locations

```mermaid
sequenceDiagram
    participant OWN as Owner / Regional Manager
    participant SMA as Store Manager (Store A)
    participant SMB as Store Manager (Store B)
    participant CAC as Central Accountant

    Note over OWN,CAC: Daily Morning (8:00 AM)
    SMA->>OWN: WhatsApp: "Opening stock, today's prices set, any special instructions?"
    SMB->>OWN: WhatsApp: same
    OWN->>OWN: Note key differences: pricing, stock issues

    Note over OWN,CAC: Centralized Procurement Coordination
    alt Combined Order (top 20 common items)
        SMA->>CAC: Send expected qty needed for tomorrow
        SMB->>CAC: Send expected qty needed for tomorrow
        CAC->>CAC: Consolidate: Total qty = Store A + Store B + Buffer
        CAC->>SMA: Notify: "We're ordering X kg — your share is Y kg"
        CAC->>SMB: Notify: same
        CAC->>S: Place single bulk order at negotiated rate
        S->>CAC: Confirm delivery — split at source (pre-sorted for each store)
    else Store-Specific Items (each store orders independently)
        SMA->>SMA: Order independently
        SMB->>SMB: Order independently
    end

    Note over OWN,CAC: Mid-Day Coordination
    SMA->>OWN: "Running low on spinach — any spare?"
    OWN->>SMB: "Store A needs spinach — can you transfer?"
    SMB->>OWN: "I have 5 kg extra — can send"
    OWN->>SMA: "Transfer coming from Store B — 5 kg spinach"
    (Initiates Stock Transfer Workflow)

    Note over OWN,CAC: End of Day Reporting (8:00 PM)
    SMA->>CAC: Send daily flash report:
    CAC->>SMA: acknowledged
    SMB->>CAC: Send daily flash report:
    CAC->>SMB: acknowledged

    Note over OWN,CAC: Daily Flash Report Format

    Note right of CAC: Store: A | Date: 28-Jun-2026
    Note right of CAC: Sales: Rs. 28,450
    Note right of CAC: Purchases: Rs. 18,200
    Note right of CAC: Waste: Rs. 1,100 (3.9%)
    Note right of CAC: Cash: Rs. 12,300 | UPI: Rs. 13,150 | Card: Rs. 3,000
    Note right of CAC: Expenses: Rs. 1,200
    Note right of CAC: Gross Margin: Rs. 9,950 (35%)

    Note over OWN,CAC: Weekly Review (Sunday)
    CAC->>OWN: Compile weekly dashboard:
    CAC->>OWN:   Store-wise: Revenue, Margin %, Waste %, Top SKUs
    CAC->>OWN:   Combined: Total revenue, total margin
    CAC->>OWN:   Comparison: Store A vs Store B (who performed better?)
    OWN->>OWN: Identify:
    OWN->>OWN:   - Store A: higher margin, lower waste → best practices to share
    OWN->>OWN:   - Store B: higher revenue, but higher waste → investigate
    OWN->>OWN:   - Combined purchasing power increase = better supplier rates

    Note over OWN,CAC: Cross-Store Decisions
    OWN->>SMA: "Implement Store B's display layout — they sell more English veg"
    OWN->>SMB: "Adopt Store A's morning ordering routine to reduce waste"
    OWN->>CAC: "Negotiate with Supplier X for both stores — volume discount potential"
```

### Weekly Multi-Store Dashboard

```
WEEK 26 (22-28 Jun 2026)
────────────────────────────────────────────────────────────
Metric              Store A      Store B      Combined
────────────────────────────────────────────────────────────
Revenue             Rs. 1,89,000 Rs. 2,12,000 Rs. 4,01,000
COGS                Rs. 1,17,180 Rs. 1,35,680 Rs. 2,52,860
Gross Margin        Rs. 71,820   Rs. 76,320   Rs. 1,48,140
Margin %            38.0%        36.0%        36.9%
Waste %             4.1%         6.2%         5.2%
Total SKUs Sold     82           78           94
Top SKU (Rev)       Tomato       Onion        Tomato
Expenses            Rs. 8,600    Rs. 9,400    Rs. 18,000
Net Profit          Rs. 63,220   Rs. 66,920   Rs. 1,30,140
────────────────────────────────────────────────────────────
```

### Edge Cases

| Situation | Handling |
|---|---|
| One store has much higher waste than others | Root cause investigation: is it ordering practice, storage, or customer base? |
| Store managers compete rather than cooperate | Owner sets policy: transfers are mandatory for common good. Measure cooperation in review |
| Pricing differs across stores for same item | Allow regional pricing variation (different catchment areas). But cap difference at 10% to avoid brand confusion |
| Owner can't be online all day | Designate Regional Manager or use daily fixed-time check-ins (8 AM, 8 PM) |
| New store opening | Assign experienced SM from existing store for 2 weeks to transfer SOP knowledge |

---

## 13. CHEQUE LIFECYCLE WORKFLOW

**Actors**: Customer/Hotel (Payer), Store Manager, Accountant, Bank

**Flow**: Receiving, depositing, clearing, and handling cheques

```mermaid
sequenceDiagram
    participant P as Payer (Hotel / Customer)
    participant SM as Store Manager
    participant AC as Accountant
    participant BK as Bank

    Note over P,BK: Cheque Receipt
    P->>SM: Hand over cheque (as payment for invoice/bill)
    SM->>SM: Verify cheque details:
    SM->>SM:   Date (not future-dated, not > 3 months old)
    SM->>SM:   Amount (match invoice, in words & figures)
    SM->>SM:   Payee name (matches our business name exactly)
    SM->>SM:   Signature (present, matches payer's bank records)
    SM->>SM:   No overwriting or corrections
    SM->>SM: Make a photocopy / take photo of cheque
    SM->>AC: Hand over cheque + copy of invoice

    Note over P,BK: Cheque Deposit
    AC->>AC: Endorse cheque on back: "Account Payee" + store stamp + "For deposit only"
    AC->>AC: Fill deposit slip: date, account number, cheque details
    AC->>BK: Deposit at bank counter / drop in cheque box
    BK->>AC: Provide deposit acknowledgement (counterfoil)

    Note over P,BK: Cheque Deposit Register Entry
    AC->>AC: Record in cheque deposit register:

    Note right of AC: Date | Cheque# | Bank | Payer | Amount | Deposit Date | Expected Clearance | Status

    Note over P,BK: Clearing Period (T+2 or T+3)
    BK->>BK: Process cheque through clearing system
    alt Cheque Cleared
        BK->>AC: Credit to account (after 2-3 working days)
        AC->>AC: Check bank statement / SMS confirmation
        AC->>AC: Update register: Status = CLEARED
        AC->>AC: Allocate to invoice in accounts
    else Cheque Bounced / Dishonoured
        BK->>AC: Return cheque with bank memo (reason code)
        BK->>AC: Bank charges levied (typically Rs. 350-750)
        AC->>AC: Update register: Status = BOUNCED
        AC->>SM: Notify immediately
        SM->>SM: Contact payer
    end

    Note over P,BK: Bounce Handling
    SM->>P: Call: "Your cheque #12345 for Rs. 15,000 has been returned"
    SM->>SM: Understand reason: Insufficient funds? Signature mismatch? Account closed?

    alt Insufficient Funds
        SM->>P: Request payment with cash/UPI + bank charges
        SM->>P: Set deadline: 48 hours
    else Technical Reasons (signature, date, overwrite)
        SM->>P: Request replacement cheque with correction
    else Deliberate / Repeated Bounce
        SM->>SM: Escalate: Stop credit supply to this customer
        SM->>SM: Send legal notice if amount > Rs. 50,000
        SM->>SM: Consider filing under Negotiable Instruments Act, 1881
    end

    alt Payment Received After Bounce
        P->>SM: Pay via cash/UPI/DD — amount + bank charges
        SM->>AC: Record payment + bank charge recovery
        AC->>AC: Mark invoice as PAID
        SM->>P: Return bounced cheque (marked "CANCELLED") or keep as legal proof
    end
```

### Cheque Acceptance Policy

| Payer Type | Cheque Limit | Condition |
|---|---|---|
| New hotel account | No cheques for 1st month | Cash/UPI only |
| Established hotel (>3 months) | Up to Rs. 50,000 | One cheque per invoice |
| Premium hotel (>1 year, good history) | Up to Rs. 2,00,000 | Post-dated cheques accepted for future dates |
| Retail customer | No cheques accepted | Cash/UPI/Card only |
| Corporate customer (one-time large order) | Up to Rs. 25,000 | With manager approval |

### Cheque Register

```
CHEQUE DEPOSIT REGISTER — June 2026
──────────────────────────────────────────────────────────────────────────
Dep#  Date    Cheque#  Bank     Drawee     Amount  Status    ClearDate
──────────────────────────────────────────────────────────────────────────
C045  20-Jun  587412   HDFC    Hotel Taj  ₹28,450 CLEARED   23-Jun
C046  22-Jun  891234   ICICI   Hotel Rad  ₹15,000 BOUNCED   —
C047  24-Jun  345678   SBI     Hotel Mar  ₹42,000 PENDING   —
──────────────────────────────────────────────────────────────────────────
```

### Edge Cases

| Situation | Handling |
|---|---|
| Post-dated cheque (future date) | Do not deposit before date. In diary: reminder for deposit date |
| Cheque from third party (not the hotel account holder) | Do not accept — must be from account holder's own cheque |
| Lost cheque (customer claims issued, we never received) | Ask customer to issue stop-payment and reissue |
| Cheque amount in words & figures differ | Do not accept — bank will reject. Ask for corrected cheque |
| Customer requests to take back cheque (wants to pay cash instead) | Return only if cancelled / marked "CANCELLED" and signed by us |

---

## 14. CREDIT SETTLEMENT WORKFLOW

**Actors**: Hotel (B2B Customer), Store Manager, Accountant

**Flow**: Managing credit sales, invoicing, payment collection, and overdue handling

```mermaid
sequenceDiagram
    participant H as Hotel
    participant SM as Store Manager
    participant AC as Accountant

    Note over H,AC: Credit Setup (Once per hotel)
    AC->>H: Collect: GST certificate, business address, credit reference
    SM->>SM: Set credit limit & payment terms (as per policy)
    AC->>AC: Create hotel account in ledger

    Note over H,AC: Ongoing: Deliveries on Credit
    H->>SM: Place orders (daily or as needed) — per Hotel Order Workflow
    SM->>SM: All deliveries recorded with signed delivery notes
    SM->>AC: Submit delivery notes

    Note over H,AC: Invoicing Cycle
    AC->>AC: Saturday (weekly): compile all deliveries for each hotel
    AC->>AC: Generate invoice per hotel:
    AC->>AC:   Invoice#, Hotel, Period, Line items (date, produce, qty, rate, amount)
    AC->>AC:   Subtotal, Discount, GST, Grand Total, Due Date
    AC->>AC:   Payment Terms: XX days from invoice date
    AC->>H: Send invoice (WhatsApp / Email)

    H->>H: Verify invoice against delivery notes
    alt Invoice Accepted
        H->>AC: Confirm receipt, schedule payment
    else Dispute
        H->>AC: Raise dispute (wrong quantity, wrong rate, quality issue)
        AC->>SM: Cross-check with delivery notes & contract
        AC->>H: Issue corrected invoice OR debit note
    end

    Note over H,AC: Payment Follow-up
    AC->>AC: Track: days since invoice date

    alt Day 0-15 (Normal Period)
        AC->>AC: No action — within credit period
    else Day 16-30 (Approaching Due)
        AC->>H: Gentle reminder WhatsApp: "Invoice #123 due on dd/mm — please process"
    else Day 31-45 (Overdue)
        AC->>H: Follow-up call: "Sir, payment overdue by X days — please clear"
        AC->>SM: Notify: hotel X is overdue
    else Day 46-60 (Seriously Overdue)
        SM->>H: Call hotel manager directly: "Need payment urgently"
        SM->>SM: Hold further deliveries (if policy allows)
        AC->>AC: Send formal payment reminder (written/email)
    else Day 61+ (Critical)
        SM->>SM: Suspend all further supplies
        SM->>OWN: Escalate to owner
        OWN->>H: Final notice: pay within 7 days or legal action
        AC->>AC: Move to "Doubtful Debt" — provision in books
    end

    Note over H,AC: Payment Received
    H->>AC: Make payment (cheque, bank transfer, UPI)
    AC->>AC: Allocate payment to specific invoice(s)
    AC->>AC: Update invoice status = PAID
    AC->>AC: Clear from outstanding report
    AC->>H: Send payment receipt / acknowledgment
```

### Credit Policy Matrix

| Hotel Monthly Volume | Credit Limit | Credit Period | Max Outstanding |
|---|---|---|---|
| < Rs. 30,000 | Rs. 15,000 | 7 days | Rs. 7,500 |
| Rs. 30,000 - 75,000 | Rs. 50,000 | 15 days | Rs. 37,500 |
| Rs. 75,000 - 1.5 Lakh | Rs. 1,00,000 | 30 days | Rs. 1,00,000 |
| > Rs. 1.5 Lakh | Rs. 2,00,000 | 45 days | Rs. 2,25,000 |

### Outstanding Aging Report

```
HOTEL OUTSTANDING AGING — as of 28-Jun-2026
─────────────────────────────────────────────────────────────────
Hotel       Total     0-15d     16-30d    31-45d    46+ d    Status
─────────────────────────────────────────────────────────────────
Hotel Taj   ₹28,450   ₹28,450   —         —         —        OK
Hotel Rad   ₹45,000   ₹15,000   ₹30,000   —         —        Follow up
Hotel Mar   ₹62,000   —         ₹20,000   ₹42,000   —        ⚠️ Overdue
Hotel Bay   ₹15,000   —         —         —         ₹15,000  🔴 SUSPENDED
─────────────────────────────────────────────────────────────────
Total      ₹1,50,450  ₹43,450   ₹50,000   ₹42,000   ₹15,000
─────────────────────────────────────────────────────────────────
```

### Edge Cases

| Situation | Handling |
|---|---|
| Hotel makes part payment | Allocate to oldest invoice first. Track partial payment against invoice |
| Hotel requests credit period extension | Evaluate relationship & history. If strong → extend 15 days once. Document approval |
| Hotel disputes invoice after 2 weeks | If genuine error → correct. If delay tactic → hold firm, reference signed delivery notes |
| Hotel closes down / stops operations | Write off as bad debt. File as business loss for tax. Review credit assessment process |
| Hotel pays but complains about quality from past deliveries | Accept feedback, offer discount on next order, but do not reduce past invoice amount after payment |
| Owner's friend/family hotel — wants special credit terms | Policy applies to everyone. Exception only with owner's written approval |

---

## 15. CLOSING PROCESS WORKFLOW

**Actors**: Cashier, Store Manager, Accountant

**Flow**: End-of-day procedures — financial, inventory, administrative close

```mermaid
sequenceDiagram
    participant CA as Cashier
    participant SM as Store Manager
    participant AC as Accountant
    participant CUS as Customers (Last Walk-ins)

    Note over CUS,AC: Step 1: Last Customer (Closing Time — e.g., 8:00 PM)
    CUS->>CA: Last few customers complete purchases
    CA->>SM: Confirm: "No more customers entering"

    Note over CUS,AC: Step 2: Cash Count & Reconciliation
    CA->>CA: Count cash in drawer by denomination
    CA->>CA: Note: total cash = 500×?? + 100×?? + ... + coins
    CA->>SM: Submit cash count + sales log + expense slips
    SM->>SM: Verify cash count vs sales log
    SM->>SM: Expected cash = Opening Float + Cash Sales - Expenses Paid from Cash
    SM->>SM: Variance = Actual Cash - Expected Cash
    SM->>SM: Record variance (if any) with explanation

    alt Variance > Rs. 50
        SM->>CA: Discuss and investigate
    end

    Note over CUS,AC: Step 3: Electronic Payment Reconciliation
    SM->>SM: Check UPI app: total UPI received today
    SM->>SM: Check POS machine: total card swipes today
    SM->>SM: Verify against sales log UPI + Card entries
    SM->>SM: Note any discrepancies

    Note over CUS,AC: Step 4: Inventory Count (Selective)
    SM->>SM: Count remaining stock of mushroom & leafy greens (daily)
    SM->>SM: Spot-check 5 high-value items (English veg)
    SM->>SM: Record closing counts in stock register
    SM->>SM: Move aging stock to markdown area for tomorrow
    SM->>SM: Identify expired/spoiled items → move to spoilage area

    Note over CUS,AC: Step 5: Spoilage Recording
    SM->>SM: Weigh & record all expired/spoiled produce
    SM->>SM: Enter into spoilage register (per earlier workflow)
    SM->>SM: Dispose of spoiled items (donation/compost/landfill)

    Note over CUS,AC: Step 6: Store Clean & Restock
    SM->>SM: Clean display counters, shelves, weighing area
    SM->>SM: Restock display with remaining fresh produce (for next morning)
    SM->>SM: Check cold storage temperature
    SM->>SM: Secure all storage areas

    Note over CUS,AC: Step 7: Cash & Valuables Deposit
    SM->>SM: Prepare daily cash deposit:
    SM->>SM:   Keep cash float for next day (as per policy — e.g., Rs. 5,000)
    SM->>SM:   Pack remaining cash for bank deposit / night safe / owner collection
    SM->>SM:   Or keep in store safe if deposit next morning
    SM->>SM: Lock cash in safe

    Note over CUS,AC: Step 8: Daily Flash Report
    SM->>SM: Compile daily flash:
    SM->>SM:   Total Sales (Cash + UPI + Card)
    SM->>SM:   Total Purchases (from procurement log)
    SM->>SM:   Total Expenses (from expense log)
    SM->>SM:   Total Spoilage Value (from spoilage log)
    SM->>SM:   Gross Margin = Sales - Purchases
    SM->>SM:   Net = Gross Margin - Expenses - Spoilage
    SM->>SM:   Closing Cash in Hand
    SM->>SM:   Stock Counts (mushroom, leafy greens, top 5 items)
    SM->>AC: Send daily flash (WhatsApp / phone call)

    Note over CUS,AC: Step 9: Lock Up & Depart
    SM->>SM: Switch off: lights, fans, cold storage (check)
    SM->>SM: Arm alarm / lock doors
    SM->>SM: Set next day's alarm for opening
    SM->>SM: Depart
```

### Daily Flash Report Template

```
─────────────────────────────────────
DAILY FLASH — Store A
Date: 28-Jun-2026 | Prepared by: Rajesh
─────────────────────────────────────
SALES:
  Cash:     ₹ 18,250
  UPI:      ₹ 12,400
  Card:     ₹  3,100
  ─────────────────
  TOTAL:    ₹ 33,750

PURCHASES:  ₹ 21,500
EXPENSES:   ₹  1,200

SPOILAGE:
  Qty:      3.5 kg
  Value:    ₹    480  (1.4% of sales)
  Top item: Spinach (2 kg)

GROSS MARGIN: ₹ 12,250 (36.3%)
NET MARGIN:   ₹ 10,570 (31.3%)

CASH POSITION:
  Opening Float:  ₹  5,000
  Cash Collected: ₹ 18,250
  Expenses Paid:  ₹  1,200
  Closing Cash:   ₹ 22,050
  (Float for tomorrow: ₹ 5,000)
─────────────────────────────────────
```

### Edge Cases

| Situation | Handling |
|---|---|
| Closing cash doesn't match by > Rs. 100 | Do not leave until discrepancy found. Review CCTV if needed |
| UPI settlement not received by closing time | Note expected amount; reconcile next day when settlement arrives in bank |
| Large spoilage discovered at closing | Photograph, record, investigate root cause before disposing |
| Customer comes 5 min after closing | Policy: "Closed" sign out. If elderly/regular, accommodate once but note |
| Door lock broken / security issue | Do not leave store unattended. Call owner for instructions |

---

## 16. OPENING PROCESS WORKFLOW

**Actors**: Store Manager, Cashier, Sales Staff

**Flow**: Morning procedures — preparing store for daily operations

```mermaid
sequenceDiagram
    participant SM as Store Manager
    participant CA as Cashier
    participant SS as Sales Staff
    participant D as Delivery Person

    Note over SM,D: Step 1: Opening (Before 7:00 AM)
    SM->>SM: Arrive at store (30 min before opening)
    SM->>SM: Disable alarm, unlock doors
    SM->>SM: Check: any overnight issues (theft, pest, power failure)
    SM->>SM: Turn on: lights, fans, cold storage

    Note over SM,D: Step 2: Receive Day's Procurement
    D->>SM: Deliver ordered produce (Procurement Workflow)
    SM->>SM: Receive, inspect, grade, record — per Procurement Workflow
    SM->>SM: Transfer to storage & display areas

    Note over SM,D: Step 3: Set Today's Prices (Most Critical Step)
    SM->>SM: Check mandi rate (phone / app / WhatsApp group)
    SM->>SM: Get y'day's retail price from previous day's log
    SM->>SM: Compute new prices:
    SM->>SM:   New cost > yesterday cost → may increase price
    SM->>SM:   New cost < yesterday cost → can reduce price (or maintain margin)
    SM->>SM:   Check contract prices for hotel orders
    SM->>SM: Write today's price list on chalkboard / shelf labels

    Note over SM,D: Step 4: Cash Float Setup
    CA->>SM: Request opening float
    SM->>CA: Provide cash float from safe (e.g., Rs. 5,000 in small denominations)
    CA->>CA: Organize cash in drawer: notes by denomination, coins separate
    CA->>CA: Count & confirm float amount
    CA->>SM: Confirm: "Cash float received: Rs. 5,000"
    SM->>SM: Record in cash register: Opening Float = Rs. 5,000

    Note over SM,D: Step 5: Stock Display & Store Preparation
    SS->>SM: Arrive for duty
    SM->>SS: Assign tasks:
    SM->>SS:   Display fresh produce — best quality in front
    SM->>SS:   Remove any remaining yesterday stock (bring forward if fresh) OR mark down
    SM->>SS:   Spray water on leafy greens (to keep fresh)
    SM->>SS:   Arrange by category with clear price labels
    SS->>SM: Confirm: display ready

    Note over SM,D: Step 6: Equipment Check
    SM->>SM: Check weighing scales:
    SM->>SM:   Zero reading? Calibrate with known weight
    SM->>SM:   Clean scale platform
    SM->>SM: Check UPI QR code is visible & not tampered
    SM->>SM: Check POS machine (if card payments) — connected, paper roll present
    SM->>SM: Check billing book / printer paper

    Note over SM,D: Step 7: Hotel Order Check
    SM->>SM: Check WhatsApp for hotel orders received overnight
    SM->>SM: Prioritize: mark urgent orders for early picking
    SM->>SM: Note any special requests

    Note over SM,D: Step 8: Morning Huddle (5 min)
    SM->>SS: Quick team meeting:
    SM->>SS:   "Today's special items / promotions"
    SM->>SS:   "Price changes to be aware of"
    SM->>SS:   "Any known issues from yesterday"
    SM->>SS:   "Today's targets"

    Note over SM,D: Step 9: Open for Business
    SM->>SM: Check: all ready?
    SM->>SM: Open main door / roll up shutter
    SM->>SM: Switch on "OPEN" sign
    SM->>SM: Greet first customers of the day
```

### Morning Opening Checklist

| ✓ | Time | Task | Done By |
|---|---|---|---|
| ☐ | 6:30 AM | Arrive, disable alarm, turn on utilities | SM |
| ☐ | 6:45 AM | Receive & inspect procurement delivery | SM |
| ☐ | 6:50 AM | Log procurement in stock register | SM |
| ☐ | 7:00 AM | Set today's prices (mandi check + compute) | SM |
| ☐ | 7:05 AM | Cashier: receive float & set up cash drawer | CA |
| ☐ | 7:10 AM | Display fresh produce, remove old stock | SS |
| ☐ | 7:15 AM | Check & calibrate scales | SM |
| ☐ | 7:20 AM | Check UPI POS billing readiness | CA |
| ☐ | 7:25 AM | Review overnight hotel orders | SM |
| ☐ | 7:30 AM | Morning huddle (5 min) | All |
| ☐ | 7:35 AM | Open store | SM |

### Price Setting Logic (Morning)

```
Today's Cost (C_today) = Price paid to supplier this morning
Yesterday's Cost (C_yest) = Price paid yesterday
Yesterday's Retail (R_yest) = Selling price yesterday
Target Margin (M) = Per-category minimum (20-40%)

Decision:
  IF C_today >= C_yest THEN
    R_today = C_today × (1 + M)
  ELSE (C_today < C_yest)
    Option A: R_today = R_yest (maintain price, higher margin today)
    Option B: R_today = C_today × (1 + M) (lower price, competitive)

For Hotel Contract Items:
  R_hotel = R_today × (1 - Contract Discount%)
  (BUT cannot exceed contract's agreed ceiling price)
```

### Edge Cases

| Situation | Handling |
|---|---|
| Mandi rate not yet available at 7 AM | Use yesterday's cost + 5% buffer. Adjust price once rate arrives |
| Weighing scale not working (no backup) | Use backup manual scale. If none → urgent purchase from nearest shop |
| Delivery hasn't arrived by 7 AM | Open with yesterday's remaining stock. Call supplier for ETA |
| Cashier calls in sick | SM or trained backup staff operates cash counter |
| Power cut (no lights, no cold storage) | Open if enough natural light. Transfer temp-sensitive stock to ice boxes. Priority: fix electricity |
| Yesterday's stock still significant | Heavy markdown first thing. Display new stock behind old to push old stock first |
| Staff not reporting on time | SM + available staff manage; call backup |
| UPI app not working / QR code tampered | Use backup printed QR code. If none, accept only cash until fixed |

---

## Process Dependency Map

```
OPENING (7 AM)
  │
  ├── Procurement (receives delivery)
  ├── Pricing (sets today's rates)
  ├── Cash Setup (float ready)
  ├── Display Setup (store ready)
  └── Hotel Order Review
        │
  ┌─────┴──────────────────────────────────────┐
  │                                            │
  ▼                                            ▼
RETAIL SALES (7:30 AM - 8 PM)          HOTEL ORDER PROCESSING (10 AM - 1 PM)
  │                                            │
  ├── Customer Billing ◄── Pricing              ├── Order Picking ◄── Inventory
  ├── Customer Payments                        ├── QC Check ◄── Quality
  │    ├── Cash                                ├── Dispatch
  │    ├── UPI                                 └── Delivery ◄── Logistics
  │    └── Card                                      │
  ├── Returns ◄── Spoilage                          ▼
  │                                            HOTEL DELIVERY (1-4 PM)
  └── Stock Monitoring ◄── Inventory                 │
        │                                            ├── Acceptance
        ├── Markdown                                 └── Rejection
        ├── Transfers (inter-store)                       │
        └── Spoilage Recording                           ▼
              │                                   INVOICING (Weekly)
              ▼                                     │
        DISPOSAL                                    ▼
                                             CREDIT SETTLEMENT
                                               │
  ┌────────────────────────────────────────────┤
  │                                            │
  ▼                                            ▼
CLOSING (8 PM)                           SUPPLIER PAYMENT (COD/Weekly)
  │
  ├── Cash Reconciliation ◄── Payments
  ├── Inventory Count ◄── Stock
  ├── Spoilage Recording
  ├── Daily Flash Report
  └── Store Secured

(Next day loops back to OPENING)
```
