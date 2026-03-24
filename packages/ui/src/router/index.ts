import { createRouter, createWebHashHistory } from "vue-router";
import { lazyLoad, isChunkLoadError } from "@/lib/lazyLoad";
import { formatErrorMessage } from "@/lib/errorHandling";

const routes = [
  {
    path: "/",
    name: "Home",
    component: lazyLoad(() => import("../views/LandingView.vue")),
  },
  {
    path: "/profile",
    name: "Profile",
    component: lazyLoad(() => import("../views/ProfileView.vue")),
  },
  {
    path: "/lookup",
    name: "Lookup",
    component: lazyLoad(() => import("../views/ReverseResolver.vue")),
  },
  {
    path: "/whois/:name",
    name: "Whois",
    component: lazyLoad(() => import("../views/WhoProfileView.vue")),
    props: true,
  },
  {
    path: "/upload",
    name: "Upload",
    component: lazyLoad(() => import("../views/PreviewView.vue")),
  },
  {
    path: "/preview/:encoded?",
    name: "PreviewEncoded",
    component: lazyLoad(() => import("../views/PreviewView.vue")),
  },
  {
    path: "/docs",
    component: lazyLoad(() => import("../views/docs/DocsLayout.vue")),
    children: [
      { path: "", redirect: "/docs/introduction" },
      {
        path: "error",
        name: "DocsError",
        component: () => import("../views/docs/DocsErrorPage.vue"),
      },
      {
        path: "introduction",
        name: "DocsIntroduction",
        component: lazyLoad(() => import("../views/docs/getting-started/IntroductionPage.vue")),
      },
      {
        path: "why-dotns",
        name: "DocsWhyDotns",
        component: lazyLoad(() => import("../views/docs/getting-started/WhyDotnsPage.vue")),
      },
      {
        path: "getting-started",
        name: "DocsGettingStarted",
        component: lazyLoad(() => import("../views/docs/getting-started/GettingStartedPage.vue")),
      },
      {
        path: "protocol/architecture",
        name: "DocsArchitecture",
        component: lazyLoad(() => import("../views/docs/protocol/ArchitecturePage.vue")),
      },
      {
        path: "protocol/naming",
        name: "DocsNaming",
        component: lazyLoad(() => import("../views/docs/protocol/NamingPage.vue")),
      },
      {
        path: "protocol/registration",
        name: "DocsRegistration",
        component: lazyLoad(() => import("../views/docs/protocol/RegistrationPage.vue")),
      },
      {
        path: "protocol/resolution",
        name: "DocsResolution",
        component: lazyLoad(() => import("../views/docs/protocol/ResolutionPage.vue")),
      },
      {
        path: "protocol/reverse-resolution",
        name: "DocsReverseResolution",
        component: lazyLoad(() => import("../views/docs/protocol/ReverseResolutionPage.vue")),
      },
      {
        path: "protocol/content",
        name: "DocsContent",
        component: lazyLoad(() => import("../views/docs/protocol/ContentPage.vue")),
      },
      {
        path: "protocol/proof-of-personhood",
        name: "DocsPoP",
        component: lazyLoad(() => import("../views/docs/protocol/PopPage.vue")),
      },
      {
        path: "protocol/subdomains",
        name: "DocsSubdomains",
        component: lazyLoad(() => import("../views/docs/protocol/SubdomainsPage.vue")),
      },
      {
        path: "protocol/store",
        name: "DocsStore",
        component: lazyLoad(() => import("../views/docs/protocol/StorePage.vue")),
      },
      {
        path: "protocol/transfers",
        name: "DocsTransfers",
        component: lazyLoad(() => import("../views/docs/protocol/TransfersPage.vue")),
      },
      {
        path: "contracts/overview",
        name: "DocsContractsOverview",
        component: lazyLoad(() => import("../views/docs/contracts/OverviewPage.vue")),
      },
      {
        path: "contracts/registry",
        name: "DocsRegistry",
        component: lazyLoad(() => import("../views/docs/contracts/RegistryPage.vue")),
      },
      {
        path: "contracts/registrar",
        name: "DocsRegistrar",
        component: lazyLoad(() => import("../views/docs/contracts/RegistrarPage.vue")),
      },
      {
        path: "contracts/controller",
        name: "DocsController",
        component: lazyLoad(() => import("../views/docs/contracts/ControllerPage.vue")),
      },
      {
        path: "contracts/resolver",
        name: "DocsResolver",
        component: lazyLoad(() => import("../views/docs/contracts/ResolverPage.vue")),
      },
      {
        path: "contracts/reverse-resolver",
        name: "DocsReverseResolver",
        component: lazyLoad(() => import("../views/docs/contracts/ReverseResolverPage.vue")),
      },
      {
        path: "contracts/content-resolver",
        name: "DocsContentResolver",
        component: lazyLoad(() => import("../views/docs/contracts/ContentResolverPage.vue")),
      },
      {
        path: "contracts/pop-rules",
        name: "DocsPopRules",
        component: lazyLoad(() => import("../views/docs/contracts/PopRulesPage.vue")),
      },
      {
        path: "contracts/store",
        name: "DocsStoreContract",
        component: lazyLoad(() => import("../views/docs/contracts/StoreContractPage.vue")),
      },
      {
        path: "dweb/overview",
        name: "DocsDwebOverview",
        component: lazyLoad(() => import("../views/docs/dweb/DwebOverviewPage.vue")),
      },
      {
        path: "dweb/hosting",
        name: "DocsDwebHosting",
        component: lazyLoad(() => import("../views/docs/dweb/HostingPage.vue")),
      },
      {
        path: "dweb/bulletin",
        name: "DocsBulletin",
        component: lazyLoad(() => import("../views/docs/dweb/BulletinPage.vue")),
      },
      {
        path: "dweb/gateway",
        name: "DocsGateway",
        component: lazyLoad(() => import("../views/docs/dweb/GatewayPage.vue")),
      },
      {
        path: "dweb/deploy-workflow",
        name: "DocsDeployWorkflow",
        component: lazyLoad(() => import("../views/docs/dweb/DeployWorkflowPage.vue")),
      },
      {
        path: "tools/cli",
        name: "DocsCli",
        component: lazyLoad(() => import("../views/docs/tools/CliPage.vue")),
      },
      {
        path: "tools/ui",
        name: "DocsUi",
        component: lazyLoad(() => import("../views/docs/tools/UiPage.vue")),
      },
      {
        path: "use-cases/personal-identity",
        name: "DocsPersonalIdentity",
        component: lazyLoad(() => import("../views/docs/use-cases/PersonalIdentityPage.vue")),
      },
      {
        path: "use-cases/dapp-hosting",
        name: "DocsDappHosting",
        component: lazyLoad(() => import("../views/docs/use-cases/DappHostingPage.vue")),
      },
      {
        path: "use-cases/ci-cd-previews",
        name: "DocsCiCdPreviews",
        component: lazyLoad(() => import("../views/docs/use-cases/CiCdPreviewsPage.vue")),
      },
      {
        path: "use-cases/dao-naming",
        name: "DocsDaoNaming",
        component: lazyLoad(() => import("../views/docs/use-cases/DaoNamingPage.vue")),
      },
      {
        path: "use-cases/portfolio-site",
        name: "DocsPortfolioSite",
        component: lazyLoad(() => import("../views/docs/use-cases/PortfolioSitePage.vue")),
      },
      {
        path: "use-cases/wallet-integration",
        name: "DocsWalletIntegration",
        component: lazyLoad(() => import("../views/docs/use-cases/WalletIntegrationPage.vue")),
      },
      {
        path: "guides/your-first-domain",
        name: "DocsYourFirstDomain",
        component: lazyLoad(() => import("../views/docs/guides/YourFirstDomainGuide.vue")),
      },
      {
        path: "guides/set-up-profile",
        name: "DocsSetUpProfile",
        component: lazyLoad(() => import("../views/docs/guides/ProfileSetupGuide.vue")),
      },
      {
        path: "guides/host-a-website",
        name: "DocsHostAWebsite",
        component: lazyLoad(() => import("../views/docs/guides/HostAWebsiteGuide.vue")),
      },
      {
        path: "guides/deploy-with-ci",
        name: "DocsDeployWithCi",
        component: lazyLoad(() => import("../views/docs/guides/DeployWithCiGuide.vue")),
      },
      {
        path: "guides/create-subdomains",
        name: "DocsCreateSubdomains",
        component: lazyLoad(() => import("../views/docs/guides/SubdomainsGuide.vue")),
      },
      {
        path: ":pathMatch(.*)*",
        name: "DocsNotFound",
        component: () => import("../views/docs/DocsErrorPage.vue"),
        props: () => ({ notFound: true }),
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("../views/NotFoundPage.vue"),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  },
});

router.onError((error, to) => {
  if (error instanceof Error) {
    const message = isChunkLoadError(error)
      ? "The page could not be loaded due to a network error or an app update."
      : formatErrorMessage(error);
    router.replace({
      path: "/docs/error",
      query: { path: to.fullPath, message },
    });
  }
});

export default router;
