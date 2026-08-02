"use client";

export function PostList() {
  const posts = [
    { id: "1", title: "Hello" },
    { id: "2", title: "Second thoughts" },
  ];

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
