import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/LandingView.vue"),
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("../views/ProfileView.vue"),
  },
  {
    path: "/lookup",
    name: "Lookup",
    component: () => import("../views/ReverseResolver.vue"),
  },
  {
    path: "/whois/:name",
    name: "Whois",
    component: () => import("../views/WhoProfileView.vue"),
    props: true,
  },
  {
    path: "/preview/:encoded?",
    name: "PreviewEncoded",
    component: () => import("../views/PreviewView.vue"),
  },
];

export default createRouter({
  history: createWebHashHistory(),
  routes,
});
