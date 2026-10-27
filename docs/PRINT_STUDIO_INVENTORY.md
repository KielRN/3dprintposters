# Print Studio Inventory

Last updated: 2026-10-24

This is the current source of truth for owner-reported printing equipment,
filament, and physical packing supplies, with verified account-access checks
identified separately. Supplier research, historical prices,
and experiment evidence remain in
[the fulfillment research](../research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md).

## Current Summary

- **Equipment:** one Snapmaker U1, `3DPrintYou-U1`, with four factory 0.4 mm
  nozzles. Local Moonraker access, slicing, upload, and print start were verified
  on 2026-10-24. The open SAMLA top-cover base plate 1 was observed actively
  printing in black PLA on physical toolhead 2 and later confirmed complete at
  116/116 layers. The owner removed it; plate 2 (FR) start is accepted. Physical
  fit/finish remains unreviewed. See [U1 operations](SNAPMAKER_U1_OPERATIONS.md).
- **Filament on hand:** 15 spools across 11 reported color names. Red, Yellow,
  White, and Black each have an ANYCUBIC spool and an included printer spool;
  these are separate stock items and not necessarily matching shades.
- **Filament ordered:** one Overture Matte Skin PLA 1kg spool, ordered
  2026-10-23 and expected **2026-10-24**; one OVERTURE TPU 95A Black 1.75mm,
  1kg spool, ordered from Amazon for the spool case and expected **2026-10-25**.
  Neither delivery is confirmed.
- **Nominal material:** eleven reported 1kg spools on hand, plus four included
  Snapmaker PLA SnapSpeed spools reporting 500g nominal weight each by RFID.
  Remaining usable filament has not been weighed.
- **Spool-case parts:** owner confirmed an Amazon parts order on 2026-10-24;
  individual components, quantities, prices, and delivery dates were not supplied.
- **Packaging:** branded gift box, logo seal, tissue, personalized card,
  protective insert, and outer carton are planned; stock on hand is unconfirmed.

## Filament Register

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
| FIL-014 | Snapmaker SnapSpeed; RFID manufacturer Polymaker | White #E2DEDB | PLA, 1.75mm | 1 | 500g per RFID | On hand; physical toolhead 1 / T0; feed reported loaded |
| FIL-015 | Snapmaker SnapSpeed; RFID manufacturer Polymaker | Black #080A0D | PLA, 1.75mm | 1 | 500g per RFID | On hand; physical toolhead 2 / T1; feed and active printing verified 2026-10-24 |
| FIL-016 | Overture Matte, with spool | Matte Skin | PLA, 1.75mm | 1 | 1kg | Ordered 2026-10-23; expected 2026-10-24 |
| FIL-017 | OVERTURE TPU 95A Flexible | Black | TPU 95A, 1.75mm | 1 | 1kg | Ordered from Amazon; owner confirmed 2026-10-24; expected 2026-10-25; for spool case |

Toolhead assignments above are a 2026-10-24 snapshot; recheck them before a job.
RFID presence alone does not establish that filament is fed. TPU is an incoming
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
