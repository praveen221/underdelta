import { PostList } from "../components/PostList.js";
import { PostForm } from "../components/PostForm.js";

export default function HomePage() {
  return (
    <main>
      <h1>Journal</h1>
      <PostForm />
      <PostList />
    </main>
  );
}
