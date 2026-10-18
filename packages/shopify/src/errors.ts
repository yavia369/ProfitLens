export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "throttled" | "server" | "graphql" | "user" | "network" | "config",
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ShopifyError";
  }

  get retryable(): boolean {
    return this.kind === "throttled" || this.kind === "server" || this.kind === "network";
  }
}
