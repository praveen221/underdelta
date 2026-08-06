"use client";

import { useEffect, useState } from "react";
import { listCourses } from "../apis/listCourses.js";

export function CourseList() {
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    void listCourses().then(setCourses);
  }, []);

  return (
    <ul>
      {courses.map((course) => (
        <li key={course.id}>{course.title}</li>
      ))}
    </ul>
  );
}
