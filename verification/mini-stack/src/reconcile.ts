import { prisma } from "./db.js";

export function reconcilePayments() {
  prisma.payment.create({
    data: {
      orderId: "order_1",
      amount: 0,
    },
  });
}
