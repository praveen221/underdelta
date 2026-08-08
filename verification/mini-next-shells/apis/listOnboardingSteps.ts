/** Client API helper — Onboarding reaches this via a `useX` hook. */
export async function listOnboardingSteps(): Promise<
  { id: string; title: string; done: boolean }[]
> {
  return [
    { id: "1", title: "Confirm email", done: true },
    { id: "2", title: "Add school", done: false },
  ];
}
