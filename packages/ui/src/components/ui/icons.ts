import { h, type FunctionalComponent, type SVGAttributes } from "vue";

type IconProps = SVGAttributes & {
  class?: string;
};

const createIcon = (
  path: string | string[],
  viewBox = "0 0 24 24",
): FunctionalComponent<IconProps> => {
  return (props) =>
    h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...props,
      },
      Array.isArray(path) ? path.map((p) => h("path", { d: p })) : h("path", { d: path }),
    );
};

// Loading spinner icon
export const Spinner: FunctionalComponent<IconProps> = (props) =>
  h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      ...props,
    },
    [
      h("circle", {
        class: "opacity-25",
        cx: "12",
        cy: "12",
        r: "10",
        stroke: "currentColor",
        strokeWidth: "4",
      }),
      h("path", {
        class: "opacity-75",
        fill: "currentColor",
        d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z",
      }),
    ],
  );

// Check / checkmark icon
export const Check = createIcon("M5 13l4 4L19 7");

// X / close icon
export const X = createIcon("M6 18L18 6M6 6l12 12");

// Info / information icon
export const Info = createIcon("M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z");

// Menu / hamburger icon
export const Menu = createIcon(["M4 6h16", "M4 12h16", "M4 18h16"]);

// Search / magnifying glass icon
export const Search = createIcon("M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z");

// Check circle (with circle background)
export const CheckCircle = createIcon("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z");

// Alert / warning triangle
export const AlertTriangle = createIcon(
  "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
);

// External link icon
export const ExternalLink = createIcon([
  "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6",
  "M15 3h6v6",
  "M10 14L21 3",
]);

// ChevronDown icon
export const ChevronDown = createIcon("M19 9l-7 7-7-7");

// ChevronUp icon
export const ChevronUp = createIcon("M5 15l7-7 7 7");

// Copy icon
export const Copy = createIcon([
  "M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 2.57A2 2 0 0014.685 2H10a2 2 0 00-2 2z",
  "M16 18v2a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2",
]);

// Clock icon
export const Clock = createIcon("M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z");

// List of all icons for easy import
export const Icons = {
  Spinner,
  Check,
  X,
  Info,
  Menu,
  Search,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Clock,
};

export type IconName = keyof typeof Icons;
