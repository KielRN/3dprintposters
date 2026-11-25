# Figurine Fulfillment Supply-Chain Research

Status: active

Started: 2026-08-08

Updated: 2026-10-24

Owner: TBD

## Purpose

Choose a repeatable physical-fulfillment path for the approximately 150mm personalized figurine product. The first comparison is the current San Antonio baseline against Mexico-based 3D printing and hand-painting options, including both combined suppliers and coordinated printer/painter pairs.

This file is the durable working record for supplier research, open questions, evidence, and workstream decisions. High-level status belongs in `docs/ROADMAP.md`; durable product policy belongs in `DECISIONS.md`; completed repository changes belong in `CHANGELOG.md`.

Current equipment, individual filament spools, orders in transit, and packing-supply stock are tracked in [Print Studio Inventory](../docs/PRINT_STUDIO_INVENTORY.md). Historical snapshots below are experiment context; use the inventory register for what is currently owned or ordered.

2026-10-24 studio update: local Moonraker connectivity, compatible U1 slicing,
upload, and start were verified for the open IKEA SAMLA top-cover base, plate 1
(FL), with active black SnapSpeed PLA extrusion observed on toolhead 2 / T1.
Plate 1 subsequently completed all 116 layers; the owner removed it and confirmed a clear bed, and plate 2 (FR) start was accepted. Physical fit/finish remains pending. This is an accessory-print
connection test, not validation of the Chibi multicolor manufacturing path.
See [U1 operations](../docs/SNAPMAKER_U1_OPERATIONS.md) for the evidence and
operator procedure. The owner also confirmed Amazon spool-case parts and one
OVERTURE TPU 95A Black 1.75mm/1kg spool expected 2026-10-25; receipt and TPU
printing are unverified. These belong to the separate spool-case project.

## Current Evidence

PolyX facts confirmed by the owner on 2026-08-11 and reconfirmed on 2026-08-26:

- Three finished sample figurines were picked up from PolyX 3D in San Antonio.
- The final painted cost was `$300` total, or exactly `$100` per finished model.
- The owner likes how the samples look, so visible sample quality passed this initial review.
- The total is still too high for the intended profitability model, particularly when painting labor is included.
- The exact print, cleanup, paint labor, materials, packaging, tax, and other cost allocation has not yet been itemized here.

Earlier pricing context reported on 2026-08-08:

- Painting was quoted or performed through an associated painter at `$20/hour`.
- The finished samples had initially been described as costing more than `$100` each after painting; the actual pickup payment was exactly `$100` each. The reason for the difference remains unresolved until the invoice or quote is itemized.

Repository facts:

- The product target is approximately `150mm` / 6 inches tall.
- The backend currently has fallback checkout amounts of `$99` unpainted and `$149` painted in `apps/functions/src/index.ts`; configured Stripe Price IDs may override those fallbacks.
- At the paid production cost of `$100`, the `$149` fallback painted price leaves exactly `$49` before customer shipping, payment fees, AI/provider cost, support, refunds, replacements, and overhead. This is a directional warning, not a completed margin calculation.
- PolyX visible sample quality has passed the owner's initial review, but partner selection remains a launch blocker because file compatibility, print readiness, itemized economics, policy, shipping, and repeatability have not been validated end to end.

Assumptions to test:

- Mexico may offer a lower landed cost for printing plus painting, but no Mexico supplier has been selected or validated.
- Early volumes may be too low for factory pricing, so the comparison must include prototype, 10-unit, 25-unit, and 50-unit economics.
- A combined print-and-paint supplier may reduce coordination risk, while separate specialist vendors may produce better quality or pricing.

## Customer Packaging Research - 2026-10-23

**Current owner selection, 2026-10-23:** use the **lower-cost branded gift box with logo seal, tissue, and personalized card** as the standard packaging direction. This supersedes the earlier same-day collector-window preference. Supplier, dimensions, artwork, and shipping construction still require sampling; no purchase has been authorized or made.

### Selected Branded Gift Box Plan

The owner selected the packaging components. The dimensions, colors, materials, quantities, card format, and cost targets below are proposed implementation defaults for the first physical trial, not separately approved purchasing specifications.

| Component | Proposed first-trial specification | Cost allowance per packed order |
| --- | --- | --- |
| Gift box | Plain white stock folding gift box with a clean lid closure; use 8 x 8 x 8.5 inches as a comparison sample, then select the smallest stock size that fits the measured assembled figure and protective insert | $3.26 catalog reference at 50; supplier, freight, and fit not approved |
| Logo seal | One approximately 2-inch round matte sticker bridging the outside lid/closure; existing approved customer-facing wordmark, ink on cream with an optional ember accent; proof adhesive on the actual box | $0.15-$0.40 target, unquoted |
| Tissue | One or two sheets of plain cream tissue, neatly folded around the protected insert; start unprinted to keep inventory simple | $0.10-$0.30 target, unquoted |
| Personalized card | 4 x 6-inch matte card, printed per order; recipient first name and optional approved gift message on front, short handling/care note on back | $0.25-$0.75 target, unquoted |
| Protective insert | Adjustable paperboard cradle with nonabrasive cushioning, or simple foam supports; secure the base and stronger body areas, with clearance around delicate features | $2-$5 allowance, unquoted |
| Outer shipping package | Separate corrugated carton, cushioning, and tape sized around the finished gift package after the protection trial | $3-$6 allowance, unquoted |

Estimated material consumption is **$8.76-$15.71 per order**, rounded to the existing **$9-$16** planning range. Aim for **$10-$12** after stock-size and packing trials, without reducing protection to hit the target. Excludes tax, inbound freight, labor, customer postage, and replacement allowance. The cost allowances are not current supplier quotes. Actual low-quantity sticker/card pricing or carrier-required cushioning can exceed them.

The [Cellobags catalog reference](https://www.cellobags.com/8x8x8-1-2-White-Gift-Boxes-p/bxgb888.htm) is $163.20 for 50 white 8 x 8 x 8.5-inch gift boxes ($3.264 each), checked during the same-day comparison. This is a size/price benchmark, not a selected supplier. A 50-box minimum means **$163.20 upfront for cartons alone**, even if only ten packages are being trialed. Obtain individual samples or a small local pack before committing to a case.

**Proposed card copy:**

> Made just for {recipientFirstName}.
>
> A little figure. A big personality.
>
> Thank you for letting us make it yours.

When an approved gift message exists, use it in place of the standard thank-you line and include the sender name only if supplied. Keep the same physical card format across styles; personalize it during packing rather than carrying separate printed-card inventory for every customer. Handwriting the name/message is acceptable for the first pilot.

Proposed reverse copy, to confirm against the actual material/finish: “Handle gently by the base. Display indoors, away from heat and direct sunlight. Dust gently with a soft brush.” Add the verified brand wordmark and customer-support destination after checking the current public brand. The app design guide names 3DPrintU, while the later public-acquisition decision uses 3dprintyou.com; do not invent a logo, print an obsolete domain, or add an unverified QR destination. Prepare printer artwork only once the customer-facing identity is reconciled.

**Packing sequence:**

1. Confirm the finished figure, nameplate, and personalized card belong to the same order. Inspect the figure and confirm any coating is fully cured.
2. Fit the protective cradle and pads. Tissue is presentation wrap, not the structural restraint or primary cushioning. Keep tissue seams, adhesive, and hard edges from rubbing painted surfaces; avoid pressure on hair, fingers, swords, or other accessories.
3. Fold the tissue neatly over the protected figure, leaving an easy opening fold. Place the personalized card on top so it is the first item seen when the lid opens.
4. Close the gift box and apply one logo seal consistently across the closure. Fit it inside the tested outer carton with cushioning on all sides.
5. Record package dimensions, weight, materials consumed, and packing time. Photograph the sample closed and open, then inspect again after the transit trial.

**Validation sequence and acceptance:**

1. Measure the accepted physical Chibi samples including bases and the widest/most delicate pose. Sample two stock box sizes around that envelope rather than choosing from nominal height alone.
2. Assemble **three complete prototype packs** using a logo-seal print proof, cream tissue, personalized card, and protective supports. Confirm an attractive reveal, easy removal by the base, correct personalization, and no movement or surface rubbing.
3. Run a **ten-pack pilot** after choosing the better fit. Include the largest pose and fragile-accessory examples, and include real parcel-transit trials rather than treating a tabletop shake check as proof of shipping safety. Record damage, scuffing, presentation condition, packing minutes, consumables, and actual postage. Investigate any failure and retest before customer rollout; ten packs are an initial screen, not a statistically established damage rate.
4. Approve the standard box/insert combination only after the sample owner accepts appearance and the shipping trial preserves the figurine and gift box. Recheck the supplier's current delivered quote and minimum order before ordering stock. Physical measurements, visual acceptance, and transit inspection are human-owned next actions.

### Earlier Window-Box Research - Reference Only

The following window-box recommendations and quotes are retained for comparison. They are no longer the selected standard packaging plan.

### Earlier Window-Box Fit Proposal

- Measure the finished figurine **including the base, nameplate, hair, hands, and accessories**. The nominal product target is 150mm, but the 2026-08-12 quotation assembly was approximately 173 x 129 x 105mm. Height alone cannot determine the carton.
- Proposed production direction: an upright printed carton with a large clear front window, a branded back panel, and a supporting insert. Show the figurine and nameplate through the window. Use common brand artwork and an individually printed customer-name label rather than ordering a different carton print run for every customer.
- Proposed fit trial: approximately 7 x 6 x 9 inches **internal** W x D x H, then adjust after measuring samples and designing the insert. This is a starting envelope, not an approved production specification or shipping-protection allowance.
- Personalized poses make a single tightly shaped blister a potential poor fit. Compare an adjustable paperboard cradle with soft protective pads against foam supports at the base and stronger body areas. Do not load fragile hair, fingers, or accessories, or allow the face/paint to rub the window. Any support design requires physical testing.
- Treat the display carton and the parcel-shipping system as separate components. [FedEx's breakables guidance](https://www.fedex.com/en-us/shipping/packing/how-to-pack/breakables.html) recommends double boxing with 3 inches of cushioning in and around the inner box. Final outer dimensions, packed weight, postage, and protection must be validated together; a close-fitting outer carton is not evidence of adequate cushioning.

### Window And Clear-Display Shortlist

Public prices checked on 2026-10-23. USD unless explicitly marked CAD. Prices exclude inserts, branding not specified by the vendor, packing labor, taxes, inbound freight, and customer postage unless stated. These are catalog observations and supplier claims, not negotiated delivered quotes or evidence of supplier approval.

| Candidate | Published dimensions / quantity | Published price | Fit and purchasing limits |
| --- | --- | --- | --- |
| [Evil Cake Genius crystal clear presentation box](https://evilcakegenius.com/crystal-clear-cake-box-8-1-2-inch.html) | 8.5 x 8.5 x 8.5 inches **inside**; individual box | $7.99 each; product page says in stock | Practical single-box appearance/fit prototype. Clear side assembly, white base and lid; ribbon extra. It is bakery presentation packaging, with no figurine insert or parcel-shipping validation. Likely more spacious than needed. |
| [Sweet Degrees Kitchen clear square box](https://sweetdegreeskitchen.com/products/square-clear-cake-box-8-5-inches-by-9) | Listed 8.5 x 8.5 x 9 inches; 1, 5, 10, or 20 boxes | $8.50 single; $38.25/5; $72.25/10; $136/20 | Clear PET walls and lid/base. Page explicitly reports backorder; verify restock before relying on it. Full visibility supports a branded backing-card prototype, but it is not a fitted collectible package. |
| [Royal Box Shop Canada five-window white box](https://royalboxshop.ca/products/royalboxshop%C2%AE-5-window-gift-box-i-8x8x10-inch-i-white-i-perfect-for-bakery-cakes-gifts-parties-any-occasion) | Listed 8 x 8 x 10 inches | CAD $2.50 sale / CAD $3.30 regular | Useful stock window-box lead. Product text includes both sold-out and add-to-cart states; availability, order increment, U.S. delivery, freight, and currency conversion are unconfirmed. Do not treat CAD pricing as USD landed cost. |
| [Custom Packaging Lane action-figure box](https://custompackaginglane.com/action-figure-box/) | Custom dimensions; supplier states 100-unit minimum | Quote required for our size/insert. Advertised from $0.49 **at volume**, not a 100-box quote | Direct match for a printed collector carton. Supplier advertises design support, U.S. shipping, and 8-10 business days production after proof; confirm all inclusions and delivered timing in writing. Supplier is unvetted. |
| [PakFactory window packaging](https://pakfactory.com/custom-window-packaging-boxes.html) | Custom window construction and insert choices; minimum depends on box type | Quote required | Custom production comparison candidate. Ask for a folding carton with PET front window plus insert, with separate tooling, sample, freight, and repeat-order pricing. Vendor lists an estimated 10-20 business day turnaround; verify transit and sample timing separately. |

### Options Screened Out Or Kept As References

- **Top-window bakery cartons:** [BRP 4639, 6 x 6 x 8 inches](https://www.brpboxshop.com/4639.html), lists $29.86/10 or $115.94/100; [BRP 4293, 8 x 8 x 10 inches](https://www.brpboxshop.com/4293.html), lists $47.30/10 or $58.74/25. Browser inspection of their product photos shows the window in the **lid**, rather than the front. They do not provide the desired upright collector view. Do not recommend these merely because their titles say “with window.” [BRP's sample program](https://www.brpboxshop.com/order-samples.html) offers up to six different sample items for $12 shipping to the lower 48, but the geometry mismatch makes these lower-priority samples.
- **Magnetic keepsake boxes:** [Rapp's](https://rappspackaging.com/gloss-color-rigid-magnetic-gift-boxes/) lists stock 10 x 10 x 4.5-inch boxes at $7.50 gloss or $9.05 matte; the 13 x 10.75 x 5.5-inch matte black box is $12.15. Full-color printed 10 x 10 x 4.5-inch boxes are $18.50 each at 50 ($925 total), including one-side printing and setup. These remain a premium comparison; the owner subsequently selected the simple branded gift box.
- **Amazon:** attempted a direct U.S. search for magnetic gift boxes, but Amazon returned “Sorry! Something went wrong!” Search did not establish a reliable current Amazon price. For follow-up, search for `collector window box empty`, `clear display gift box 8 inch`, or `clear cake box 8x8x9`; verify front-window location, inch/cm units, internal dimensions, pack count, seller, and delivery before comparing landed prices.
- **Custom packaging minimums:** [PackMojo](https://packmojo.com/help/what-is-your-moq/) lists 100 for folding cartons, 300 for rigid boxes, and inserts at 300 with boxes or 500 standalone. These minimums illustrate why an inexpensive custom carton does not imply an inexpensive or equally low-minimum insert; a window option still needs confirmation.

### Earlier Cost Comparison And Window-Box Trial Proposal

The owner also requested comparison with the original premium and economical directions. A higher-end stock option is Rapp's matte black magnetic box, 13 x 10.75 x 5.5 inches, at $12.15 before an insert and branding; the same listed size with full-color printing is $23.65 each at 50 ($1,182.50 before freight/tax). Internal dimensions and cushioned fit require confirmation. A lower-end example is the [Cellobags white pop-up gift box, 8 x 8 x 8.5 inches](https://www.cellobags.com/8x8x8-1-2-White-Gift-Boxes-p/bxgb888.htm), listed at $163.20/50, or $3.264 each, before branding and protection. The owner subsequently selected this simple branded gift-box direction, with logo seal, tissue, and personalized card; see the current plan above.

Applying the same provisional insert, branding, and outer-pack allowances below gives approximately **$18-$25** materials per order for the stock matte magnetic option versus **$9-$16** for the simple white gift box. These are planning estimates, not delivered quotes; both exclude labor, tax, inbound freight, and customer postage. The premium box would likely present the figurine lying in a cradle, with clearance and paint-contact testing required.

The following is an internal planning allowance, **not a vendor quote**: at prototype quantities, budget roughly $8-$9 for an available stock clear display box, $2-$5 for a simple insert, $0.50-$1.50 for labels/backing card, and $3-$6 for outer carton/cushioning/tape: approximately **$13.50-$21.50 in packaging materials per order**, before taxes, inbound freight, labor, and customer postage. Outsourced custom foam, oversized shipping protection, or low-volume printing can exceed these allowances. Recalculate after the fit and shipping trial; use quoted custom-carton pricing for the production comparison.

Recommended next steps:

1. Measure all accepted physical Chibi samples and identify the largest pose/base envelope and actual packed weight.
2. Trial one available clear box, a printed backing card/name label, and a reversible support insert. Check upright visibility, paint contact, loading/removal, and whether the box feels proportionate to the figurine.
3. Prepare the same front-window carton + adjustable insert specification for written quotes at 100, 250, and 500. Ask whether the minimum is per size or artwork; request tooling, sample, insert, shipping, tax/duty, and reorder costs separately. Do not submit supplier messages or customer files without authorization.
4. Test the complete pack in actual parcel transit and assess box/window condition, movement, paint scuffing, broken parts, packing time, and postage. Compare a compact custom carton against the larger stock clear-box prototype before selecting production packaging.

## Goal And Done Criteria

The research phase is done when:

- The current PolyX 3D baseline has an itemized per-unit cost and documented sample-quality review.
- At least 8 credible Mexico candidates have been screened, including at least 3 combined print-and-paint options and 3 specialist printer/painter options where available.
- At least 3 candidates have returned comparable written quotes against the same RFQ and files.
- At least 2 finalists have produced paid samples from the same representative model package.
- One 5-10 unit pilot has measured quality consistency, actual landed cost, damage/rework rate, and lead time.
- The chosen path fits an approved retail-price and contribution-margin model, or the evidence clearly shows that the painted offer, size, materials, or price must change.

No supplier is production-approved from a web quote or one attractive sample alone.

## Options To Compare

1. **San Antonio baseline:** PolyX 3D printing plus local painting and fulfillment.
2. **Mexico combined service:** one supplier prints, cleans, primes, paints, seals, packs, and ships.
3. **Mexico specialist pair:** a Mexico print bureau and a Mexico miniature/collectible painting studio work from one handoff specification.
4. **Split U.S./Mexico workflow:** PolyX 3D prints and a Mexico partner paints, or the reverse. Advance this only if the extra transport, customs handling, damage risk, and lead time still produce a better landed result.
5. **AI-assisted multicolor print plus targeted finishing:** segment the figurine into printer-addressable color/material regions so Molly or another painter handles only the detail and touch-up that printing cannot reproduce economically.
6. **Unpainted product:** retain a lower-complexity offer if painted economics cannot meet the margin and quality gate.

Compare both bulk shipment to San Antonio for final inspection/domestic fulfillment and direct-to-customer shipping from Mexico. Do not assume either route wins before quotes and sample evidence.

## Research Sequence

### Phase 0 - Establish The Baseline

1. Obtain an itemized PolyX 3D quote or invoice allocation for the paid `$300` / `$100-per-model` sample run.
2. Record print technology, material, model dimensions, supports/cleanup, primer, painter hours, paint/material cost, sealing, packaging, tax, shipping, and rework.
3. Preserve the owner's initial visual-quality acceptance, then photograph each sample consistently and score print detail, surface finish, paint accuracy, likeness, durability, base/name legibility, and packaging condition.
4. Record the actual turnaround time and the amount of coordination required.

### Phase 1 - Build The Mexico Candidate List

Search in English and Spanish for:

- Custom resin/SLA/DLP figurine printing.
- Miniature, collectible, model, and figure hand-painting studios.
- Full-service prototype or collectible manufacturers that accept customer-provided STL/3MF/OBJ/GLB packages.
- Low-volume services willing to quote prototypes and 10/25/50-unit bands.

Useful Spanish search themes include `impresion 3D resina figuras personalizadas`, `pintado a mano miniaturas Mexico`, `servicio impresion y pintura figuras`, and `fabricacion figuras coleccionables tiraje corto`.

For each candidate, record a real website or business profile, location, contact, capabilities, evidence of comparable work, accepted file formats, minimum order quantity, and whether painting is in-house or subcontracted. A social profile alone is not enough evidence for production approval.

### Phase 2 - Send One Comparable RFQ

Send every serious candidate the same controlled package:

- One representative 150mm figurine body plus deterministic named base.
- A rendered appearance/paint reference and a written color callout sheet.
- Requested output for painted and unpainted variants.
- Quantity bands: 1 prototype, 10, 25, and 50 units.
- Required quote breakdown: printing, support removal/cleanup, assembly, primer, painting, sealant, quality control, packaging, shipping, taxes/duties/brokerage if known, setup/tooling, and payment/FX fees.
- Lead time for prototype and repeat batches; weekly/monthly capacity.
- Material and print-process details, minimum feature/wall guidance, color/paint tolerance, remake policy, breakage policy, data retention, confidentiality, and file deletion practices.
- Shipping terms and responsibility for loss, damage, customs paperwork, and rejected units.

Do not send customer likeness files to an unvetted supplier without permission and a documented data-handling expectation. A neutral validation model can screen basic production capability before a likeness-bearing sample is shared.

### Parallel Track - AI-Assisted Multicolor Segmentation

Status as of 2026-10-21: Meshy Multi-Color Print is a tested candidate. Two paid conversions of an existing Chibi body produced four-color, triangle-painted 3MF files with a Snapmaker U1 preset. Physical print quality, correct slicer configuration, economics, and production suitability remain unvalidated. This is a research result, not a selected manufacturing method.

1. Identify the model the owner has in mind and verify its API or deployment path, commercial license, data-retention terms, supported 3D inputs, and export capabilities.
2. Test it on the same representative figurine package used for supplier quotes. The generated provider body remains body-only; the base, name text, region packaging, and final assembly remain deterministic server-side responsibilities in `services/print-file-generator`.
3. Produce a manufacturing-ready multicolor `3MF` or equivalent package with explicit printer/slicer material assignments. Do not treat a colored render or textured GLB as proof of a printable multicolor package.
4. Compare full hand painting against multicolor printing plus targeted touch-up. Measure segmentation cleanup time, print time, material and purge waste, post-processing, remaining painting hours, visible quality, failure/rework rate, and delivered unit cost.
5. Advance the path only if it preserves the accepted sample quality while materially reducing total manual-painting cost. The intended labor shift is from full-surface painting to targeted detail and finishing, not an assumption that hand work reaches zero.

#### 2026-10-21 - Snapmaker U1 And Meshy Color Experiment

Historical 2026-10-21 snapshot: the owner reported having purchased a Snapmaker U1 and filament, with installation pending. On 2026-10-23 the owner confirmed four included spools (Red, Yellow, White, and Black), completed assembly, downloaded the Snapmaker App, and reported calibration underway. Authenticated cloud login and device-list checks succeeded: the linked printer `3DPrintYou-U1` reported online. The account profile name was changed to `3DPrintYou` and verified against the Space and universal account profiles. No printer commands were sent during the access check. Calibration completion and a first successful print remain unconfirmed. Use [Print Studio Inventory](../docs/PRINT_STUDIO_INVENTORY.md) for current stock and equipment state; treat the U1 as test equipment until commissioning is confirmed. The table below preserves the October 21 inventory snapshot.

| Inventory reported by owner | Quantity / status |
| --- | --- |
| Snapmaker U1, four independent toolheads | 1 printer; installation pending |
| ANYCUBIC PLA bundle: Black, White, Texture Grey, Clear, Red, Blue, Green, Orange, Yellow, Purple | Ten 1kg rolls; exact variant supplied by owner |
| Bambu Lab PLA Hot Pink 10204, with spool | One 1kg roll; owner reports 1.75mm diameter, +/-0.03mm tolerance, 190-230 C label range |

Purchase references: [filament bundle](https://www.amazon.com/dp/B0F2SH32F3), [printer](https://www.amazon.com/dp/B0GYP89RTN). The bundle listing identifies ANYCUBIC PLA; do not infer that all displayed Amazon variants were purchased. No skin-tone, brown, or metallic gold spool was reported in the October 21 snapshot. On October 23 the owner confirmed ordering the Overture Matte Skin spool, expected October 24; it is not yet recorded as received. Hot pink is not a calibrated color-mixing magenta. Third-party 1.75mm filament is supported by the U1, with manual configuration rather than Snapmaker RFID recognition: [official U1 FAQ](https://wiki.snapmaker.com/en/FAQ/u1).

##### 2026-10-23 - Skin-Tone Filament Shopping Research

The owner requested a skin-tone spool search, then confirmed placing the Amazon order themselves on 2026-10-23, with delivery expected 2026-10-24. Record one Overture Matte Skin 1kg spool as ordered in [Print Studio Inventory](../docs/PRINT_STUDIO_INVENTORY.md); move it to on-hand stock only after receipt is confirmed. The agent did not place the order.

- Recommended first light-tone appearance sample: **Overture Matte PLA, Skin, 1.75mm, 1kg with spool**. The [exact official variant](https://overture3d.com/products/overture-matte-pla?variant=42116542398718) was checked in the browser with Skin selected: **$18.99 USD** sale ($20.99 crossed out), **83 in stock / ready to ship** at inspection. Shipping and tax are additional unless a promotion applies; the site advertises free shipping above $29.99. Price/stock can change.
- The manufacturer's Skin swatch is `#F0DDC2`, a pale beige appearance reference rather than a measured print color. Its same Matte PLA family lists Light Brown (`#EDD5A6`), Wood (`#CAAC78`), and Chocolate (`#503529`) as other possible subject-dependent shade samples; their exact variant prices and stock were not verified. These names do not establish a skin match or a universal skin tone.
- [Amazon Overture Matte Skin 1kg product, ASIN B0991QTSM5](https://www.amazon.com/dp/B0991QTSM5?th=1): follow-up browser inspection on 2026-10-23 successfully verified **Matte Skin / 1KG / 1.75mm**, **$17.09 USD one-time purchase** (limited-time deal; typical price $18.99), **in stock**, sold by **OVERTURE 3D** and shipped by **Amazon**. This was lower than the official-store $18.99 offer at inspection. The page offered next-day Prime delivery for its displayed destination, or free delivery October 28 on eligible Amazon-shipped orders over $35; actual delivery, tax, and shipping depend on the buyer's address/account. No cart or purchase action was taken.
- [Hatchbox Beige PLA 1.75mm 1kg](https://www.hatchbox3d.com/products/3d-pla-1kg1-75-720c) is an alternative, but the refreshed page showed $22.99 and unavailable/sold out. An earlier search snapshot showed $28 and available, so do not rely on that older snapshot.
- Bambu Matte Latte Brown remains a color-comparison lead, not a price-verified shopping recommendation in this search. The direct U.S. store could not be read; the WestCoast Products listing was marked reference-only and is not evidence of available stock.
- [Snapmaker's U1 FAQ](https://wiki.snapmaker.com/en/FAQ/u1) confirms third-party 1.75mm filament support. Configure the actual PLA material/color manually and calibrate it in the verified U1 profile; do not assume Bambu RFID/profile recognition. Print a small face/hand sample with the intended layer height and lighting before approving the shade or buying multiple spools. Matte versus existing standard-PLA sheen and support-removal quality require physical review.

Three distinct manufacturing approaches now merit comparison:

| Approach | Evidence and fit | Remaining limitation |
| --- | --- | --- |
| Meshy Multi-Color Print | Converts a colored model to painted 3MF; tested with four colors and the Snapmaker preset. Most direct route to a one-piece Chibi without full-surface painting. | Quantization merges appearance details. The API selects colors rather than accepting our spool palette. Slicer profiles and physical quality need validation. |
| Meshy Auto Split by color or named part | Official API supports separate objects and optional connectors. Separately printed pieces could use more than four colors across multiple jobs. | Not live-tested here. Input-task/model restrictions apply; original textures are discarded. Assembly fit, tiny parts, visible seams, and labor need measurement. |
| Snapmaker Full Spectrum | Official system alternates filament layers to create additional perceived colors using four toolheads. | Optical blending depends on filament transmission, geometry, and settings. Existing stock is not a calibrated Full Spectrum set; no skin-tone match is established. |

Primary references: [Meshy Multi-Color Print API](https://docs.meshy.ai/en/api/multi-color-print), [Auto Split API](https://docs.meshy.ai/en/api/auto-split), [API pricing](https://docs.meshy.ai/en/api/pricing), [Snapmaker Full Spectrum explanation](https://blog.snapmaker.com/blog/four-filaments-a-full-spectrum-of-color/), [Full Spectrum filament FAQ](https://wiki.snapmaker.com/en/FAQ/Modules_Accessories_Materials/PLA_Full_Spectrum_Filament_Bundle_White_Edition).

Auto Split is not interchangeable with Multi-Color Print. The former cuts geometry; the latter writes filament painting. Auto Split's `by_color` uses the source image of an Image-to-3D or Multi-Image-to-3D task, not just arbitrary uploaded texture. Its documented compatible task list does not include our Creative Lab Figure build. A provider-generated colored GLB also does not by itself prove physical color assignment. These distinctions prevent silently changing the approved Chibi geometry provider just to access a different print tool.

Live experiment `exp-022-u1-four-color-chibi` reused the normalized, textured 75mm GLB from `exp-021-chibi-female-v3-creative-lab-validation`. No new Vertex image or 3D generation was needed. The owner explicitly authorized Meshy/Vertex credits and use of existing assets.

| Setting / result | Cartoon | Realistic |
| --- | --- | --- |
| Meshy task | `01a1606d-7821-731b-bd71-25ff801c5e42` | `01a1606e-aef9-7721-9f60-1f45b3b320e7` |
| Result | SUCCEEDED | SUCCEEDED |
| Credits consumed | 10 | 10 |
| Palette limit | 4 | 4 |
| Downloaded 3MF size | 34,701,647 bytes | 35,472,293 bytes |
| Dimensions, excluding build-plate translation | 47.2658 x 35.7906 x 75mm | Same |
| Mesh triangles | 1,983,630 | 1,983,630 |
| Color encoding | All triangles assigned one of four filament slots | 24,589 triangles contain subdivided color assignments |

Both packages identify `Snapmaker U1 (0.4 nozzle)`. Cartoon colors were `#0D0D0E`, `#D9CBC2`, `#093B8A`, and `#C28A57`; the realistic palette was nearly the same, in a different slot order. The cartoon face assignments were decoded and rendered directly from the exported 3MF. Compared with the original texture, lip color disappears, eye detail simplifies, and gold trim shares the skin's tan region. The right panel of the local comparison substitutes illustrative black/white/blue/orange values from the reported inventory; it is neither a measured filament swatch nor a separately exported print package. Orange visibly fails as a natural skin substitute.

Local evidence is under `.tmp/experiments/meshy/standard/exp-022-u1-four-color-chibi/`: `experiment.sanitized.json`, `cartoon.inspection.json`, `realistic.inspection.json`, `comparison.png`, and the downloaded files under `meshy/cartoon/` and `meshy/realistic/`. Inspection/render helper scripts remain in that ignored experiment folder. The reusable paid conversion stage lives in the existing standard runner, not another Meshy runner.

Repeat against another existing colored GLB using the standard runner (each new style conversion currently costs 10 API credits):

```powershell
node scripts/meshy/run-standard-figurine-experiment.mjs --workflow existing-model-multi-color --existing-models .tmp/experiments/meshy/standard/exp-021-chibi-female-v3-creative-lab-validation/normalized/model.normalized.glb --experiment-slug u1-color-comparison --multi-color-styles cartoon,realistic --max-colors 4 --printer-brand snapmaker
```

Important preflight findings:

- The converted cartoon mesh remains non-watertight and is not a valid closed volume; winding is consistent. Color conversion did not establish print readiness or repair the inherited geometry.
- The export is 75mm tall because the reused experiment asset was 75mm. The approximately 150mm product target requires deliberate scaling and a fresh detail/support review.
- The exported settings include `single_extruder_multi_material: "1"` and one nozzle-diameter entry. The installed Orca U1 profiles specify `single_extruder_multi_material: "0"` and four 0.4mm nozzles. A preset name alone is insufficient: use a verified U1 machine profile, preserve the painting on import, and check all four tool assignments before slicing. Do not print using blindly inherited Meshy machine settings.
- Installed OrcaSlicer CLI attempts returned exit code 0 but produced neither requested settings nor a round-trip 3MF, so no slicer-import or slicing success is claimed. No G-code, time estimate, material/waste estimate, or physical print was validated.
- A smooth digital render does not represent FDM layer lines, support scars, visible seams, color accuracy, nozzle registration, or remaining cleanup/painting time.

Next physical test after installation: commission/calibrate the U1 with a small four-color test; load the Chibi into a verified U1 profile; repair/validate the model and review supports; map the palette to actual spools; then slice and record print hours, grams by color, prime-tower/waste grams, cleanup minutes, defects, and finish acceptance. Use an existing-stock palette only for functional testing. For appearance testing, choose skin-tone filament appropriate to the subject; brown and gold may also be needed depending on the design. Compare four-color simplification with separately printed color parts before promising zero painting. No purchase or production-method decision was made in this session.

#### 2026-11-24 - First Physical U1 Four-Color Test Started

The owner loaded the working palette: ELEGOO white FIL-018 on toolhead 1,
ANYCUBIC black FIL-001 on 2, ANYCUBIC blue FIL-006 on 3 and Overture Matte Skin
FIL-016 on 4. The exp-022 Meshy cartoon 3MF was imported into Snapmaker Orca on
the U1 profile. The painting carried over, and the conflicting Meshy machine
settings did not, which resolves the slicer-import question noted above for this
file. It printed at its native 75 mm, not watertight-repaired, with 0.12 mm
layers and 887 color changes. Supports were tuned to a 15° threshold and the
prime tower to a 15 mm³ prime volume, giving 55.69 g in total (model 15.55 g,
supports 6.33 g, tower 33.82 g) and a 6h 54m estimate, down from 73.22 g / 8h
with the defaults. The tower is still about 61% of the material: that is the
main waste cost of four-color figurines on the U1, and it scales with the number
of color changes.

The owner authorized the start, and the printer accepted it as attempt
`BIZ-CHIBI-4C-T01-A01`. Print outcome, color registration, face quality, support
cleanup minutes, the Matte Skin shade and real grams used are pending. Slice
settings, variant comparison and the upload/mapping steps are in
[U1 operations](../docs/SNAPMAKER_U1_OPERATIONS.md#four-color-figurine-slicing).

Outcome (owner report, 2026-11-25): complete. The owner likes the multicolor and
calls it good for a test. At 75 mm it is too small, so the next test is 100 mm.
The sword broke at the right arm during support removal; its narrowest point is
about 1.6 x 1.5 mm, and the hair supports ran about 0.4 mm beside the blade. The
blue cape did not show, although the G-code put blue on about 99% of its painted
surface, so the cause is on the printer and still open. 55.69 g was recorded
once at the slicer estimate. A breakaway PETG/TPU interface needs a free toolhead,
so four-color figurines stay on tuned PLA supports. Next-test changes are 100 mm,
0.8 mm XY gap, 0.24 mm top Z gap, and flush-cutter removal; the three-color
breakaway option is also recorded in
[U1 operations](../docs/SNAPMAKER_U1_OPERATIONS.md#support-changes-for-the-next-test).
Separately printed weapons are an untested production option.

**Test 2 (`BIZ-CHIBI-4C-T02-A01`, started 2026-11-25):** the 100 mm four-color
Chibi heroic fantasy male. The first male attempt (`exp-024`) failed before
printing. Meshy's cartoon conversion turned the 2D concept's baked-in shading
into a false "brown-grey" color region that covered shaded skin, leather and
metal, and the owner rejected the recolor attempts.

The fix was to remove the lighting before the 3D build. A Vertex/Gemini pass
took out shadows, highlights and reflections (the runner's `--delight-input`).
The Meshy Creative Lab build (`exp-025`) and cartoon four-color conversion
(`exp-026`) then cost 46 Meshy credits. The owner approved the segmentation once
two things were done: Meshy's regions were remapped explicitly to filaments
(grey to white, navy to blue, skin to skin, brown to black), and the eyes were
recolored to one solid black area each.

The head was painted as a support blocker, so no support goes above 63 mm and
the face stays clear. The slice is 91.03 g in 11h 10m: model 34.39 g, supports
7.00 g, prime tower 49.64 g. The tower is still more than half of all filament.

Production implications:

- A shadow-removal pass should come before every multicolor Meshy conversion.
- Remapping Meshy's color regions and fixing the eyes are per-figure
  segmentation steps that could be automated server-side.
- The prime tower remains the largest material and time cost for four-color
  figurines.

Physical quality, support removal and real grams used are pending. Method and
settings are in
[U1 operations](../docs/SNAPMAKER_U1_OPERATIONS.md#test-2-100-mm-chibi-male-biz-chibi-4c-t02-a01).

#### 2026-10-21 - Broader Search For Recent Segmentation Models

The owner recalled a recently released multicolor segmentation model and requested research beyond the Meshy conversion tested above. The exact remembered model is unidentified. The strongest recent research-model match found is **SAM3D-Part**, whose paper was submitted on September 14, 2026. This is a candidate identification, not confirmation of what the owner saw.

The search distinguishes surface/part labels, generatively completed physical components, and filament-addressable color packages. Color-coded segmentation previews frequently use arbitrary label colors; they do not establish that skin, hair, clothing, and eye colors have been converted into printable materials.

| Candidate | Verified date / availability | What it does | Relevance to our Chibi bodies |
| --- | --- | --- | --- |
| SAM3D-Part | Paper submitted 2026-09-14; public code and weights verified on 2026-10-21 | Select a part on a rendered existing mesh and generate a completed component positioned in the source frame. Meshy AI researchers are among the authors. | Plausible recent-model match. Useful for selected components, but completed geometry must be checked against the approved face/body. Its reference environment uses an 80GB H100/A100 GPU; that is a documented tested configuration, not a proven minimum. No turnkey filament 3MF pipeline was verified. |
| Tencent Hunyuan3D-Part: P3-SAM plus X-Part | License states release date 2025-09-23; public code, weights, and demo | P3-SAM segments an existing mesh; X-Part generates completed parts. The public X-Part release is a light version. | Strong older candidate if the remembered announcement dates to 2025. Needs a separate manufacturing/color packaging step. |
| VAST GeoSAM2 | Paper submitted 2025-08-19; repository identifies CVPR 2026 acceptance; public code and checkpoint | Click/mask-guided multi-view segmentation back-projects labels to existing mesh faces. | Promising controlled segmentation baseline when preserving the approved source mesh is important. Per-face labels still require palette assignment and printable-region preparation. Repository requires Linux and supports CUDA or slower CPU inference, with Blender rendering; code is Apache-2.0. |
| Hi3D / Hitem3D Multicolor | API changelog adds 3MF output on 2026-08-03 | Processes an uploaded GLB; color counts 1-8 or maximum; API offers a minimum-region-face parameter for merging small adjacent regions. | Most direct newly identified comparison against Meshy's four-color output using our existing model. Hosted API, not a downloadable checkpoint verified by this search. |
| Tripo Studio Segmentation | Official documentation dated October 2026; exact feature launch date not established | Splits generated or uploaded models into semantic parts, with optional flat caps or AI completion for open surfaces. | Another practical split/assemble candidate. Documentation warns completion can lose fine detail; arbitrary part colors in its viewer are not proof of filament matching. |
| NVIDIA PartField | April 2025 paper / ICCV 2025; code and Objaverse-trained checkpoint available | Predicts part features, then clusters geometry into hierarchical parts. | Older research reference. Its published license limits use to non-commercial research/education, so do not treat it as an approved business-production dependency. |

Primary evidence:

- SAM3D-Part: [paper/date](https://arxiv.org/abs/2609.15639), [author repository and tested environment](https://github.com/Jiahao620/sam3d-part), [weights](https://huggingface.co/bj6/sam3d-part). The repository documents several third-party model/license dependencies; this search did not clear the whole pipeline for production use.
- Hunyuan3D-Part: [official repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-Part), [release date in license](https://github.com/Tencent-Hunyuan/Hunyuan3D-Part/blob/main/LICENSE), [P3-SAM paper](https://arxiv.org/abs/2509.06784). Published weights do not imply unrestricted licensing; the repository uses Tencent's community terms.
- GeoSAM2: [official repository, outputs, and requirements](https://github.com/VAST-AI-Research/GeoSAM2), [original paper/date](https://arxiv.org/abs/2508.14036).
- Hi3D: [Multicolor Create Task API](https://docs.hi3d.ai/en/api/api-reference/list/multicolor-create-task), [dated API changelog](https://docs.hi3d.ai/en/api/getting-started/changelog), [official product overview](https://docs.hi3d.ai/en/api/api-reference/overview). The provider's Overview and changelog differ on some Split output formats; verify actual output rather than assuming Split and Multicolor share a format contract.
- Tripo: [official segmentation workflow](https://www.tripo3d.ai/product-doc/module-post-processing/segmentation).
- PartField: [official repository](https://github.com/nv-tlabs/PartField), [license use limitation, section 3.3](https://github.com/nv-tlabs/PartField/blob/main/LICENSE).

Research priority, not a production selection: compare Hi3D Multicolor against Meshy on the same existing Chibi GLB at four colors, including small-region cleanup and actual U1 import. For a controlled open-model segmentation experiment, evaluate GeoSAM2 first; evaluate SAM3D-Part when completed separate components justify its heavier environment and possible geometry changes. Preserve source correspondence, likeness, thin details, and closed printable volumes when judging any generated split. Do not assume an arm/head split separates all skin and clothing colors.

No additional model installation, weight downloads, GPU rental, paid generation, or live segmentation experiments were performed for this broader search. The only physical-color experiment evidence remains the two Meshy conversions above. The Hugging Face connector verified repository metadata; its model/paper search methods were unavailable, so searches used the web and findings were checked against author/provider sources.

#### 2026-10-21 - Live Hi3D Multicolor Comparison

The owner confirmed the prior July Hi3D generation tests and explicitly requested testing Hi3D multicolor against Meshy. Two new multicolor conversions used the exact same normalized Chibi heroine GLB as `exp-022-u1-four-color-chibi`; the input was not regenerated. The source SHA-256 and comparison criteria are saved in the first run's `comparison-contract.json`.

Verdict for this asset and four-color limit: **Hi3D did not improve the visible color segmentation over Meshy cartoon.** Hi3D did improve the exported mesh's closed-volume checks. Neither outcome establishes physical print quality or a production-ready manufacturing method.

Owner review on 2026-10-21: **"I concur, Meshy is better."** Meshy cartoon is the preferred four-color conversion candidate for the next U1 validation on this representative Chibi. Physical print approval remains pending; this review does not change the existing 3D generation workflows.

| Result | Default cleanup | Minimal cleanup follow-up |
| --- | --- | --- |
| Experiment folder under `.tmp/experiments/hi3d/` | `exp-023-hi3d-four-color-chibi` | `exp-023b-hi3d-four-color-min1` |
| Task ID | `c73ffa2805034ca6a7958c05d80c183c.jjewelry-aigc-merchant-api.akkkFRYqOI` | `84d9b03c2a0f4b1bb880afa81aa9a78f.jjewelry-aigc-merchant-api.F8spMC9MNy` |
| Status | Completed | Completed |
| `number_color` / `min_region_faces` / output format | 4 / 50 / 3MF | 4 / 1 / 3MF |
| Downloaded bytes | 36,014,910 | 36,009,387 |
| Native palette | `#454545`, `#458FC4`, `#DFB999`, `#EAEAEA` | `#474947`, `#B09DEE`, `#EEA39D`, `#FBFAF9` |
| Facial appearance | Eyebrows lose their dark region; eyes collapse largely to dark dots with most white/outline detail lost. | Eyebrows and more eye detail return, but eye-region edges are jagged compared with Meshy cartoon. |
| Mesh topology | Watertight, consistent winding, valid volume | Same checks pass |

Both Hi3D 3MFs contain 1,983,630 triangles and 991,813 vertices, with real per-triangle assignments to four filament slots. They scale the uploaded 75mm body to **100mm**, with body extents approximately 63.021 x 47.721 x 100mm. They include a **Bambu Lab A1** machine profile, not the owner's U1 profile. Their default tool-change G-code must not be treated as U1 configuration. Select a verified U1 machine setup, preserve the color painting, map the actual filament slots, and set the intended physical scale before slicing.

Inspection used the actual downloaded 3MF geometry and painting, not only a colored GLB or provider preview. The first Hi3D provider thumbnail independently exhibits the same missing facial detail. Matching-camera renders normalize display height to 75mm; an additional comparison maps all conversion outputs to identical display colors (black, off-white, blue, tan) to isolate boundary quality from automatic palette differences. This display palette is illustrative, not a measured filament color or a rewritten 3MF. The original reference retains its full texture. The shared-palette figure is `exp-023-hi3d-four-color-chibi/comparison.shared-palette.png`.

The lower-threshold result also changed the automatic palette to pink/purple. With two independent jobs and no fixed seed, do not attribute every difference solely to `min_region_faces`. Both Hi3D variants still merge the lip color into the face and the gold trim into the skin region at four colors. The minimal-cleanup version does not recover the original color fidelity.

Geometry comparison: after bringing Hi3D back to 75mm, its nearest-vertex distances against the Meshy cartoon 3MF average approximately 0.002mm, with a maximum of 0.237mm. This compares the two exported meshes, not directly the original GLB; it is not a surface-error or wall-thickness guarantee. A simple coincident-vertex merge of the Meshy cartoon file still did not produce a closed volume, whereas both Hi3D exports pass the checked topology criteria. Do not silently replace the original approved manufacturing geometry based only on these checks.

The API lists 20 Hi3D credits per multicolor request, or about $0.40 at the listed $0.02/credit price: two jobs have an expected list cost of **40 Hi3D credits / $0.80**. The task responses do not expose consumed credits, so the local summaries keep `consumed_credits: null`; the account's actual billing deduction was not independently reconciled. [Official pricing](https://docs.hi3d.ai/en/api/getting-started/pricing).

Integration findings are preserved in the standard runner:

- Use `--workflow existing-model-multi-color --multi-color-provider hi3d`; credentials are loaded locally by name and never written to evidence.
- The documented create route is spelled `/muilticolor/create-task`. The query route is `/multicolor/query-task`.
- The query documentation's `Token` authentication returned HTTP 200 with application code 401. `Bearer` authentication, matching the existing project provider, succeeded. The already-created first task was resumed rather than submitted again.
- `--resume-task-id` plus the original `--run-folder-name` retrieves an existing task without another paid create. Source path, color count, and cleanup settings must match the saved task. Existing folders and mismatched resume arguments are rejected before submission.
- Each run saves sanitized request/task metadata, polling history, the original 3MF, provider cover, inspection JSON, and direct renders. No access token, credentials, upload base64, or signed result URL is saved in these evidence files.

Verification completed: JavaScript syntax; rejection of invalid colors/cleanup values, duplicate folders, and mismatched resume IDs; successful live retrieval of both jobs; ZIP integrity; four filament assignments; triangle counts; mesh topology; and direct render inspection. No slicer-import success, G-code, physical sample, tool registration, support strategy, print-time estimate, or waste estimate is claimed.

Recommendation: retain **Meshy cartoon as the current color-boundary benchmark** for this Chibi. Hi3D's closed-volume output is useful evidence for print preparation, but the tested multicolor defaults are not an appearance upgrade. Do not switch the public Chibi provider or select a manufacturing method from this comparison. Physical testing still requires U1 installation/calibration, appropriate skin-tone filament, a verified U1 profile, geometry/support review, and owner approval of the visible result.

#### 2026-10-28 - U1 Four-Color Chibi Slicer Preflight

Reused the preferred Meshy cartoon result from `exp-022-u1-four-color-chibi`;
no new generation or paid conversion was requested. Official Snapmaker Orca
2.4.0 imported the painted 3MF and exported a slice using the installed U1
machine preset: four independent 0.4mm nozzles,
`single_extruder_multi_material=0`, textured PEI, 0.20mm layers, 220 C PLA,
65 C bed, automatic tree supports, and the standard 45mm3 prime volume.
The original provider artifact remains unchanged. The figure is approximately
47.27 x 35.79 x 75mm, upright, without the deterministic product base.

For a functional test with the original loaded spools, the working project
substitutes red for blue and yellow for tan/skin; black and light clothing
remain black and off-white. This is a stock-color placement test, not approval
of the final figurine's skin tone or appearance. Planned mapping is logical
filament 1 black to physical tool 2 / FIL-015; logical 2 white to physical tool
1 / FIL-014; logical 3 red to physical tool 3 / FIL-012; logical 4 yellow to
physical tool 4 / FIL-013. This mapping has not been applied/read back for a
printer job; verify it in the official print dialog before any eventual start.

| Slicer estimate | Amount |
| --- | ---: |
| Print time | 4h 24m 9s, plus any additional printer startup |
| Total filament | 69.25g |
| Black / white / red / yellow, raw G-code arrays | 16.57g / 23.40g / 4.21g / 25.06g |
| Model / support / prime tower, GUI rounded | 15.66g / 7.03g / 46.55g |
| Layers | 375 |

Raw per-color values and GUI totals differ slightly through rounding. These
are estimates, not consumed inventory. The prime tower dominates this first
standard-profile slice; optimize only after assessing the experimental result
and priming quality.

Geometry remains an explicit limitation: the GUI reports 78 non-manifold
edges. Its local Windows-service repair removed that error but also cleared
the four-color painting. Undo restored the original geometry and all original
triangle painting counts; the saved copy retains them. The un-repaired painted
mesh slices and produces all four executable tool selections. Successful
slicing does not establish closed-volume quality, fine-feature strength,
support removability, nozzle registration, or acceptable physical output.

Local project, exported G-code, source provenance, per-tool arrays, SHA256,
movement bounds, thumbnail, and pending checks live under ignored
`.tmp/experiments/u1/2026-10-28-chibi-four-color/`. Explicit G0/G1 movement
inspection found no arcs and maxima X185 / Y187.631 / Z75.45mm, including
startup movements; firmware macro motion is not expanded by that inspection.

**No upload or print start occurred.** Black FIL-015 is LOW: the owner's earlier
approximately 15g visual estimate is below the slice's 16.57g black requirement
before additional reserve. Replace it or verify sufficient net stock, then
recheck the actual material profile, tool mapping, supports, live readiness,
specific-plate authorization and fresh installed-and-clear-bed confirmation.
The owner confirmed on October 28 that none of the original loaded spools has
been changed. Shared spool IDs and consumption are reconciled once across the
business and home inventory records; this preparation deducts nothing.

### Phase 3 - Quote Normalization And Samples

Normalize every quote into USD using the exchange rate and fees on the comparison date. Keep supplier currency and original quote date alongside the normalized amount.

Calculate both:

- **Landed production cost:** production through arrival at the U.S. inspection/fulfillment point.
- **Delivered variable cost:** landed production plus domestic or direct customer shipping, payment fees, AI/provider cost, expected remake/refund allowance, and variable support/handling.

Order the same representative sample from at least two finalists. Do not substitute a supplier's portfolio sample for our own geometry and paint reference.

### Phase 4 - Pilot And Selection

1. Order a 5-10 unit pilot from the strongest candidate.
2. Measure actual cost, lead time, dimensional variance, paint variance, damage, rework, communication, and packaging performance.
3. Compare the pilot to the PolyX baseline using the scorecard below.
4. Select a primary path and a backup only after the pilot passes the hard gates.
5. Update `DECISIONS.md`, `PROJECT_STATE.md`, and `docs/ROADMAP.md`; then translate the chosen partner's handoff requirements into the operator workflow and partner-cost capture.

## Cost Model

Track these separately rather than comparing headline print quotes:

| Cost component | PolyX baseline | Candidate | Evidence |
| --- | ---: | ---: | --- |
| Print and material | TBD within paid total | Resino Lab: `$30-$55` unpainted estimate | PolyX itemization pending; Resino email 2026-08-10 requires sample review |
| Supports, cleanup, and assembly | TBD | TBD | Quote/invoice |
| Primer and surface preparation | TBD | TBD | Quote/invoice |
| Painting labor | Reported `$20/hour` | TBD | Hours or fixed-price quote |
| AI segmentation and multicolor preflight | N/A for sample run | TBD | Timed experiment |
| Multicolor print time, materials, and purge waste | N/A for sample run | TBD | Slicer estimate and paid sample |
| Remaining manual touch-up labor | Full painting; hours TBD | TBD | Timed sample comparison |
| Paint, sealant, and consumables | TBD | TBD | Quote/invoice |
| Base and nameplate finishing | TBD | TBD | Quote/invoice |
| Quality control | TBD | TBD | Quote/process |
| Packaging | TBD | TBD | Quote/sample |
| Freight and insurance | TBD | TBD | Carrier quote |
| Duties, tax, and brokerage | TBD | TBD | Broker/carrier evidence |
| Currency/payment fees | N/A or TBD | TBD | Payment record |
| Expected rework/remake allowance | TBD | TBD | Pilot evidence |
| **Finished print + paint subtotal** | **`$300` total / `$100` each paid** | **TBD** | Owner-reported pickup payment; itemization pending |
| **Landed production cost** | **TBD** | **TBD** | Normalized total |
| Customer delivery and variable platform costs | TBD | TBD | Internal model |
| **Delivered variable cost** | **TBD** | **TBD** | Normalized total |

Use these formulas after the retail price and minimum contribution margin are chosen:

```text
maximum_delivered_variable_cost = retail_price * (1 - minimum_contribution_margin)
maximum_landed_production_cost = maximum_delivered_variable_cost - other_variable_costs
```

Run this separately for painted and unpainted offers. Do not make a supplier decision until the retail price, shipping policy, and minimum contribution-margin floor are explicit.

## Evaluation Scorecard

| Dimension | Weight | What to verify |
| --- | ---: | --- |
| Landed and delivered cost | 30 | Normalized comparable total; quote clarity; price at volume |
| Print and finish quality | 20 | Detail, layer/surface quality, supports, fit, durability, base/name legibility |
| Painting quality | 20 | Color accuracy, clean edges, face/likeness handling, consistency, sealing |
| File/process compatibility | 10 | Accepts our package; identifies manufacturability issues; change control |
| Lead time and reliability | 10 | Prototype and batch timing; capacity; communication; on-time pilot |
| Packaging, shipping, and remakes | 5 | Damage rate, tracking, insurance, remake responsibility |
| Scalability and business fit | 5 | MOQ, payment terms, documentation, confidentiality, backup capacity |

Hard gates regardless of score:

- Sample quality is acceptable under the same review standard used for customer orders.
- The full landed/delivered cost fits the approved margin model.
- Supplier responsibilities for rejected, damaged, late, and lost units are written.
- Customer files and likeness data have an acceptable handling and deletion policy.
- A repeat pilot demonstrates consistency; one hero sample is insufficient.

## Candidate Tracker

| Candidate | Location | Contact | Print | Paint | MOQ | Prototype quote | 10/25/50 quote | Shipping model | Status | Evidence |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| PolyX 3D baseline | San Antonio, Texas | Existing relationship | Yes | Associated painter | TBD | `$300` total / `$100` final painted cost per finished model | TBD | Local/U.S. | Initial visible quality accepted; cost itemization and repeatability pending | Owner-reported pickup/payment and physical review; itemized invoice and photos pending |
| Haxu 3D | Guadalajara, Jalisco | `info@haxu3d.com` | High-resolution resin and other processes | Hand painting advertised | TBD | TBD | TBD | Mexico and international shipping advertised | Email sent 2026-08-08; no reply as of 2026-08-11 | [Personalized-figure service](https://haxu3d.com/figuras-realistas/), [contact/privacy location](https://haxu3d.com/aviso-de-privacidad/) |
| Resino Lab | Santiago, Nuevo León | `resinolab@gmail.com` | In-house; accepts STL; ABS or standard photopolymer offered | In-house; price requires sample/detail review | TBD | `$30-$55` USD unpainted estimate; painted quote requested with sample 2026-08-12 | 10/25/50 painted quote requested; pending | Customs broker available; San Antonio shipping cost, terms, damage, and replacement policy requested | Replied 2026-08-10; quotation STL and color reference sent 2026-08-12 | Email thread; [studio/service page](https://resinolab.com/), [official contact](https://resinolab.com/policies/contact-information) |
| MINIMETRIC 3D | Guadalajara, Jalisco | `eaguilar@minimetric3d.com` | Resin and FDM | Acrylic hand painting advertised | TBD | TBD | TBD | Mexico shipping advertised; U.S. capability TBD | Email sent 2026-08-08; no reply as of 2026-08-11; verify business details before files/payment | [Official site and contact](https://minimetric3d.com/) |
| MiniMundo 3D | Mexico; exact workshop location TBD | `mmtresde@gmail.com` | High-definition resin miniatures | Site says ready to paint; painting service not confirmed | TBD | TBD | TBD | National Mexico service; U.S. capability TBD | Email sent 2026-08-08; no reply as of 2026-08-11 | [Service page](https://www.minimundo3d.com/servicios/), [official contact](https://www.minimundo3d.com/contacto/) |
| Códice 47 | Mexico; exact workshop location TBD | `info@codice47print3d.com.mx` | High-detail resin and technical materials | Parts advertised as ready for use or painting; painting service not confirmed | TBD | TBD | TBD | TBD | Email sent 2026-08-08; no reply as of 2026-08-11 | [Official resin service and contact](https://codice47print3d.com.mx/) |

Candidate caveats:

- This is a discovery shortlist, not a recommendation or supplier approval.
- Resino Lab confirmed by email that printing and painting are both performed in-house. Haxu 3D and MINIMETRIC 3D publicly describe both services but have not replied.
- MiniMundo 3D and Códice 47 publicly describe detailed resin printing/paint-ready output but not an in-house painting service; the outreach asks whether they offer painting or coordinate a trusted painter.
- Do not send customer likeness files, production assets, or payment until business identity, data handling, commercial terms, and sample process are verified.

### Resino Lab Reply - 2026-08-10

Resino Lab replied in Spanish to the common RFQ:

- Printing and painting are performed in its own workshop.
- It accepts STL files and offered ABS or standard photopolymer as material options.
- Its preliminary unpainted estimate is `$30-$55 USD` per piece, subject to reviewing the expected finished sample, geometry, and resin volume.
- An unpainted prototype can be ready in `1-2 days`, plus shipping.
- Painted pricing, itemized costs, batch pricing, monthly capacity, and the required finish standard need a sample review before Resino Lab will quote them.
- It said it has a customs broker for sending or receiving merchandise and indicated no objection to the requested confidentiality/non-reuse expectation.
- The reply did not yet provide sample photos, sample cost/process, packaging cost, U.S. shipping cost, customs terms, insurance, or damaged-piece/replacement terms.

This is an encouraging capability response, not yet a comparable landed-cost quote. The next step is to send a neutral representative package only after the sample scope and file-handling terms are confirmed.

## Spanish Outreach - Sent 2026-08-08

Subject:

```text
Solicitud de cotización: impresión y pintura de figuras personalizadas de 15 cm
```

Body:

```text
Hola, equipo de [NOMBRE DEL TALLER]:

Mi nombre es Elliot y formo parte de 3DPrintYou, un proyecto de figuras personalizadas con sede en San Antonio, Texas. Estamos evaluando posibles socios de fabricación en México para producir figuras coleccionables personalizadas en lotes pequeños y recurrentes.

Nosotros proporcionaríamos el archivo 3D listo para revisión de fabricación, la base personalizada con nombre y una guía visual de color. La altura objetivo es de aproximadamente 15 cm. Cada unidad puede representar a una persona o personaje diferente, aunque el tamaño y el proceso general serían similares; no buscamos únicamente copias idénticas del mismo modelo.

El servicio ideal incluiría:

- impresión de alta definición, preferentemente en resina u otro material que ustedes recomienden;
- retiro de soportes, limpieza, preparación e imprimación;
- pintura a mano según nuestra guía visual;
- sellado, control de calidad y empaque individual;
- envío a San Antonio, Texas, o posiblemente envío directo a clientes en Estados Unidos.

¿Tendrían interés y capacidad para trabajar con un proyecto de este tipo? Si es así, agradeceríamos información sobre lo siguiente:

1. Si realizan la impresión y la pintura dentro de su propio taller o si alguna etapa se subcontrata.
2. Formatos de archivo aceptados y recomendaciones de material, paredes mínimas, separación de piezas y ensamblaje.
3. Precio estimado por unidad, tanto sin pintar como completamente pintada y terminada, para:
   - 1 prototipo;
   - 10 unidades;
   - 25 unidades;
   - 50 unidades.
   Estas cantidades representan volumen de lote o mensual y las figuras pueden ser diseños distintos. Si el precio cambia para copias idénticas, favor de indicarlo por separado.
4. Desglose aproximado de impresión, limpieza/preparación, pintura, empaque y envío.
5. Tiempo de entrega para un prototipo y para lotes recurrentes, además de su capacidad mensual aproximada.
6. Fotografías o ejemplos de figuras de tamaño y acabado comparables.
7. Proceso y costo para fabricar una muestra antes de iniciar un lote.
8. Opciones de envío a San Antonio, Texas; experiencia con envíos a Estados Unidos; y cómo manejan aduana, seguro, piezas dañadas y reposiciones.
9. Política de confidencialidad, conservación y eliminación de archivos y referencias. Los archivos y las imágenes de clientes no deberán reutilizarse ni publicarse sin autorización escrita.

En una primera etapa enviaríamos un paquete de muestra neutral, sin fotografías privadas de clientes, para que puedan revisar la viabilidad y preparar una cotización comparable.

Muchas gracias. Quedo atento a sus preguntas y a conocer si este proyecto encaja con las capacidades de su taller.

Saludos,

Elliot
3DPrintYou
San Antonio, Texas, EE. UU.
```

Personalization line for the two print-focused candidates:

```text
Vimos que ofrecen impresión detallada en resina y piezas listas para pintar. También quisiéramos saber si cuentan con servicio de pintura dentro del taller o si pueden coordinarlo con un pintor de confianza.
```

## Open Questions

Product and economics:

- What are the intended retail prices for painted and unpainted 150mm figurines?
- Is customer shipping included or charged separately?
- What minimum contribution margin must remain after all variable costs?
- Are painted and unpainted both launch offers, or should one lead?
- What monthly order volumes should suppliers quote for the first 3, 6, and 12 months?

Production:

- Which print technology and material best balance detail, durability, paintability, and cost?
- Which parts should be split, keyed, assembled, or reinforced before handoff?
- Who removes provider plinths, repairs meshes, adds supports, and approves the final slicer package?
- What paint reference, color tolerance, sealing, and nameplate standard can be inspected consistently?
- Do Meshy's current license and data policies fit customer likeness work for the tested multicolor conversion and any proposed split workflow?
- Can the tested painted 3MF import into a verified U1 profile, slice with correct tool assignments, and meet physical quality without excessive cleanup?
- How many colors/materials can the target printer handle, and do print time, purge waste, seams, support strategy, and post-processing erase the savings in Molly's painting hours?

Cross-border and operations:

- Is bulk import to San Antonio or direct-to-customer shipping cheaper and more reliable at expected volume?
- Which party is responsible for customs classification, documentation, duties/taxes, brokerage, insurance, and damaged shipments? Verify this with a qualified customs/shipping professional before launch.
- What turnaround and buffer inventory are required for gifts and date-sensitive orders?
- What payment currency, deposit, minimum order, and FX exposure apply?
- What backup supplier or local recovery path is available when a shipment or batch fails?

Privacy and commercial terms:

- Will suppliers sign confidentiality/data-handling terms and delete customer likeness files after the agreed retention period?
- May they subcontract printing or painting, and must subcontractors follow the same terms?
- Who owns production photos, paint recipes, support layouts, repairs, and derivative manufacturing files?

## Decision Log

| Date | Status | Decision | Rationale / evidence |
| --- | --- | --- | --- |
| 2026-08-08 | Active | Research Mexico-based combined and specialist print/paint paths before locking the physical fulfillment partner. Keep PolyX 3D as the U.S. comparison baseline. | Three PolyX samples were printed successfully, but finished cost was reportedly over `$100` each after painting at `$20/hour`; the exact breakdown and repeatability remain unverified. |
| 2026-08-08 | Active | Select on delivered economics, repeatable quality, data handling, and operational reliability rather than the lowest print-only quote. | Painting, cleanup, logistics, remakes, and coordination can outweigh a low headline print price. |
| 2026-08-11 | Active | Keep the PolyX samples as the current visible-quality benchmark, but do not treat `$100` per finished model as the target production cost. | The owner paid `$300` total and likes the physical results, but the cost leaves only `$49` below the current `$149` painted fallback price before all other variable costs. |
| 2026-08-11 | Research | Compare full hand painting with AI-assisted multicolor printing plus targeted touch-up before locking the painted manufacturing method. No segmentation model is selected yet. | Reducing full-surface painting hours may improve unit economics, but segmentation cleanup, multicolor print time, purge waste, remaining detail work, and quality must be measured on the same model. |

## Research Journal

| Date | Activity | Evidence / result | Next action |
| --- | --- | --- | --- |
| 2026-08-08 | Created the fulfillment supply-chain workstream from the reported PolyX sample run and painting economics. | User-reported baseline recorded; no Mexico supplier claims or quotes have been validated yet. | Itemize the PolyX baseline, set the margin gate, then build the first 8-candidate Mexico list. |
| 2026-08-08 | Researched five first-pass Mexico candidates and prepared a Spanish RFQ email for user review. | Public service/contact pages recorded for Haxu 3D, Resino Lab, MINIMETRIC 3D, MiniMundo 3D, and Códice 47. No email or contact form has been sent, and no Gmail draft has been created. | User reviews recipients, wording, sender identity, and signature before any Gmail action. |
| 2026-08-08 | Sent five separate Spanish RFQ emails after user approval. | Gmail reported successful sends to Haxu 3D, Resino Lab, MINIMETRIC 3D, MiniMundo 3D, and Códice 47 under subject `Solicitud de cotización: impresión y pintura de figuras personalizadas de 15 cm`. No attachments or customer likeness files were included. | Monitor replies, normalize returned quotes in the cost table, and clarify painting capability for MiniMundo 3D and Códice 47. |
| 2026-08-09 | Checked Gmail for supplier replies and delivery failures. | All five outreach threads still contain only the original sent message. No matching inbox replies, automated responses, or delivery-failure notices were found. | Continue waiting; if there is no response, prepare a short Spanish follow-up after an appropriate business-day interval. |
| 2026-08-11 | Recorded the PolyX pickup, payment, and initial physical review. | Three finished models cost `$300` total / `$100` each. The owner likes how they look, establishing an initial visible-quality benchmark, but considers the painting-inclusive cost too high for the intended profitability model. | Request the itemized allocation, photograph/score the samples, and compare all future samples against this quality benchmark and actual paid total. |
| 2026-08-11 | Checked Gmail and read the supplier reply. | Resino Lab replied on 2026-08-10: print and paint are in-house; STL plus ABS or standard photopolymer are accepted; unpainted work is preliminarily `$30-$55`; an unpainted prototype is `1-2 days` plus shipping; a sample is required for painted/batch pricing and capacity; a customs broker is available. The other four suppliers have not replied as of this check. | Confirm a neutral sample package and request painted price, quantity bands, itemization, sample process, shipping/customs terms, packaging, remakes, and comparable work photos. |
| 2026-08-11 | Added an AI-assisted multicolor segmentation cost-reduction track. | The hypothesis is that printer-addressable color regions could shift Molly's role from full-surface painting toward targeted detail/touch-up. The specific AI model is still unidentified and no manufacturing result has been validated. | Identify the model, verify its terms and true multicolor export, then run a timed cost/quality comparison on the representative figurine. |
| 2026-08-12 | Sent Resino Lab the Chibi Fantasy Female quotation package in the existing Gmail thread. | The email included a watertight quotation STL simplified from the full-resolution assembled model while preserving approximately `173 x 129 x 105mm` overall dimensions, plus the approved color/finish JPG. It requested fully finished pricing for 1, 10, 25, and 50 units; print/prep/paint/packaging breakdown; lead time; San Antonio shipping; and manufacturability recommendations. The message stated that the files are quotation-only and must not be published, reused, or shared. | Record Resino Lab's painted, batch, and landed-cost response; send the full-resolution production file only after process and handling terms are confirmed. |
| 2026-08-26 | Reconfirmed the final PolyX 3D painted cost after the finished figurines were received. | Final cost was exactly `$100` per painted figurine (`$300` for three). | Retain this as the current U.S. finished-sample cost baseline while pursuing an itemized breakdown and lower-cost repeatable alternatives. |
