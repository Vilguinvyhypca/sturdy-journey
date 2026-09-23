import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { join } from "node:path";

const expected = {
  MEDIA_DATA_DIR: join(homedir(), "media-dev-data"),
  MEDIA_STORAGE_ROOT: join(homedir(), "media-dev-storage"),
};
for (const [key, path] of Object.entries(expected)) {
  if (!process.env[key] || realpathSync(process.env[key]) !== realpathSync(path)) {
    throw new Error(`Development requires ${key}=${path}; refusing to use another environment's data`);
  }
}
for (const key of ["DATABASE_URL", "DATABASE_URL_DATABASE_URL", "POSTGRES_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "PRIVATE_BLOB_READ_WRITE_TOKEN", "PRIVATE_BLOB_STORE_ID", "MUX_TOKEN_ID", "MUX_TOKEN_SECRET"]) {
  if (process.env[key]) throw new Error(`Development is configured for local storage; remove ${key}`);
}
if (process.env.NEXTAUTH_URL !== "http://100.75.180.84:3001" || process.env.MEDIA_UPLOAD_PROVIDER !== "local") {
  throw new Error("Development must use its own URL and local storage provider");
}
console.log("Development configuration isolation checks passed");
