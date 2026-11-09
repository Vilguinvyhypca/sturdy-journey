import { validateAdminOrigin } from "@/lib/admin-origin";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { readMedia } from "@/lib/db";
import { mediaProfileId } from "@/lib/profile-types";
import { ProfileInputError, readProfiles, saveProfile } from "@/lib/profiles";
import { JsonRequestError, readJsonObject } from "@/lib/request-json";
import { recordAdminChange, recordApplicationFailure } from "@/lib/operational-logging";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function access() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return Response.json({ error: "Sign in as the administrator." }, { status: 401, headers });
  if (usesDatabase || !usesLocalStorage) return Response.json({ error: "Profiles require the local Ubuntu catalog and storage." }, { status: 503, headers });
}

export async function GET() {
  const denied = await access();
  if (denied) return denied;
  return Response.json({ profiles: await readProfiles() }, { headers });
}

async function write(request: Request, update: boolean) {
  const denied = await access();
  if (denied) return denied;
  const originDenied = validateAdminOrigin(request);
  if (originDenied) return originDenied;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    if (!(error instanceof JsonRequestError)) throw error;
    return Response.json({ error: error.message }, { status: error.status, headers });
  }
  if (update && (typeof body.id !== "string" || !body.id)) return Response.json({ error: "Choose a profile." }, { status: 400, headers });
  try {
    if (body.avatarMediaId) {
      const photo = (await readMedia()).find((item) => item.id === body.avatarMediaId);
      if (!update || !photo || photo.type !== "photo" || photo.visibility !== "public" || mediaProfileId(photo) !== body.id || !photo.id.startsWith("local:")) throw new ProfileInputError("Choose a public local photo belonging to this profile.");
    }
    const profile = await saveProfile(body, update ? body.id as string : undefined);
    await recordAdminChange(update ? "profile.updated" : "profile.created", "profile", profile.id, {
      changedFields: ["name", "slug", "bio", "handle", "avatarMediaId", "socialLinks"].filter((field) => field in body),
    });
    return Response.json({ profile }, { status: update ? 200 : 201, headers });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "CATALOG_BUSY") {
      await recordApplicationFailure({ route: "/api/profiles", operation: "catalog_busy", error });
      return Response.json({ error: "The catalog is busy with another update. Please retry shortly." }, { status: 503, headers: { ...headers, "Retry-After": "10" } });
    }
    if (error instanceof ProfileInputError) return Response.json({ error: error.message }, { status: 400, headers });
    throw error;
  }
}

async function writeWithFailureLog(request: Request, update: boolean) {
  try { return await write(request, update); }
  catch (error) {
    await recordApplicationFailure({ route: "/api/profiles", operation: update ? "update_profile" : "create_profile", error });
    throw error;
  }
}

export async function POST(request: Request) { return writeWithFailureLog(request, false); }
export async function PATCH(request: Request) { return writeWithFailureLog(request, true); }
