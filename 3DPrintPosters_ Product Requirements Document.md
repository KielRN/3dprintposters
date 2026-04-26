# **PRD: 3D Print Posters (AI-Generated 3D Filament Art)**

## **1\. Executive Summary**

**3D Print Posters** is a web-based platform that allows users to transform their personal "vibe" into high-quality, physical 3D-printed posters (approx. 8.5" x 11"). By leveraging a selected AI image provider through Cloudflare AI Gateway for stylized image generation and the Sculpteo API for industrial-grade 3D printing and shipping, we provide a seamless "Pixel-to-Plastic" experience.

## **2\. Target Audience**

* **Custom Gift Seekers:** Individuals looking for unique, personalized AI art.  
* **Fans/Cosplayers:** Users wanting to see themselves as superheroes or stylized characters (e.g., Pixar, Anime).  
* **Home Decor Enthusiasts:** People looking for tactile, textured wall art that goes beyond standard paper prints.

## **3\. Product Workflow**

1. **User Upload:** User uploads a selfie or reference image.  
2. **AI Transformation:** The selected AI provider processes the image based on a chosen style (e.g., "Pixar Hero", "Cyberpunk").  
3. **Approval Gallery:** User views 3-4 generated variations.  
4. **3D Conversion:** Upon selection, a Python backend converts the 2D image into a 3D Heightmap (STL file).  
5. **Checkout:** Integrated Stripe checkout for the physical product.  
6. **Fulfillment:** STL and shipping details are sent to Sculpteo via API for printing and worldwide delivery.

## **4\. Technical Requirements**

### **4.1 Frontend (Vibe Layer)**

* **Framework:** Next.js / React.  
* **Styling:** Tailwind CSS for a premium, "Art Gallery" aesthetic.  
* **3D Preview:** Use Three.js (React Three Fiber) to show a simulated 3D relief of the poster so users can see the texture before buying.

### **4.2 AI Backend**

* **Gateway:** Cloudflare AI Gateway for routing, observability, and future provider flexibility.  
* **Model:** Provider/model decision pending.  
* **Functionality:** \- Image-to-Image (SDEdit) to maintain user facial features.  
  * Prompt Engineering: Force "Cell-shaded" or "Posterized" styles to ensure clear color layers for the 3D print.

### **4.3 Image-to-STL Engine**

* **Logic:** Convert grayscale luminosity values to Z-axis height (0.4mm to 3.0mm).  
* **Format:** Export high-resolution Binary STL.  
* **Slicing Meta:** Generate a "Color Swap Recipe" if using multi-material services, or standard relief maps for Sculpteo's industrial resins.

### **4.4 Fulfillment Integration (Sculpteo API)**

* **Endpoint:** POST /designs (to upload the STL).  
* **Scaling:** Automate resizing to 216mm x 279mm (8.5" x 11").  
* **Material Selection:** Default to "White Resin" (High Detail) or "PLA" (if using a different partner like Slant 3D).  
* **Shipping:** Automated POST /orders call upon successful Stripe webhook trigger.

## **5\. Competitive Differentiators**

* **Industrial Scale:** Unlike Etsy sellers, we use high-end APIs for consistent, professional finishing.  
* **Consistency:** The AI pipeline should prioritize facial consistency and style fidelity over raw prompt novelty.  
* **Tactile UX:** The 3D browser preview allows users to "feel" the depth of the print digitally.

## **6\. Success Metrics**

* **Conversion Rate:** Percentage of generated images that turn into paid orders.  
* **Print Success Rate:** Percentage of STLs that pass Sculpteo's automated "Printability Check."  
* **Customer NPS:** Focus on "Wow Factor" when the physical product arrives.

## **7\. Future Roadmap**

* **Custom Frames:** Add-on options for magnetic frames or LED backlighting.  
* **AR View:** Allow users to use their phone camera to see the poster on their actual wall before purchasing.  
* **Multi-Person Prints:** Support for couples or family "vibe" portraits.
