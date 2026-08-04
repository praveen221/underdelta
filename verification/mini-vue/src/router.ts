import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.js";
import DashboardView from "./views/DashboardView.js";

const routes = [
  {
    path: "/",
    name: "home",
    component: HomeView,
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: DashboardView,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
