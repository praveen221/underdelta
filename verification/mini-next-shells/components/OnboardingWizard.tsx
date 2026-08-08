"use client";

import { useOnboardingSteps } from "../hooks/useOnboardingSteps.js";

/** Page-owned feature root under Protected /onboarding — API via hook. */
export function OnboardingWizard() {
  const steps = useOnboardingSteps();

  return (
    <ol>
      {steps.map((step) => (
        <li key={step.id}>
          {step.done ? "✓" : "○"} {step.title}
        </li>
      ))}
    </ol>
  );
}
