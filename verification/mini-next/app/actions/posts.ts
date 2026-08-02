"use server";

export async function createPost(input: { title: string; body: string }) {
  return {
    id: "new",
    title: input.title,
    body: input.body,
  };
}

export async function deletePost(id: string) {
  return { deleted: id };
}
