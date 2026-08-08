"use client";

import { useEffect, useState } from "react";
import { getProfile } from "../../../apis/getProfile.js";

/** Page body calls client apis/** directly (no separate feature root). */
export default function ProfilePage() {
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    void getProfile().then(setProfile);
  }, []);

  return (
    <main>
      <h1>Profile</h1>
      <p>{profile ? `${profile.name} · ${profile.email}` : "Loading…"}</p>
    </main>
  );
}
