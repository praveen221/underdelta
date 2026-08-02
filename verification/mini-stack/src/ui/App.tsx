export function OrderStatus({ orderId }: { orderId: string }) {
  return <div>Order {orderId}</div>;
}

export function App() {
  return <OrderStatus orderId="order_1" />;
}
