"use client";

import { Card } from "./ui/Card.js";

export function PostList() {
  const posts = [
    { id: "1", title: "Hello" },
    { id: "2", title: "Second thoughts" },
  ];

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>
          <Card>{post.title}</Card>
        </li>
      ))}
    </ul>
  );
}
