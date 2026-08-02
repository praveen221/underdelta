class Pipeline {
  constructor(
    public name: string,
    setup?: (pipeline: Pipeline) => void,
  ) {
    setup?.(this);
  }

  step(name: string, _fn: (orderId: string) => void) {
    return { name };
  }
}

export function runCheckoutPipeline(orderId: string) {
  const pipeline = new Pipeline("checkout", (p) => {
    p.step("validate", (_id) => undefined);
    p.step("charge", (_id) => undefined);
    p.step("fulfill", (_id) => undefined);
  });
  return { pipeline: pipeline.name, orderId };
}
