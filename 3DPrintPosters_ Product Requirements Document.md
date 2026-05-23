# **PRD: 3D Print You / 3D Print Posters (AI-Generated Personalized Print Products)**

## **1\. Executive Summary**

The active business priority is now proving demand for personalized AI figurines before continuing deep investment in the 5" x 7" poster-relief generator.

**3D Print You** is the better-fit public offer for this shift, using `3dprintyou.com` as the preferred customer-facing domain. The product is a web-based platform that lets users upload a photo, choose a figurine style and posture, approve a generated 2D proof, preview a generated 3D figurine, and either purchase, preorder, or request manual fulfillment.

**3D Print Posters** remains a parked product line for AI-generated 5" x 7" relief posters. The existing relief generator and Super Dad direction are useful R&D, but they should not block the near-term customer-acquisition test.

## **2\. Target Audience**

* **Custom Gift Seekers:** Individuals looking for a personalized bobblehead, chibi, cartoon, or desk figurine.
* **Parents/Families:** Users who want a playful physical avatar of a child, partner, friend, coach, teacher, or family member.
* **Creators/Teams/Events:** People who want mascot-style figurines, awards, table displays, or small-batch personalized merch.
* **Poster Relief Buyers:** A later or secondary audience for tactile 5" x 7" wall art after the relief path is product-ready.

## **3\. Product Workflow**

1. **User Upload:** User uploads a selfie or reference image.
2. **Style Selection:** User chooses a figurine style such as Bobblehead, Chibi, Cartoon, or Emoji.
3. **Posture Selection:** User chooses Natural pose, Image pose, T-pose, or a provider-backed equivalent.
4. **2D Proof:** The backend generates a 2D proof so the user can inspect likeness, outfit, and style before spending credits on 3D generation.
5. **3D Figurine Generation:** After approval, a server-side provider adapter sends the approved image to the selected generated-3D provider. Meshy.ai is the first candidate to evaluate.
6. **3D Preview:** The app stores and shows generated GLB/STL/optional 3MF assets, thumbnails, provider audit, and warnings.
7. **Purchase Intent:** User checks out, preorders, or requests manual fulfillment depending on validated print readiness.
8. **Fulfillment:** Only after slicer/physical-print validation should paid orders be routed to an in-house/local FDM process, print partner, or automated fulfillment provider.

## **4\. Technical Requirements**

### **4.1 Frontend (Vibe Layer)**

* **Framework:** Next.js / React.
* **Styling:** Tailwind CSS for a polished, giftable consumer product experience.
* **3D Preview:** Use Three.js (React Three Fiber) to show the generated standalone figurine GLB before purchase intent.

### **4.2 AI Backend**

* **Proof Generation:** Direct Vertex/Gemini remains the current proof-generation path unless a provider-specific image-prep route is chosen.
* **Generated 3D Provider:** Meshy.ai is the first provider candidate for image-to-3D figurines. Keep it behind a server-side adapter and store returned assets immediately because external asset retention may be short.
* **Webhooks:** Meshy webhook creation is currently documented as a Meshy dashboard action requiring an HTTPS callback URL. Use polling first or create a webhook manually once a deployed receiver or smee.io proxy URL exists.
* **Prompting:** Generate clean figurine-friendly proofs, not photorealistic noisy textures.

### **4.3 Generated 3D / Print File Engine**

**Active figurine path:**

* **Provider boundary:** Server-side adapter for Meshy or another image-to-3D provider.
* **Preview format:** GLB.
* **Validation formats:** STL and optional 3MF.
* **Audit:** Provider task id, model version, requested formats, cost/credits, status, warnings, and stored asset paths.
* **Print validation:** Slicer and physical test print before automated checkout/fulfillment.

**Parked poster-relief path:**

* **Logic:** Convert grayscale luminosity values to Z-axis height (0.4mm to 3.0mm), with optional subject-aware depth and segmentation.
* **Geometry Format:** Export high-resolution Binary STL for baseline geometry validation.
* **Color Format:** Export a Mimaki-partner package such as 3MF, OBJ plus texture, VRML, or PLY so full-color print data survives beyond the STL.
* **Size:** Target physical output is 127mm x 177.8mm (5" x 7").

### **4.4 Fulfillment Integration**

For the figurine MVP, evaluate the simplest path that can ship acceptable physical quality: local/Bambu-class FDM, a nearby print partner, or manual quoting. Do not assume the older Mimaki 3DUJ-2207 relief partner strategy is the right first fulfillment path for standalone figurines.

For the parked poster-relief product:

* **Target Printer:** Mimaki 3DUJ-2207 full-color UV-curable inkjet 3D printer.
* **Partner Search:** Prioritize businesses that can accept 5x7 color relief jobs and confirm preferred file format, wall/base thickness, color handling, quoting, and turnaround.
* **Scaling:** Automate resizing to 127mm x 177.8mm (5" x 7") before partner handoff.
* **Material Selection:** Start with the Mimaki 3DUJ-2207 partner's default full-color UV resin workflow.
* **Shipping:** Trigger partner order or manual review only after successful Stripe webhook confirmation.

## **5\. Competitive Differentiators**

* **Low-Friction Personalization:** PrintU-like guided flow makes the product understandable to non-technical customers.
* **Provider Leverage:** Use what generated 3D providers already do well instead of forcing the poster-relief generator to prove the business alone.
* **Trust Before Purchase:** 2D proof plus 3D GLB preview gives users a concrete artifact before checkout/preorder.
* **Optional Poster Line:** Relief posters can return later as a differentiated product once quality is stable.

## **6\. Success Metrics**

* **Upload-To-Proof Rate:** Percentage of visitors who upload and generate a 2D proof.
* **Proof-To-3D Rate:** Percentage of proofs that users approve for 3D generation.
* **3D Preview-To-Intent Rate:** Percentage of generated figurines that lead to checkout, preorder, or lead capture.
* **Print Success Rate:** Percentage of generated figurines that pass slicer and physical-print validation.
* **Customer NPS:** Focus on "Wow Factor" when the physical product arrives.

## **7\. Future Roadmap**

* **Custom Bases/Name Tags:** Add-on options for figurine display bases and names.
* **Multi-Person Figurines:** Couples, teams, families, or event awards.
* **AR View:** Let users see the figurine on a desk or shelf before purchasing.
* **Poster Relief Revival:** Resume 5" x 7" tactile wall art once the relief generator has a clear quality path or after customer acquisition proves demand.
