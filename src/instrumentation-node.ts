import { recordRuntimeFailure } from "@/lib/operational-logging";

process.on("uncaughtExceptionMonitor", (error, origin) => {
  recordRuntimeFailure(error, origin === "unhandledRejection" ? "unhandled_rejection" : "uncaught_exception");
});
