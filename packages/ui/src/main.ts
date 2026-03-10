import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import router from "./router/index";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import Toast from "vue-toastification";
import "vue-toastification/dist/index.css";
import "./toast.css";
import "./polyfills";

const toastOptions = {
  position: "top-left",
  timeout: 4000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: "button",
  icon: true,
  rtl: false,
  toastClassName: "custom-toast",
};

createApp(App)
  .use(createPinia().use(piniaPluginPersistedstate))
  .use(router)
  .use(Toast, toastOptions)
  .mount("#app");
