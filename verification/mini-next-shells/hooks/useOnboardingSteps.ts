"use client";

import { useEffect, useState } from "react";
import { listOnboardingSteps } from "../apis/listOnboardingSteps.js";

/** Hook bridge: page-owned feature → hook → client apis/**. */
export function useOnboardingSteps() {
  const [steps, setSteps] = useState<
    { id: string; title: string; done: boolean }[]
  >([]);

  useEffect(() => {
    void listOnboardingSteps().then(setSteps);
  }, []);

  return steps;
}
