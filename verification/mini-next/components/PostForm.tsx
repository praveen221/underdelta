"use client";

import { createPost } from "../app/actions/posts.js";
import { Button } from "./ui/Button.js";

export function PostForm() {
  return (
    <form
      action={async (formData) => {
        await createPost({
          title: String(formData.get("title") ?? ""),
          body: String(formData.get("body") ?? ""),
        });
      }}
    >
      <input name="title" placeholder="Title" />
      <textarea name="body" placeholder="Write something" />
      <Button>Publish</Button>
    </form>
  );
}
