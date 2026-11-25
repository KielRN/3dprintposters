# Print Studio Inventory

Last updated: 2026-11-24 (working four-color Chibi palette; spool balances from the 2026-11-06 checkpoint; other supplies retain their dated evidence)

This records owner-reported printing equipment and physical packing supplies.
Current shared filament balances live in the home ledger linked below;
verified account-access checks are
identified separately. Supplier research, historical prices,
and experiment evidence remain in
[the fulfillment research](../research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md).

### Shared spool checkpoint - 2026-11-06

Owner requested approximate grams left for every spool after a chat-history
audit. The canonical [home inventory](../../Home3DPrinting/INVENTORY.md),
[shared ledger](../../Home3DPrinting/SPOOL_LEDGER.json) and
[audit](../../Home3DPrinting/SPOOL_AUDIT_2026-11-06.md) now cover **19 physical
spools: 18 PLA and one TPU**. Use those balances for business jobs too; update
each unique attempt there once, rather than subtracting independently here.
All balances are estimates, not weighed. FIL-018 white is ~90 g; FIL-019 white
is ~866 g after R06. FIL-014 white is ~230 g including prior-test allowance;
FIL-015 black retains the later owner ~15 g baseline. See the ledger for all
other spools and assumptions, especially FIL-001's unrecorded intervening use.
Current loading: port 2 empty; ELEGOO FIL-018 in port 3/T2 and FIL-019 in
port 4/T3 per owner; port 1 last recorded FIL-014. Official Snapmaker Orca UI
only for printer operations until owner explicitly enables the MCP. Recheck
physical spool identity/feed each job. No physical consumption occurs on a
loading/storage change or a slice/upload alone.

### Working four-color Chibi palette - 2026-11-24

Owner-approved working U1 load for four-color Chibi figurine tests. This is a
test palette, not a validated production palette.

| Slot role | Filament | Covers |
| --- | --- | --- |
| Black | Black PLA (FIL-015 is LOW; FIL-001 ANYCUBIC Black is the backup) | Hair, outlines, pupils |
| White | White PLA (FIL-014, FIL-018 or FIL-019) | Eyes, highlights, light trim |
| Skin | Overture Matte Skin FIL-016 (`#F0DDC2` maker swatch) | Face, hands, exposed skin |
| Costume | Swapped per style or design (e.g. FIL-006 Blue for the tested heroine) | Main outfit color |

Basis: Meshy's cartoon four-color conversion of the Chibi heroine in
`exp-022-u1-four-color-chibi` chose near-black, light off-white, deep blue, and
tan. The orange substitute failed as skin. See
[the fulfillment research](../research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md).
Meshy chooses its own palette, so map its output slots to these spools by hand
in the slicer. Toolhead order is not fixed: record the actual tool-to-spool
mapping per job.

First four-color print (75 mm Chibi, 2026-11-25): the owner likes the multicolor.
The blue cape did not show and the cause is open. Details are in
[U1 operations](SNAPMAKER_U1_OPERATIONS.md#outcome). Still unvalidated: Matte
Skin's printed shade and sheen next to standard PLA (not yet reported), the
palette at 100 mm, and whether some designs need a fifth tone (brown or gold).
Recording this palette does not change what is currently loaded.

### Historical checkpoint - 2026-10-28

The same physical spools are also used for home prints. The more recent
[home inventory](../../Home3DPrinting/INVENTORY.md) and
[attempt history](../../Home3DPrinting/PRINT_HISTORY.md) record home usage;
retain the same FIL-* IDs and reconcile each attempt only once across projects.
The owner confirms none of the original four loaded spools has been changed:
tool 1/T0 white FIL-014, tool 2/T1 black FIL-015, tool 3/T2 red FIL-012,
tool 4/T3 yellow FIL-013. Black remains LOW; its earlier approximately 3% / 15 g
balance is a visual estimate, not a current scale measurement. Home drybox R01
has already been reconciled once against white FIL-014, leaving approximately
240 g at most before prior small tests and additional startup/purge use. Red and
yellow were nearly full per the owner's October 25 report; exact balances remain
unknown. Chibi experiment preparation alone records no filament consumption.

## Historical Summary (2026-10-28; filament superseded above)

- **Equipment:** one Snapmaker U1, `3DPrintYou-U1`, with four factory 0.4 mm
  nozzles. Local Moonraker access, slicing, upload, and print start were verified
  on 2026-10-24. The open SAMLA top-cover base plate 1 was observed actively
  printing in black PLA on physical toolhead 2 and later confirmed complete at
  116/116 layers. The owner removed it; plate 2 (FR) start is accepted. Physical
  fit/finish remains unreviewed. See [U1 operations](SNAPMAKER_U1_OPERATIONS.md).
- **Filament on hand:** 16 PLA spools across 12 reported color names, including
  skin-tone FIL-016 confirmed on hand by the owner on 2026-10-28, plus
  received black TPU FIL-017. Red, Yellow,
  White, and Black each have an ANYCUBIC spool and an included printer spool;
  these are separate stock items and not necessarily matching shades.
- **Recent filament receipts:** skin-tone PLA FIL-016 is on hand, confirmed by
  the owner on 2026-10-28 against the existing Overture Matte Skin order;
  label, condition and remaining weight have not been rechecked. OVERTURE TPU
  95A Black 1.75mm FIL-017 was received per the owner's October 25 report in the
  home inventory. Neither has replaced a loaded PLA spool.
- **Nominal material:** eleven reported 1kg spools on hand, plus four included
  Snapmaker PLA SnapSpeed spools reporting 500g nominal weight each by RFID.
  Remaining usable filament has not been weighed.
- **Spool-case parts:** owner confirmed an Amazon parts order on 2026-10-24;
  individual components, quantities, prices, and delivery dates were not supplied.
- **Packaging:** branded gift box, logo seal, tissue, personalized card,
  protective insert, and outer carton are planned; stock on hand is unconfirmed.

## Filament Register (identity/purchase reference; balances in shared ledger)

One row represents one physical spool. IDs stay with the spool as it is opened,
loaded, or used up. Color names are label/reported names, not calibrated matches
to a photograph, model palette, or another brand's similarly named color.

| ID | Brand / line | Reported color | Material | Qty | Nominal net weight | Status / expected arrival |
| --- | --- | --- | --- | --- | --- | --- |
| FIL-001 | ANYCUBIC bundle | Black | PLA | 1 | 1kg | On hand |
| FIL-002 | ANYCUBIC bundle | White | PLA | 1 | 1kg | On hand |
| FIL-003 | ANYCUBIC bundle | Texture Grey | PLA | 1 | 1kg | On hand |
| FIL-004 | ANYCUBIC bundle | Clear | PLA | 1 | 1kg | On hand |
| FIL-005 | ANYCUBIC bundle | Red | PLA | 1 | 1kg | On hand |
| FIL-006 | ANYCUBIC bundle | Blue | PLA | 1 | 1kg | On hand |
| FIL-007 | ANYCUBIC bundle | Green | PLA | 1 | 1kg | On hand |
| FIL-008 | ANYCUBIC bundle | Orange | PLA | 1 | 1kg | On hand |
| FIL-009 | ANYCUBIC bundle | Yellow | PLA | 1 | 1kg | On hand |
| FIL-010 | ANYCUBIC bundle | Purple | PLA | 1 | 1kg | On hand |
| FIL-011 | Bambu Lab, color 10204, with spool | Hot Pink | PLA | 1 | 1kg | On hand |
| FIL-012 | Snapmaker SnapSpeed; RFID manufacturer Polymaker | Red #E72F1D | PLA, 1.75mm | 1 | 500g per RFID | On hand; RFID at physical toolhead 3 / T2 |
| FIL-013 | Snapmaker SnapSpeed; RFID manufacturer Polymaker | Yellow #F4C032 | PLA, 1.75mm | 1 | 500g per RFID | On hand; RFID at physical toolhead 4 / T3 |
| FIL-014 | Snapmaker SnapSpeed; RFID manufacturer Polymaker | White #E2DEDB | PLA, 1.75mm | 1 | 500g per RFID | Original spool remains on toolhead 1 / T0, owner confirmed 2026-10-28; roughly 240g at most by home-use estimate, not weighed |
| FIL-015 | Snapmaker SnapSpeed; RFID manufacturer Polymaker | Black #080A0D | PLA, 1.75mm | 1 | 500g per RFID | LOW; original spool remains on toolhead 2 / T1, owner confirmed 2026-10-28; earlier approximately 3% / 15g visual estimate, not weighed |
| FIL-016 | Overture Matte, with spool | Matte Skin | PLA, 1.75mm | 1 | 1kg | Received; owner confirmed having skin-tone spool 2026-10-28; not loaded; label/condition not rechecked |
| FIL-017 | OVERTURE TPU 95A Flexible | Black | TPU 95A, 1.75mm | 1 | 1kg | Received, owner confirmed 2026-10-25 in home inventory; not loaded; for spool case |
| FIL-018 | ELEGOO, cardboard spool | White | PLA, 1.75mm | 1 | 1kg | Received/loaded Nov 4 port 3/T2; ~90g estimated after home R02-R05; canonical shared ledger |
| FIL-019 | ELEGOO, cardboard spool | White | PLA, 1.75mm | 1 | 1kg | Received/loaded Nov 4 port 4/T3; ~866g estimated after home R06; canonical shared ledger |

Toolhead assignments above are a 2026-10-24 snapshot; recheck them before a job.
RFID presence alone does not establish that filament is fed. TPU is a received
material for the separate spool-case project; it is not loaded or validated with
a U1 TPU profile, and the active SAMLA top-cover print uses black PLA.
For all spools, storage location, remaining net grams, and batch/lot are not yet
recorded; opened/sealed state is unknown except where loaded use is verified.
Do not assume that nominal weight
equals remaining filament. FIL-011's previously reported label specifies 1.75mm,
+/-0.03mm tolerance, and a 190-230 C range; this is label information, not a
calibrated U1 printing profile.

Purchase references:

- [ANYCUBIC ten-color bundle](https://www.amazon.com/dp/B0F2SH32F3).
- [Overture Matte Skin](https://www.amazon.com/dp/B0991QTSM5?th=1). The owner
  confirmed ordering after the Amazon listing was checked. The observed listing
  price was $17.09 USD; actual paid subtotal, tax, and shipping were not supplied.
- [Snapmaker U1](https://www.amazon.com/dp/B0GYP89RTN); four included spools were
  reported directly by the owner, not inferred as additional purchased stock.

## Equipment

| ID | Item | Qty | Current status | Next update to record |
| --- | --- | --- | --- | --- |
| EQ-001 | Snapmaker U1, four factory 0.4 mm toolheads | 1 | Local API and first black-PLA plate completion verified 2026-10-24; owner removed FL part; FR plate start accepted | Fit/finish review, remaining cover plates, and representative Chibi validation |

### Snapmaker Account And Access - 2026-10-23

- Account profile name changed to **3DPrintYou** and verified by reading back
  both the Snapmaker Space profile and universal account.
- Linked printer name: **3DPrintYou-U1**. Snapmaker authentication and device-list
  requests succeeded, with the printer reporting online at the time of the check.
- Credentials are stored only in the ignored root `.env` as
  `SNAPMAKER_APP_USER_ID` and `SNAPMAKER_APP_PASSWORD`; document variable names
  only, never values or session tokens. Changing the profile name did not change
  the sign-in email.
- No printer commands were sent during the October 23 account check. The
  October 24 local workflow subsequently verified printer readiness, desktop
  slicing, upload, start, and first plate completion. Camera access, physical
  fit/finish, and full commissioning remain unverified. Account/local access is not an
  implemented app-to-printer integration.

### Local Printing Evidence - 2026-10-24

See [U1 operations](SNAPMAKER_U1_OPERATIONS.md) for API endpoints, slicer recovery,
physical tool mapping, and the plate log. Machine-specific connection details
and receipt paths stay in the ignored `elliot_quick_dev_Startup.md`.

The first authorized job is the open IKEA SAMLA top-cover base, plate 1 (FL),
using FIL-015 black PLA on T1. Its final slicer estimate is 63.45g and
1h 17m 40s plus startup. Plate 1 completed; the printer reported 21,270.75mm of
filament use, not a weighed remaining spool balance. Do not deduct the slicer
estimate as measured inventory depletion. Plate 2 (FR), estimated 64.58g, was
started after the owner removed FL and confirmed the bed clear. Plates 3-7
require the owner to remove parts and confirm a clear bed before each next start.

Other tools, spare parts, dryers, storage bags, desiccant, adhesives, and cleaning
supplies have not been inventoried. This means unknown, not absent.

## Packaging And Other Supplies

| ID | Item | Proposed specification | Stock status |
| --- | --- | --- | --- |
| PKG-001 | White gift boxes | Stock size selected after physical fit trial | Planned; on-hand quantity unconfirmed |
| PKG-002 | Logo seals | Approximately 2-inch round matte stickers | Planned; on-hand quantity unconfirmed |
| PKG-003 | Tissue paper | Plain cream | Planned; on-hand quantity unconfirmed |
| PKG-004 | Personalized cards | Proposed 4 x 6-inch matte card | Planned; on-hand quantity unconfirmed |
| PKG-005 | Protective inserts / pads | Fit-tested cradle or supports | Planned; on-hand quantity unconfirmed |
| PKG-006 | Outer shipping cartons | Sized around the tested gift pack and cushioning | Planned; on-hand quantity unconfirmed |
| PKG-007 | Shipping cushioning / tape | Selected with transit trial | Planned; on-hand quantity unconfirmed |

Detailed specifications and preliminary cost allowances are in the
[selected packaging plan](../research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md#selected-branded-gift-box-plan).
Supplier quotes and proposed purchases do not count as stock received.

## Keeping This Current

Owner instruction Nov 6: every physical spool needs an approximate numeric
grams-left balance, basis, confidence and date in the canonical shared home
ledger. Assumed nominal new-spool baselines must stay labeled assumptions.
Reconcile completed/failed/canceled attempts once, release reservations and
report approximate remaining grams; never subtract covered historical events
again after a new measured/owner remaining baseline.

- When the owner reports an order, add it as **ordered**, with quantity and
  expected arrival. Mark **on hand** only after receipt is confirmed.
- Record material, finish, exact color code/name, diameter, nominal weight,
  actual cost, and purchase reference when available. Keep duplicate colors from
  different brands or batches as separate rows.
- When a spool is loaded or moved, record its ID and toolhead/storage location.
  Record remaining net grams when weighed, or clearly label estimates. Spool
  gross weight includes the empty spool and is not remaining filament weight.
- After a print, log actual consumption when known; label slicer consumption as
  estimated and include supports, purge, and prime-tower material. No automatic
  printer or order integration currently updates this document.
- For supplies, track the useful unit (boxes, stickers, sheets, cards, or tape
  rolls), receipt date, quantity remaining, unit cost, and reorder threshold
  once consumption and replenishment lead time are known.
- Keep prices paid separate from shopping prices. Record **unknown** where the
  owner has not supplied a fact, rather than assuming a quantity or condition.

## Update Log

| Date | Source | Update |
| --- | --- | --- |
| 2026-10-21 | Prior owner-reported inventory in fulfillment research | ANYCUBIC ten-color bundle, Bambu Hot Pink, and one U1 recorded. |
| 2026-10-23 | Owner message in packaging/filament research chat | Skin-tone spool ordered, expected October 24; U1 unpacking underway, with included Red, Yellow, White, and Black spools. Created this current inventory register. |
| 2026-10-23 | Owner setup report and authenticated Snapmaker checks | Assembly progressed to calibration underway; account login succeeded and linked 3DPrintYou-U1 reported online. Profile name changed to 3DPrintYou and read back successfully. Calibration completion and first print remain unconfirmed. |
| 2026-10-24 | Local Moonraker/RFID checks, slicer export, and authorized print start | Recorded four 0.4 mm nozzles, SnapSpeed PLA RFID assignments, and open SAMLA FL plate printing on black T1. First completed print and physical quality pending. |
| 2026-10-24 | Owner's Amazon order report | Added FIL-017: one OVERTURE TPU 95A Flexible Black 1.75mm, 1kg spool for the spool case, expected 2026-10-25. Spool-case parts were also ordered; itemized components and receipt remain unconfirmed. |
| 2026-10-24 | Printer completion status and owner clear-bed confirmation | FL plate completed 116/116 layers; owner removed it. FR plate uploaded, mapped to black T1, and start accepted; completion pending. |
| 2026-10-28 | Owner no-spool-change confirmation and shared home inventory | Original white/black/red/yellow spools remain on tools 1/2/3/4. Black FIL-015 remains LOW. Linked home usage under the same spool IDs; noted received TPU and the existing white estimate. Chibi slice preparation consumes no stock and creates no second deduction. |
| 2026-10-28 | Owner skin-tone spool confirmation | Marked existing ordered FIL-016 as received/on hand in both shared inventories; no spool change or material consumption reported. |
