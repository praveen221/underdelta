const posts = [
  { id: "1", title: "Hello", body: "First journal entry" },
];

export async function GET() {
  return Response.json({ posts });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; body?: string };
  const post = {
    id: String(posts.length + 1),
    title: body.title ?? "Untitled",
    body: body.body ?? "",
  };
  posts.push(post);
  return Response.json({ post }, { status: 201 });
}
