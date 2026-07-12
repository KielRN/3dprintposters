import { describe, expect, it } from "vitest";
import {
  heroName,
  jobStatusChip,
  thumbnailPath,
  type JobCardSource,
} from "./jobPresentation";

const base: JobCardSource = { status: "preview_ready" };

describe("jobStatusChip (implementation.md chip table, evaluated in order)", () => {
  it("paid pipeline wins over everything", () => {
    expect(
      jobStatusChip({ ...base, pipelineStage: "paid", status: "approved" }),
    ).toEqual({ label: "In production", tone: "moss" });
  });

  it("post-payment build failure stays In production (never customer-facing)", () => {
    expect(
      jobStatusChip({
        ...base,
        pipelineStage: "paid",
        status: "approved",
        figurineBuild: { status: "failed" },
      }),
    ).toEqual({ label: "In production", tone: "moss" });
  });

  it("checkout_created -> In checkout / gold", () => {
    expect(jobStatusChip({ ...base, status: "checkout_created" })).toEqual({
      label: "In checkout",
      tone: "gold",
    });
  });

  it("approved (unpaid) -> Ready to order / ember pulsing", () => {
    expect(jobStatusChip({ ...base, status: "approved" })).toEqual({
      label: "Ready to order",
      tone: "ember",
      pulse: true,
    });
  });

  it("preview_ready -> Concept ready / moss", () => {
    expect(jobStatusChip({ ...base, status: "preview_ready" })).toEqual({
      label: "Concept ready — pick one",
      tone: "moss",
    });
  });

  it("pre-payment terminal states route to review chips", () => {
    expect(jobStatusChip({ ...base, status: "failed" })).toEqual({
      label: "Studio review",
      tone: "gold",
    });
    expect(
      jobStatusChip({ ...base, status: "approved", printFileStatus: "failed" }),
    ).toEqual({ label: "Support review", tone: "gold" });
  });

  it("anything else -> In progress / muted", () => {
    expect(jobStatusChip({ ...base, status: "created" })).toEqual({
      label: "In progress",
      tone: "muted",
    });
  });
});

describe("thumbnailPath", () => {
  it("prefers approvedImagePath", () => {
    expect(
      thumbnailPath({
        ...base,
        approvedImagePath: "generated/u/j/preview.jpg",
        generatedImages: [{ storagePath: "generated/u/j/preview-1.png" }],
        sourceImagePath: "uploads/u/j/source.jpg",
      }),
    ).toBe("generated/u/j/preview.jpg");
  });

  it("skips placeholder generations (source-photo proofs must not masquerade)", () => {
    expect(
      thumbnailPath({
        ...base,
        generatedImages: [
          { storagePath: "generated/u/j/placeholder.png", isPlaceholder: true },
          { storagePath: "generated/u/j/preview-2.png" },
        ],
        sourceImagePath: "uploads/u/j/source.jpg",
      }),
    ).toBe("generated/u/j/preview-2.png");
  });

  it("falls back to sourceImagePath, then null", () => {
    expect(
      thumbnailPath({
        ...base,
        generatedImages: [
          { storagePath: "generated/u/j/p.png", isPlaceholder: true },
        ],
        sourceImagePath: "uploads/u/j/source.jpg",
      }),
    ).toBe("uploads/u/j/source.jpg");
    expect(thumbnailPath({ ...base })).toBeNull();
  });
});

describe("heroName", () => {
  it("uses the base sign text when set", () => {
    expect(heroName({ ...base, baseConfig: { sign: { text: "Ellie" } } })).toBe(
      "Ellie",
    );
  });

  it("falls back to 'your hero' on empty/missing sign", () => {
    expect(heroName({ ...base })).toBe("your hero");
    expect(heroName({ ...base, baseConfig: { sign: { text: "  " } } })).toBe(
      "your hero",
    );
  });
});
