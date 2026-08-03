import { createApp } from "vue";
import Shell from "./Shell.js";
import { router } from "./router.js";

createApp(Shell).use(router).mount("#app");
