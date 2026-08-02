import { fulfillOrder } from "./orders.js";
import { enqueueFulfillment } from "./workers.js";
import { runCheckoutPipeline } from "./pipeline.js";

type Handler = (req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) => void;

const app = {
  post(path: string, handler: Handler) {
    return { path, handler };
  },
  get(path: string, handler: Handler) {
    return { path, handler };
  },
};

export function createCheckout(req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  const orderId = String(req.body.orderId ?? "unknown");
  const result = fulfillOrder(orderId);
  enqueueFulfillment(orderId);
  runCheckoutPipeline(orderId);
  res.json(result);
}

export function health(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true });
}

app.post("/checkout", createCheckout);
app.get("/health", health);
