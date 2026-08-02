import { Queue, Worker } from "bullmq";
import cron from "node-cron";
import { prisma } from "./db";

export function PaymentForm() {
  return <button>Pay</button>;
}

export function useCheckout() {
  return async function checkout() {
    await prisma.order.create({ data: { total: 100 } });
  };
}

export async function checkout() {
  return prisma.order.findMany();
}

router.post("/checkout", checkout);
cron.schedule("0 * * * *", checkout);

new Queue("payments");
new Worker("payments", checkout);

export function App() {
  return <PaymentForm />;
}
