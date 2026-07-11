# 3D Print You Business Plan

Status: draft v1  
Last updated: 2026-07-11  
Owner: Texas AI Consulting, LLC  
Website: https://3dprintyou.com/

## Business Contacts

- General: contact@3dprintyou.com
- Privacy: privacy@3dprintyou.com
- Admin: admin@3dprintyou.com
- Founder/operator: elliott@3dprintyou.com
- Orders: orders@3dprintyou.com
- Instagram: https://www.instagram.com/3d.printyou/
- Facebook: https://www.facebook.com/profile.php?id=61591961126456

## Project Repositories

- Product app, backend, and fulfillment workflow: `E:\PROJECTS\3DPrintPosters` - https://github.com/KielRN/3dprintposters
- Public 3D Print You website: `E:\PROJECTS\3DPrintyou` - https://github.com/KielRN/3dprintyou

## GoHighLevel Setup

- Subaccount: https://app.gohighlevel.com/v2/location/rBEgeDDx3w48sUxW8oIj/ask-ai
- Business niche: E-commerce / Personalized Gifts
- Free-text niche, if available: Personalized Gifts & Custom 3D Printed Figurines

Recommended brand settings:

| Use | Color | Hex |
| --- | --- | --- |
| Primary brand / CTA | Ember | `#E8552E` |
| Secondary accent | Moss | `#3F6B4C` |
| Background / light base | Cream | `#F5F1EA` |
| Text / dark base | Ink | `#1A1714` |
| UI surface | White | `#FFFFFF` |

Full brand palette:

| Token | Hex | Use |
| --- | --- | --- |
| Cream | `#F5F1EA` | Page background, warm base |
| Ink | `#1A1714` | Body text, headings, dark sections |
| Ember | `#E8552E` | Primary brand orange and CTAs |
| Terracotta | `#C2410C` | CTA hover and deeper orange accent |
| Clay | `#E8DFD3` | Cards, dividers, soft UI surfaces |
| Moss | `#3F6B4C` | Muted secondary accent |
| Muted | `#6B5F52` | Secondary text |
| White | `#FFFFFF` | Panels and surfaces |

## Executive Summary

3D Print You turns a customer's photo into a personalized 3D printed figurine. The customer chooses a curated style, uploads a photo, reviews an AI-generated 2D concept image, adds their name, and pays before the high-cost 3D generation and fulfillment work begins. The customer approves the concept image only, not any GLB, STL, 3MF, slicer file, or other 3D production asset generated later through Meshy, Hi3D, or another provider pipeline. The business is built around done-for-you personalization: customers do not need a 3D printer, slicer, modeling skill, or print-ready design file.

The first launch offer is a limited-run figurine line with eight styles:

- Super Hero Figure - Male
- Super Hero Figure - Female
- Chibi heroic fantasy male
- Chibi heroic fantasy female
- Chibi male
- Chibi female
- Heroic fantasy male
- Heroic fantasy female

The product strategy is to make styles feel collectible and time-bound. Styles can change monthly, and once a style is retired, it should not return unless the business intentionally changes that promise. Each figurine combines the controlled style template with the customer's likeness and name, giving the buyer both novelty and personal identity without turning every order into a fully custom sculpture.

## Business Model

3D Print You sells personalized art pieces. Initial pricing target:

- Launch figurine price: $77
- Shipping: TBD, not yet included in the model
- Taxes and payment processing: TBD by checkout configuration
- All sales final after purchase because the item is custom art, with quality guarantees and refunds for failed fulfillment or unacceptable production defects

The production flow intentionally waits until after payment to run the high-risk 3D provider step. This protects the business from spending provider/API time on abandoned jobs while still letting the customer approve the visual concept before checkout.

## Customer Promise

Customers get a simple path:

1. Choose a limited style.
2. Upload a photo.
3. Review and approve an AI-generated 2D concept image.
4. Add the name for the base.
5. Pay for the custom figurine.
6. 3D Print You generates the production 3D assets after payment, has them reviewed internally or by the print partner, prints the piece, and ships it.

The customer-facing promise should stay honest:

- This is personalized art, not a perfect clone.
- The style is controlled by 3D Print You.
- The customer's identity and name personalize the piece.
- Customer approval applies to the AI-generated concept image, not to the later GLB, STL, 3MF, repair, remesh, slicer, or manufacturing files.
- If the print partner rejects the job, the customer is refunded.
- If the physical piece is poor quality, the customer is refunded or made whole under the quality policy.

## Production Workflow

The current product architecture supports the business model:

- Customer concept generation happens before payment.
- The customer approves an AI-generated 2D concept image before payment.
- 3D figurine generation happens after payment.
- Meshy, Hi3D, or future generated-3D providers stay behind server-side provider boundaries.
- Provider-generated GLB, STL, 3MF, repair/remesh, slicer, or other production assets are reviewed by the operator/print workflow before fulfillment, not by the customer as the approval artifact.
- The reusable base, customer name, and final body/base assembly are controlled by 3D Print You instead of being delegated to the 3D AI provider.

This keeps the general figurine style consistent while still using the customer's photo for identity.

## Launch Print Partner

Initial business partner:

- PolyX3D
- San Antonio, Texas
- contact@polyx3d.com

Quoted production costs from PolyX3D:

| Item | Cost |
| --- | ---: |
| Multicolored model print | $30.00 |
| Multicolored base | $7.50 |
| Single-colored model | $10.00 |
| Single-colored base | $5.50 |

PolyX3D indicated multicolored printing can support up to 4 colors. They also have a painter on the team. Painting was quoted at about $20/hour plus materials, with a low estimate of 2 hours and a high estimate of 4 hours.

Initial planning assumption: use 2 hours for early painted-option modeling, but do not treat painting as included in the $77 base product until sample results and final costs are confirmed.

## Unit Economics

The $77 launch price should be treated as an initial demand-test price, not a fully optimized price.

| Variant | Partner cost before shipping/API/fees/ads | Gross dollars left from $77 |
| --- | ---: | ---: |
| Single-color model + single-color base | $15.50 | $61.50 |
| Multicolor model + multicolor base | $37.50 | $39.50 |
| Single-color print + 2 hours painting | $55.50 plus materials | $21.50 minus materials |
| Multicolor print + 2 hours painting | $77.50 plus materials | -$0.50 minus materials |
| Any print + 4 hours painting | Add $80 plus materials | Not viable at $77 |

Conclusion: the $77 base product can work for single-color and may work for up-to-4-color multicolor if shipping, defects, API cost, payment fees, packaging, and acquisition cost are controlled. Hand painting should be a paid premium add-on, manual quote, or delayed upsell unless samples prove it can be done much faster or for a fixed package price.

The repo already tracks best-effort provider/API cost per job. Current planning should continue measuring:

- 2D proof generation cost
- scene preview cost, if used
- Meshy or Hi3D generation cost
- repair/remesh/print-readiness cost
- partner print cost
- refunds/reprints
- ad cost per purchase

## Competitive Landscape

The market has competitors, but most do not combine the same done-for-you workflow, limited style drops, photo identity, name personalization, and managed printing.

| Competitor type | Examples | What they offer | Opening for 3D Print You |
| --- | --- | --- | --- |
| DIY image-to-3D tools | MakerWorld MakerLab, PrintPal | Generate printable files from images. Often assumes the customer can download files, slice, repair, or print. | 3D Print You removes the printer/design learning curve and delivers the finished item. |
| Custom miniature builders | Hero Forge | Strong character creation and printed minis, but customers design a character through a builder rather than upload a normal photo for a curated identity style. | 3D Print You starts from the customer's actual photo and gift/emotional use case. |
| Photo/scan figurine services | 3D MiniMe and similar services | Full-color mini-me products, often scan/photo driven, with longer production timelines. | 3D Print You can compete through online convenience, monthly collectible styles, and a modern AI proof workflow. |
| Bobblehead and artisan marketplaces | Etsy, Amazon sellers, MyFaceBobbleheads | Handmade or template-body bobbleheads, many with only head customization or variable seller quality. | 3D Print You can own the quality bar, fulfillment partner relationship, and curated style system. |
| Local 3D print services | Local shops and service bureaus | Usually require the customer to bring a print-ready design or accept a custom design quote. | 3D Print You supplies the creative workflow and print-ready package. |

Key differentiation:

- No customer-owned 3D printer required.
- No CAD, Blender, slicer, or STL knowledge required.
- Curated, limited-time styles instead of infinite custom scope.
- Customer identity plus customer name makes the object personal.
- Local production partner creates operational trust and faster iteration.
- Provider risk is handled after payment and behind an internal review workflow.

## Acquisition Plan

Initial channel: Facebook/Meta ads.

A practical planning estimate for early Meta ads:

- Early test budget: $500 to $1,500 over 2 to 4 weeks
- Daily test budget: $20 to $50/day across a small number of creatives
- Early target cost per purchase: under $35 if possible
- Conservative first-campaign planning range: $35 to $75+ per purchase until creative, audience, and landing-page conversion are proven

This matters because $77 leaves limited contribution margin after multicolor printing. Paid acquisition may be too expensive unless the first campaigns convert well, the business charges shipping separately, or upsells increase average order value.

Recommended first ad angles:

- "Turn someone you love into a limited-edition hero figurine."
- "Choose the monthly hero style before it retires."
- Gift use cases: birthdays, Father's Day, Mother's Day, graduations, office gifts, gamer gifts, and family keepsakes.
- Local trust: built by Texas AI Consulting, LLC with fulfillment support from a San Antonio print partner.

Recommended metrics for the first test:

- Landing page view cost
- Email/sign-up conversion
- Start-flow conversion
- Photo upload rate
- Concept approval rate
- Checkout conversion
- Cost per purchase
- Refund/rejection rate
- Gross margin after partner cost, API cost, payment fee, shipping, and ad spend

## Refund And Quality Policy

Working policy:

- All sales are final because each order is custom art.
- If the production provider rejects the job and 3D Print You cannot reasonably fulfill it, refund the customer.
- If the physical piece is poor quality, refund or remake according to the final support policy.
- The customer should approve the AI-generated 2D concept image before payment.
- Customer approval should not be represented as approval of Meshy, Hi3D, GLB, STL, 3MF, repair/remesh, slicer, or other downstream 3D production assets.
- Fulfillment failures should be handled by support without blaming the customer for provider/model issues.

The final website terms should be reviewed before public checkout, especially around likeness rights, minors, celebrity/IP restrictions, refunds, shipping, and custom-art expectations.

## Open Decisions

- Confirm whether $77 includes or excludes shipping.
- Decide whether launch default is single-color, multicolor up to 4 colors, or separate tiers.
- Decide whether painting is unavailable, manual-quote only, or a paid add-on.
- Confirm PolyX3D file format requirements, accepted materials, turnaround time, packaging, quality standards, rejection criteria, and reprint policy.
- Confirm target physical size for the paid product, currently planned around 150mm.
- Set the maximum acceptable cost per acquisition for paid ads.
- Finalize public refund, quality, likeness, minors/consent, and IP policy language.
- Build the first monthly style-drop calendar and retirement rules.

## Sources Reviewed

- [MakerWorld MakerLab](https://makerworld.com/en/makerlab)
- [3D Printing Industry: Meshy and MakerWorld image-to-3D integration](https://3dprintingindustry.com/news/meshy-and-makerworld-team-up-to-put-ai-3d-model-generation-in-bambu-lab-users-hands-250281/)
- [PrintPal Face to 3D Figurine Generator](https://printpal.io/tools/face-3d-generator)
- [Hero Forge custom miniatures](https://www.heroforge.com/)
- [Hero Forge custom color plastic miniatures](https://heroforge.com/content/product-information/about-products/custom-color-plastic/)
- [3D MiniMe](https://3dminimeusa.com/)
- [3D MiniMe pricing](https://3dminimeusa.com/price.php)
- [MyFaceBobbleheads example product](https://myfacebobbleheads.com/products/small-boy-with-overalls-custom-bobblehead)
- [Etsy custom bobblehead marketplace](https://www.etsy.com/market/custom_bobblehead)
- [Etsy custom 3D figures from photo marketplace](https://www.etsy.com/market/custom_3d_figures_from_photo)
- [WebFX Facebook ads cost guide](https://www.webfx.com/social-media/pricing/how-much-does-facebook-advertising-cost/)
- [Triple Whale Facebook ads benchmarks](https://www.triplewhale.com/blog/facebook-ads-benchmarks)
- [Red Stag ecommerce conversion benchmark discussion](https://redstagfulfillment.com/average-conversion-rate-for-ecommerce/)
