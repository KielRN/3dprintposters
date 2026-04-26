import fs from "node:fs";
import Stripe from "stripe";

function parseEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) {
    return values;
  }

  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

const env = { ...parseEnv(".env"), ...process.env };
const secretKey = env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is missing.");
}

if (!secretKey.startsWith("sk_test_")) {
  throw new Error("Refusing to create the test product without a Stripe test secret key.");
}

const metadata = {
  app: "3d-print-posters",
  sku: "poster-8x11-relief",
  environment: "test"
};

const stripe = new Stripe(secretKey);
const products = await stripe.products.list({ active: true, limit: 100 });
let product = products.data.find(
  (item) => item.metadata?.app === metadata.app && item.metadata?.sku === metadata.sku
);

if (!product) {
  product = await stripe.products.create({
    name: "Custom 3D Print Poster",
    description: "8.5in x 11in physical AI-generated relief poster.",
    shippable: true,
    metadata
  });
}

const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
let price = prices.data.find(
  (item) => item.currency === "usd" && item.unit_amount === 6000 && item.type === "one_time"
);

if (!price) {
  price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 6000,
    metadata
  });
}

console.log(
  JSON.stringify(
    {
      productId: product.id,
      priceId: price.id,
      amount: price.unit_amount,
      currency: price.currency
    },
    null,
    2
  )
);
