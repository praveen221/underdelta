class Queue {
  constructor(public name: string) {}
  add(_name: string, _payload: unknown) {
    return undefined;
  }
}

class Worker {
  constructor(
    public name: string,
    public handler: (job: { data: { orderId: string } }) => void,
  ) {}
}

const fulfillmentQueue = new Queue("fulfillment");

export function enqueueFulfillment(orderId: string) {
  fulfillmentQueue.add("fulfill", { orderId });
}

export const fulfillmentWorker = new Worker("fulfillment", (job) => {
  enqueueFulfillment(job.data.orderId);
});
