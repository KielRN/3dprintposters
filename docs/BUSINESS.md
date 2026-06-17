# Business Notes

This document keeps early pricing assumptions close to the actual figurine workflow data. The first provider-cost baseline is in [figurine-job-cost-estimate-dc7f29eb.csv](./figurine-job-cost-estimate-dc7f29eb.csv).

## Figurine Provider Cost Baseline

The June 17, 2026 successful figurine job `dc7f29eb-ef0e-4801-8353-d34e246b39d3` reached the current full review path:

1. Gemini generated the 2D figurine proof.
2. Meshy Creative Lab Figure generated the original textured GLB.
3. The deterministic service generated the named base and assembled body/base package.
4. Meshy print tooling analyzed the assembled GLB, repaired it, analyzed the repair, remeshed it, and analyzed remeshed GLB/STL outputs.

The provider-only estimate for this successful path is about **$1.16**:

- Meshy: **51 credits** total, estimated at **$1.02** using a public $20 / 1,000-credit reference.
- Gemini: about **$0.14** for one `gemini-3-pro-image` proof call with one input image and one 1024x1024 output image.

The Meshy credit count is exact from stored job metadata. The Gemini amount is approximate because the job stores the model name, source image size, output image size, and visible response text, but not exact Gemini billing tokens.

## Pricing Implications

This $1.16 is not the product cost. It is only the AI-provider cost for one successful digital path. Before setting customer pricing, add:

- Failed or abandoned generation attempts.
- Firebase, Cloud Storage, Cloud Run, and bandwidth costs.
- Slicer/operator review labor.
- Printing material, machine time, supports, purge/waste, failed prints, and QA.
- Packaging, shipping materials, payment fees, refunds, support, and margin.

For early pricing models, treat provider AI cost as a small but real variable cost. A conservative placeholder is to reserve **$2-$3 per successful figurine order** for AI/provider spend until production billing exports and retry rates are measured.

## Current Assumptions

- Meshy pricing source: [Meshy API pricing](https://docs.meshy.ai/en/api/pricing) lists Creative Lab Figure Prototype at 6 credits, Creative Lab Figure Build at 30 credits, Analyze Printability as free, Repair Printability at 10 credits, and Remesh at 5 credits.
- Meshy USD conversion source: [Meshy's public pricing FAQ](https://www.meshy.ai/pricing) says Pro at $20/month includes 1,000 credits. API top-up or enterprise contract pricing may differ.
- Gemini pricing source: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) for `gemini-3-pro-image` lists image input at an equivalent $0.0011 per image, 1K/2K image output at $0.134 per image, text/image input at $2.00 per 1M tokens, and text/thinking output at $12.00 per 1M tokens.

Replace these estimates with exported billing data once production traffic exists.
