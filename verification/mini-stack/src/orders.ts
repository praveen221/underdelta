import { prisma } from "./db.js";

export function fulfillOrder(orderId: string) {
  const order = prisma.order.findUnique({ where: { id: orderId } });
  prisma.order.update({
    where: { id: orderId },
    data: { status: "fulfilled" },
  });
  return order;
}
