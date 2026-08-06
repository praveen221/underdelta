"use client";

import { useEffect, useState } from "react";
import { listPosts } from "../apis/listPosts.js";
import { Card } from "./ui/Card.js";

export function PostList() {
  const [posts, setPosts] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    void listPosts().then(setPosts);
  }, []);

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
