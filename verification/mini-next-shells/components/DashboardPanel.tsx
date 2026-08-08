"use client";

import { useEffect, useState } from "react";
import { listDashboardStats } from "../apis/listDashboardStats.js";
import { Card } from "./ui/Card.js";
import { Button } from "./ui/Button.js";

/** Page-owned feature root under Protected /dashboard — calls client apis/**. */
export function DashboardPanel() {
  const [stats, setStats] = useState<{
    activeUsers: number;
    openTasks: number;
  } | null>(null);

  useEffect(() => {
    void listDashboardStats().then(setStats);
  }, []);

  return (
    <Card>
      <p>Protected dashboard panel</p>
      <p>
        {stats
          ? `${stats.activeUsers} users · ${stats.openTasks} tasks`
          : "Loading…"}
      </p>
      <Button>Refresh</Button>
    </Card>
  );
}
