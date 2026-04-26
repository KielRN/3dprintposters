import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const jobRequestSchema = z.object({
  style: z.string().min(1),
  fileName: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = jobRequestSchema.safeParse({
    style: formData.get("style"),
    fileName: formData.get("fileName")
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Photo and style are required."
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    jobId: `local-${crypto.randomUUID()}`,
    status: "created",
    selectedStyle: parsed.data.style,
    sourceFileName: parsed.data.fileName
  });
}

