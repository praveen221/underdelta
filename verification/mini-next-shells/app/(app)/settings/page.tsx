"use client";

import { useEffect, useState } from "react";
import { listDashboardStats } from "../../../apis/listDashboardStats.js";

/**
 * Scholar-shaped page body: calls client `apis/**` directly (no featureRoot
 * child). Projection must still lift Settings → HTTP API.
 */
export default function SettingsPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void listDashboardStats().then(() => setReady(true));
  }, []);

  return (
    <main>
      <h1>Settings</h1>
      <p>{ready ? "Synced" : "Loading…"}</p>
    </main>
  );
}
