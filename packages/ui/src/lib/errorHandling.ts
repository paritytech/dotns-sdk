import { useToast } from "vue-toastification";

interface HttpErrorInfo {
  status: number;
  label: string;
  message: string;
}

const HTTP_ERRORS: HttpErrorInfo[] = [
  { status: 400, label: "Bad Request", message: "The request was invalid." },
  { status: 401, label: "Unauthorized", message: "Authentication is required." },
  {
    status: 403,
    label: "Forbidden",
    message: "You don't have permission to access this resource.",
  },
  { status: 404, label: "Not Found", message: "The requested resource could not be found." },
  { status: 408, label: "Timeout", message: "The request timed out. Please try again." },
  { status: 429, label: "Rate Limited", message: "Too many requests. Please wait and try again." },
  { status: 500, label: "Server Error", message: "The server encountered an internal error." },
  {
    status: 502,
    label: "Bad Gateway",
    message: "The server received an invalid response from upstream.",
  },
  { status: 503, label: "Service Unavailable", message: "The service is temporarily unavailable." },
  { status: 504, label: "Gateway Timeout", message: "The server did not respond in time." },
];

function getHttpErrorInfo(status: number): HttpErrorInfo | undefined {
  return HTTP_ERRORS.find((e) => e.status === status);
}

function extractStatusFromError(error: Error): number | null {
  const statusMatch = error.message.match(/status\s*(?:code\s*)?(\d{3})/i);
  if (statusMatch?.[1]) return parseInt(statusMatch[1], 10);

  const responseMatch = error.message.match(
    /(\d{3})\s*(?:error|bad|not|unauthorized|forbidden|timeout|unavailable|gateway)/i,
  );
  if (responseMatch?.[1]) return parseInt(responseMatch[1], 10);

  return null;
}

export function formatErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? error : "An unexpected error occurred.";
  }

  const status = extractStatusFromError(error);
  if (status) {
    const info = getHttpErrorInfo(status);
    if (info) return `${info.label} (${status}): ${info.message}`;
    return `HTTP ${status}: ${error.message}`;
  }

  if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
    return "Network error: Unable to reach the server. Check your connection.";
  }

  if (error.message.includes("CORS")) {
    return "Network error: The request was blocked by the server.";
  }

  if (error.message.includes("timeout") || error.message.includes("Timeout")) {
    return "The request timed out. Please try again.";
  }

  if (error.message.includes("User rejected") || error.message.includes("user rejected")) {
    return "Action cancelled by user.";
  }

  if (error.message.includes("reverted") || error.message.includes("Reverted")) {
    return "Transaction reverted: The contract rejected the operation.";
  }

  return error.message || "An unexpected error occurred.";
}

let globalHandlerInstalled = false;

export function installGlobalErrorHandler(): void {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const error = event.reason;
    if (
      error instanceof Error &&
      error.message.includes("Failed to fetch dynamically imported module")
    ) {
      return;
    }

    const message = formatErrorMessage(error);
    const toast = useToast();
    toast.error(message, { timeout: 6000 });
  });
}
