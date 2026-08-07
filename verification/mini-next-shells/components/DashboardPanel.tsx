import { Card } from "./ui/Card.js";
import { Button } from "./ui/Button.js";

/** Page-owned feature root under Protected /dashboard. */
export function DashboardPanel() {
  return (
    <Card>
      <p>Protected dashboard panel</p>
      <Button>Refresh</Button>
    </Card>
  );
}
