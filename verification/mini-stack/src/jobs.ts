import { reconcilePayments } from "./reconcile.js";

const cron = {
  schedule(expression: string, handler: () => void) {
    return { expression, handler };
  },
};

export function startJobs() {
  cron.schedule("0 * * * *", reconcilePayments);
}
