export interface DocNavItem {
  title: string;
  path: string;
}

export interface DocNavGroup {
  title: string;
  items: DocNavItem[];
}

export const docsNav: DocNavGroup[] = [
  {
    title: "Introduction",
    items: [
      { title: "What is DotNS", path: "/docs/introduction" },
      { title: "Why DotNS", path: "/docs/why-dotns" },
      { title: "Getting Started", path: "/docs/getting-started" },
    ],
  },
  {
    title: "Protocol",
    items: [
      { title: "Architecture", path: "/docs/protocol/architecture" },
      { title: "The .dot Namespace", path: "/docs/protocol/naming" },
      { title: "Registration", path: "/docs/protocol/registration" },
      { title: "Resolution", path: "/docs/protocol/resolution" },
      { title: "Reverse Resolution", path: "/docs/protocol/reverse-resolution" },
      { title: "Content & Profiles", path: "/docs/protocol/content" },
      { title: "Proof of Personhood", path: "/docs/protocol/proof-of-personhood" },
      { title: "Subdomains", path: "/docs/protocol/subdomains" },
      { title: "On-Chain Storage", path: "/docs/protocol/store" },
      { title: "Transfers", path: "/docs/protocol/transfers" },
    ],
  },
  {
    title: "Contracts",
    items: [
      { title: "Overview", path: "/docs/contracts/overview" },
      { title: "Registry", path: "/docs/contracts/registry" },
      { title: "Registrar", path: "/docs/contracts/registrar" },
      { title: "Controller", path: "/docs/contracts/controller" },
      { title: "Resolver", path: "/docs/contracts/resolver" },
      { title: "Reverse Resolver", path: "/docs/contracts/reverse-resolver" },
      { title: "Content Resolver", path: "/docs/contracts/content-resolver" },
      { title: "PoP Rules", path: "/docs/contracts/pop-rules" },
      { title: "Store", path: "/docs/contracts/store" },
    ],
  },
  {
    title: "Decentralized Web",
    items: [
      { title: "Overview", path: "/docs/dweb/overview" },
      { title: "Host a Website", path: "/docs/dweb/hosting" },
      { title: "Bulletin Chain", path: "/docs/dweb/bulletin" },
      { title: "Gateway", path: "/docs/dweb/gateway" },
      { title: "Deploy Workflow", path: "/docs/dweb/deploy-workflow" },
    ],
  },
  {
    title: "Tools",
    items: [
      { title: "CLI", path: "/docs/tools/cli" },
      { title: "Web UI", path: "/docs/tools/ui" },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "Your First Domain", path: "/docs/guides/your-first-domain" },
      { title: "Set Up Your Profile", path: "/docs/guides/set-up-profile" },
      { title: "Host a Website", path: "/docs/guides/host-a-website" },
      { title: "Deploy with CI", path: "/docs/guides/deploy-with-ci" },
      { title: "Create Subdomains", path: "/docs/guides/create-subdomains" },
    ],
  },
  {
    title: "Use Cases",
    items: [
      { title: "Personal Identity", path: "/docs/use-cases/personal-identity" },
      { title: "dApp Hosting", path: "/docs/use-cases/dapp-hosting" },
      { title: "CI/CD Previews", path: "/docs/use-cases/ci-cd-previews" },
      { title: "DAO Naming", path: "/docs/use-cases/dao-naming" },
      { title: "Portfolio Site", path: "/docs/use-cases/portfolio-site" },
      { title: "Wallet & DeFi", path: "/docs/use-cases/wallet-integration" },
    ],
  },
];
