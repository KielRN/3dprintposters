import {
  displayJobId,
  fulfillmentStages,
  isFulfillmentStage,
  type FulfillmentStage,
} from "./pipeline.js";

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isoDate(value: unknown): string | null {
  const candidate = value as { toDate?: () => Date } | null;
  if (candidate && typeof candidate.toDate === "function") {
    return candidate.toDate().toISOString();
  }
  return null;
}

export const operatorTabs = ["all", "available", "mine", "done"] as const;
export type OperatorTab = (typeof operatorTabs)[number];

export const operatorTabStages: Record<OperatorTab, FulfillmentStage[]> = {
  all: [...fulfillmentStages],
  available: ["paid"],
  mine: ["accepted", "in_production", "rejected_by_operator"],
  done: ["shipped", "completed", "refunded"],
};

export type ShipTo = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

function shipToFromOrder(orderData: LooseRecord): ShipTo | null {
  const address = record(orderData.shippingAddress);
  if (!str(address.line1)) {
    return null;
  }
  return {
    name: str(address.name),
    line1: str(address.line1),
    line2: str(address.line2),
    city: str(address.city),
    state: str(address.state),
    postalCode: str(address.postalCode),
    country: str(address.country),
  };
}

function stageFromDocs(jobData: LooseRecord, orderData: LooseRecord): FulfillmentStage {
  const fulfillment = record(orderData.fulfillment);
  if (isFulfillmentStage(fulfillment.stage)) {
    return fulfillment.stage;
  }
  if (isFulfillmentStage(jobData.pipelineStage)) {
    return jobData.pipelineStage;
  }
  return "paid";
}

export function sanitizeOperatorJobSummary(input: {
  jobId: string;
  jobData: LooseRecord;
  orderData: LooseRecord;
}) {
  const fulfillment = record(input.orderData.fulfillment);
  return {
    jobId: input.jobId,
    displayId: displayJobId(input.jobId),
    customerName: str(input.orderData.customerName) ?? "Customer",
    stage: stageFromDocs(input.jobData, input.orderData),
    productionSubState: str(fulfillment.productionSubState),
    paintOption: str(input.orderData.paintOption),
    productType: str(input.jobData.productType),
    updatedAt:
      isoDate(input.jobData.pipelineUpdatedAt) ??
      isoDate(input.orderData.updatedAt) ??
      isoDate(input.jobData.updatedAt),
  };
}

const shipToVisibleStages = new Set<FulfillmentStage>([
  "accepted",
  "in_production",
  "shipped",
  "completed",
  "rejected_by_operator",
]);

export function sanitizeOperatorJobDetail(input: {
  jobId: string;
  jobData: LooseRecord;
  orderData: LooseRecord;
}) {
  const summary = sanitizeOperatorJobSummary(input);
  const fulfillment = record(input.orderData.fulfillment);
  const historyRaw = Array.isArray(fulfillment.history) ? fulfillment.history : [];
  const bundle = record(input.orderData.printBundle);
  const tracking = record(fulfillment.tracking);
  const rejection = record(fulfillment.rejection);

  return {
    ...summary,
    shipTo: shipToVisibleStages.has(summary.stage)
      ? shipToFromOrder(input.orderData)
      : null,
    customerEmail: shipToVisibleStages.has(summary.stage)
      ? str(input.orderData.customerEmail)
      : null,
    tracking: str(tracking.number)
      ? {
          carrier: str(tracking.carrier),
          number: str(tracking.number),
          at: isoDate(tracking.at),
        }
      : null,
    rejection: str(rejection.reason)
      ? { reason: str(rejection.reason), at: isoDate(rejection.at) }
      : null,
    bundle: {
      status: str(bundle.status) ?? "not_built",
      storagePath: str(bundle.storagePath),
      error: str(bundle.error),
    },
    history: historyRaw.map((entry) => {
      const item = record(entry);
      return {
        stage: str(item.stage),
        at: isoDate(item.at),
        by: str(item.by),
        note: str(item.note),
      };
    }),
  };
}

export type BundleFile = { name: string; storagePath: string };

function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "bin";
}

const bundleModelExtensions = new Set(["stl", "glb", "3mf", "obj"]);

export function selectBundleFiles(input: {
  jobId: string;
  jobData: LooseRecord;
}): BundleFile[] {
  const files: BundleFile[] = [];
  const jobData = input.jobData;
  const printFileArtifacts = record(jobData.printFileArtifacts);

  const approved = str(jobData.approvedImagePath);
  if (approved) {
    files.push({ name: `approved-2d.${extensionOf(approved)}`, storagePath: approved });
  }
  const thumbnail = str(record(jobData.figurinePreview).thumbnailPath);
  if (thumbnail) {
    files.push({ name: `thumbnail.${extensionOf(thumbnail)}`, storagePath: thumbnail });
  }
  const modelStl = str(printFileArtifacts.modelStl);
  if (modelStl) {
    files.push({ name: "model.stl", storagePath: modelStl });
  }
  const fullColor3mf = str(printFileArtifacts.fullColor3mf);
  if (fullColor3mf) {
    files.push({ name: "full-color.3mf", storagePath: fullColor3mf });
  }
  const previewGlb = str(printFileArtifacts.previewGlb);
  if (previewGlb) {
    files.push({ name: "preview.glb", storagePath: previewGlb });
  }
  const assemblyArtifacts = record(record(jobData.figurineAssembly).artifacts);
  for (const [key, value] of Object.entries(assemblyArtifacts)) {
    const path = str(value);
    if (!path) {
      continue;
    }
    const extension = extensionOf(path);
    if (bundleModelExtensions.has(extension)) {
      files.push({ name: `${key}.${extension}`, storagePath: path });
    }
  }
  return files;
}

export function buildJobSheet(input: {
  jobId: string;
  jobData: LooseRecord;
  orderData: LooseRecord;
}): string {
  const shipTo = shipToFromOrder(input.orderData);
  const lines = [
    `Job #${displayJobId(input.jobId)} (${input.jobId})`,
    `Customer: ${str(input.orderData.customerName) ?? "Unknown"}`,
    `Product: ${str(input.jobData.productType) ?? "unknown"}`,
    `Paint option: ${str(input.orderData.paintOption) ?? "unpainted"}`,
    "",
    "Ship to:",
    ...(shipTo
      ? [
          shipTo.name ?? "",
          shipTo.line1 ?? "",
          ...(shipTo.line2 ? [shipTo.line2] : []),
          `${shipTo.city ?? ""}, ${shipTo.state ?? ""} ${shipTo.postalCode ?? ""} ${shipTo.country ?? ""}`,
        ]
      : ["(no address on file — contact support)"]),
  ];
  return lines.join("\n");
}

export function customerFieldsFromSession(session: LooseRecord): {
  customerName: string | null;
  customerEmail: string | null;
  shippingAddress: ShipTo | null;
} {
  const customer = record(session.customer_details);
  const shipping =
    (record(session.shipping_details).address
      ? record(session.shipping_details)
      : null) ??
    (record(record(session.collected_information).shipping_details).address
      ? record(record(session.collected_information).shipping_details)
      : null);
  const address = shipping ? record(shipping.address) : null;

  return {
    customerName: str(customer.name),
    customerEmail: str(customer.email),
    shippingAddress: address
      ? {
          name: str(shipping?.name),
          line1: str(address.line1),
          line2: str(address.line2),
          city: str(address.city),
          state: str(address.state),
          postalCode: str(address.postal_code),
          country: str(address.country),
        }
      : null,
  };
}
