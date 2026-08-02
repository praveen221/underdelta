export const prisma = {
  order: {
    findUnique(_args: { where: { id: string } }) {
      return { id: "order_1", status: "pending" };
    },
    update(_args: { where: { id: string }; data: { status: string } }) {
      return { id: "order_1", status: "fulfilled" };
    },
  },
  payment: {
    create(_args: { data: { orderId: string; amount: number } }) {
      return { id: "pay_1" };
    },
  },
};
