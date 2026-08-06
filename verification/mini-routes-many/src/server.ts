type Handler = (
  req: { body: Record<string, unknown> },
  res: { json: (value: unknown) => void },
) => void;

const app = {
  get(path: string, handler: Handler) {
    return { path, handler };
  },
  post(path: string, handler: Handler) {
    return { path, handler };
  },
  put(path: string, handler: Handler) {
    return { path, handler };
  },
  delete(path: string, handler: Handler) {
    return { path, handler };
  },
};

export function handler_0(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/health" });
}

export function handler_1(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/readyz" });
}

export function handler_2(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/ping" });
}

export function handler_3(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/users" });
}

export function handler_4(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/users" });
}

export function handler_5(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/users/:id" });
}

export function handler_6(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/users/:id" });
}

export function handler_7(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/users/:id" });
}

export function handler_8(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/users/:id/profile" });
}

export function handler_9(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles" });
}

export function handler_10(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles" });
}

export function handler_11(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles/:slug" });
}

export function handler_12(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles/:slug" });
}

export function handler_13(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles/:slug" });
}

export function handler_14(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles/:slug/comments" });
}

export function handler_15(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles/:slug/comments" });
}

export function handler_16(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/articles/:slug/comments/:id" });
}

export function handler_17(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/comments" });
}

export function handler_18(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/comments" });
}

export function handler_19(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/comments/:id" });
}

export function handler_20(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/comments/:id" });
}

export function handler_21(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/auth/login" });
}

export function handler_22(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/auth/logout" });
}

export function handler_23(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/auth/register" });
}

export function handler_24(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/auth/me" });
}

export function handler_25(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/auth/refresh" });
}

export function handler_26(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/payments" });
}

export function handler_27(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/payments" });
}

export function handler_28(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/payments/:id" });
}

export function handler_29(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/payments/:id/refund" });
}

export function handler_30(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/admin/stats" });
}

export function handler_31(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/admin/users" });
}

export function handler_32(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/admin/users/:id/ban" });
}

export function handler_33(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/admin/audit" });
}

export function handler_34(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/tags" });
}

export function handler_35(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/tags" });
}

export function handler_36(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/tags/:id" });
}

export function handler_37(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/profiles/:username" });
}

export function handler_38(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/profiles/:username/follow" });
}

export function handler_39(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/profiles/:username/follow" });
}

export function handler_40(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc1" });
}

export function handler_41(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc2" });
}

export function handler_42(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc3" });
}

export function handler_43(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc4" });
}

export function handler_44(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc5" });
}

export function handler_45(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc6" });
}

export function handler_46(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc7" });
}

export function handler_47(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc8" });
}

export function handler_48(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc9" });
}

export function handler_49(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc10" });
}

export function handler_50(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc11" });
}

export function handler_51(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc12" });
}

export function handler_52(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc13" });
}

export function handler_53(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc14" });
}

export function handler_54(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc15" });
}

export function handler_55(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc16" });
}

export function handler_56(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc17" });
}

export function handler_57(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc18" });
}

export function handler_58(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc19" });
}

export function handler_59(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc20" });
}

export function handler_60(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc21" });
}

export function handler_61(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc22" });
}

export function handler_62(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc23" });
}

export function handler_63(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc24" });
}

export function handler_64(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc25" });
}

export function handler_65(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc26" });
}

export function handler_66(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc27" });
}

export function handler_67(_req: { body: Record<string, unknown> }, res: { json: (value: unknown) => void }) {
  res.json({ ok: true, path: "/misc28" });
}

app.get("/health", handler_0);
app.get("/readyz", handler_1);
app.get("/ping", handler_2);
app.get("/users", handler_3);
app.post("/users", handler_4);
app.get("/users/:id", handler_5);
app.put("/users/:id", handler_6);
app.delete("/users/:id", handler_7);
app.get("/users/:id/profile", handler_8);
app.get("/articles", handler_9);
app.post("/articles", handler_10);
app.get("/articles/:slug", handler_11);
app.put("/articles/:slug", handler_12);
app.delete("/articles/:slug", handler_13);
app.get("/articles/:slug/comments", handler_14);
app.post("/articles/:slug/comments", handler_15);
app.delete("/articles/:slug/comments/:id", handler_16);
app.get("/comments", handler_17);
app.post("/comments", handler_18);
app.get("/comments/:id", handler_19);
app.delete("/comments/:id", handler_20);
app.post("/auth/login", handler_21);
app.post("/auth/logout", handler_22);
app.post("/auth/register", handler_23);
app.get("/auth/me", handler_24);
app.post("/auth/refresh", handler_25);
app.get("/payments", handler_26);
app.post("/payments", handler_27);
app.get("/payments/:id", handler_28);
app.post("/payments/:id/refund", handler_29);
app.get("/admin/stats", handler_30);
app.get("/admin/users", handler_31);
app.post("/admin/users/:id/ban", handler_32);
app.get("/admin/audit", handler_33);
app.get("/tags", handler_34);
app.post("/tags", handler_35);
app.delete("/tags/:id", handler_36);
app.get("/profiles/:username", handler_37);
app.post("/profiles/:username/follow", handler_38);
app.delete("/profiles/:username/follow", handler_39);
app.get("/misc1", handler_40);
app.get("/misc2", handler_41);
app.get("/misc3", handler_42);
app.get("/misc4", handler_43);
app.get("/misc5", handler_44);
app.get("/misc6", handler_45);
app.get("/misc7", handler_46);
app.get("/misc8", handler_47);
app.get("/misc9", handler_48);
app.get("/misc10", handler_49);
app.get("/misc11", handler_50);
app.get("/misc12", handler_51);
app.get("/misc13", handler_52);
app.get("/misc14", handler_53);
app.get("/misc15", handler_54);
app.get("/misc16", handler_55);
app.get("/misc17", handler_56);
app.get("/misc18", handler_57);
app.get("/misc19", handler_58);
app.get("/misc20", handler_59);
app.get("/misc21", handler_60);
app.get("/misc22", handler_61);
app.get("/misc23", handler_62);
app.get("/misc24", handler_63);
app.get("/misc25", handler_64);
app.get("/misc26", handler_65);
app.get("/misc27", handler_66);
app.get("/misc28", handler_67);
