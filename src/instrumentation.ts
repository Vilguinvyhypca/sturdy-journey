import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordFailure } = await import("./lib/operation-log.cjs");
    await recordFailure("request.error", error, { route: context.routePath, method: request.method });
  }
};
