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
import { installGlobalErrorHandler } from "./lib/errorHandling";
import { isInHost } from "./lib/host/detect";
import { hydratePersistedStorage } from "./lib/host/persistedStorage";

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

if (!isInHost()) {
  const root = document.getElementById("app");
  if (root) {
    root.innerHTML =
      '<div class="min-h-screen bg-dot-bg flex items-center justify-center px-6 text-center text-white"><div>Open this app in Polkadot Desktop.</div></div>';
  }
} else {
  void (async () => {
    await hydratePersistedStorage();

    const app = createApp(App);
    app.use(createPinia().use(piniaPluginPersistedstate));
    app.use(router);
    app.use(Toast, toastOptions);
    app.mount("#app");

    installGlobalErrorHandler();
  })();
}
