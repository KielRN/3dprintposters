# Figurine Fulfillment Supply-Chain Research

Status: active

Started: 2026-08-08

Owner: TBD

## Purpose

Choose a repeatable physical-fulfillment path for the approximately 150mm personalized figurine product. The first comparison is the current San Antonio baseline against Mexico-based 3D printing and hand-painting options, including both combined suppliers and coordinated printer/painter pairs.

This file is the durable working record for supplier research, open questions, evidence, and workstream decisions. High-level status belongs in `docs/ROADMAP.md`; durable product policy belongs in `DECISIONS.md`; completed repository changes belong in `CHANGELOG.md`.

## Current Evidence

Facts reported on 2026-08-08:

- PolyX 3D in San Antonio printed three sample figurines from supplied 3D print files.
- Painting was quoted or performed through an associated painter at `$20/hour`.
- The finished samples were reportedly more than `$100` each after painting.
- The exact print, cleanup, paint labor, materials, packaging, tax, and shipping breakdown has not yet been recorded here.

Repository facts:

- The product target is approximately `150mm` / 6 inches tall.
- The backend currently has fallback checkout amounts of `$99` unpainted and `$149` painted in `apps/functions/src/index.ts`; configured Stripe Price IDs may override those fallbacks.
- At a production cost above `$100`, the `$149` fallback painted price leaves less than `$49` before customer shipping, payment fees, AI/provider cost, support, refunds, replacements, and overhead. This is a directional warning, not a completed margin calculation.
- Partner selection remains a launch blocker because file compatibility, print readiness, physical quality, quote, policy, shipping, and repeatability have not been validated end to end.

Assumptions to test:

- Mexico may offer a lower landed cost for printing plus painting, but no Mexico supplier has been selected or validated.
- Early volumes may be too low for factory pricing, so the comparison must include prototype, 10-unit, 25-unit, and 50-unit economics.
- A combined print-and-paint supplier may reduce coordination risk, while separate specialist vendors may produce better quality or pricing.

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
5. **Unpainted product:** retain a lower-complexity offer if painted economics cannot meet the margin and quality gate.

Compare both bulk shipment to San Antonio for final inspection/domestic fulfillment and direct-to-customer shipping from Mexico. Do not assume either route wins before quotes and sample evidence.

## Research Sequence

### Phase 0 - Establish The Baseline

1. Obtain the PolyX 3D itemized quote or invoice for each of the three samples.
2. Record print technology, material, model dimensions, supports/cleanup, primer, painter hours, paint/material cost, sealing, packaging, tax, shipping, and rework.
3. Photograph each sample consistently and score print detail, surface finish, paint accuracy, likeness, durability, base/name legibility, and packaging condition.
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
| Print and material | TBD | TBD | Quote/invoice |
| Supports, cleanup, and assembly | TBD | TBD | Quote/invoice |
| Primer and surface preparation | TBD | TBD | Quote/invoice |
| Painting labor | Reported `$20/hour` | TBD | Hours or fixed-price quote |
| Paint, sealant, and consumables | TBD | TBD | Quote/invoice |
| Base and nameplate finishing | TBD | TBD | Quote/invoice |
| Quality control | TBD | TBD | Quote/process |
| Packaging | TBD | TBD | Quote/sample |
| Freight and insurance | TBD | TBD | Carrier quote |
| Duties, tax, and brokerage | TBD | TBD | Broker/carrier evidence |
| Currency/payment fees | N/A or TBD | TBD | Payment record |
| Expected rework/remake allowance | TBD | TBD | Pilot evidence |
| **Finished print + paint subtotal** | **More than `$100` reported** | **TBD** | Quote/invoice |
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
| PolyX 3D baseline | San Antonio, Texas | Existing relationship | Yes | Associated painter | TBD | More than `$100` finished, reported | TBD | Local/U.S. | Baseline; needs itemization | Quote, invoice, photos pending |
| Haxu 3D | Guadalajara, Jalisco | `info@haxu3d.com` | High-resolution resin and other processes | Hand painting advertised | TBD | TBD | TBD | Mexico and international shipping advertised | Email sent 2026-08-08; no reply as of 2026-08-09 | [Personalized-figure service](https://haxu3d.com/figuras-realistas/), [contact/privacy location](https://haxu3d.com/aviso-de-privacidad/) |
| Resino Lab | Santiago, Nuevo León | `resinolab@gmail.com` | Resin figures | Painting service advertised | TBD | TBD | TBD | Mexico shipping advertised; U.S. capability TBD | Email sent 2026-08-08; no reply as of 2026-08-09 | [Studio/service page](https://resinolab.com/), [official contact](https://resinolab.com/policies/contact-information) |
| MINIMETRIC 3D | Guadalajara, Jalisco | `eaguilar@minimetric3d.com` | Resin and FDM | Acrylic hand painting advertised | TBD | TBD | TBD | Mexico shipping advertised; U.S. capability TBD | Email sent 2026-08-08; no reply as of 2026-08-09; verify business details before files/payment | [Official site and contact](https://minimetric3d.com/) |
| MiniMundo 3D | Mexico; exact workshop location TBD | `mmtresde@gmail.com` | High-definition resin miniatures | Site says ready to paint; painting service not confirmed | TBD | TBD | TBD | National Mexico service; U.S. capability TBD | Email sent 2026-08-08; no reply as of 2026-08-09 | [Service page](https://www.minimundo3d.com/servicios/), [official contact](https://www.minimundo3d.com/contacto/) |
| Códice 47 | Mexico; exact workshop location TBD | `info@codice47print3d.com.mx` | High-detail resin and technical materials | Parts advertised as ready for use or painting; painting service not confirmed | TBD | TBD | TBD | TBD | Email sent 2026-08-08; no reply as of 2026-08-09 | [Official resin service and contact](https://codice47print3d.com.mx/) |

Candidate caveats:

- This is a discovery shortlist, not a recommendation or supplier approval.
- Haxu 3D, Resino Lab, and MINIMETRIC 3D publicly describe both printing and painting.
- MiniMundo 3D and Códice 47 publicly describe detailed resin printing/paint-ready output but not an in-house painting service; the outreach asks whether they offer painting or coordinate a trusted painter.
- Do not send customer likeness files, production assets, or payment until business identity, data handling, commercial terms, and sample process are verified.

## Proposed Spanish Outreach - Not Sent

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

## Research Journal

| Date | Activity | Evidence / result | Next action |
| --- | --- | --- | --- |
| 2026-08-08 | Created the fulfillment supply-chain workstream from the reported PolyX sample run and painting economics. | User-reported baseline recorded; no Mexico supplier claims or quotes have been validated yet. | Itemize the PolyX baseline, set the margin gate, then build the first 8-candidate Mexico list. |
| 2026-08-08 | Researched five first-pass Mexico candidates and prepared a Spanish RFQ email for user review. | Public service/contact pages recorded for Haxu 3D, Resino Lab, MINIMETRIC 3D, MiniMundo 3D, and Códice 47. No email or contact form has been sent, and no Gmail draft has been created. | User reviews recipients, wording, sender identity, and signature before any Gmail action. |
| 2026-08-08 | Sent five separate Spanish RFQ emails after user approval. | Gmail reported successful sends to Haxu 3D, Resino Lab, MINIMETRIC 3D, MiniMundo 3D, and Códice 47 under subject `Solicitud de cotización: impresión y pintura de figuras personalizadas de 15 cm`. No attachments or customer likeness files were included. | Monitor replies, normalize returned quotes in the cost table, and clarify painting capability for MiniMundo 3D and Códice 47. |
| 2026-08-09 | Checked Gmail for supplier replies and delivery failures. | All five outreach threads still contain only the original sent message. No matching inbox replies, automated responses, or delivery-failure notices were found. | Continue waiting; if there is no response, prepare a short Spanish follow-up after an appropriate business-day interval. |
