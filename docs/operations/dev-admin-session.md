# Development admin session troubleshooting

## Symptom

The administrator password was accepted at `/admin`, but the development library did not show administrator controls after the redirect.

## Cause

The credentials sign-in completed and set the NextAuth session cookie, but the client-side navigation could retain the previous unauthenticated session state while the development app was running.

## Fix

The successful sign-in path now performs a full browser navigation to `/`. This forces the server and `SessionProvider` to read the new session cookie before the library renders, so administrator controls appear reliably.

## Verification

1. Open `http://100.75.180.84:3001/admin`.
2. Sign in with the development administrator password.
3. Confirm the library reloads and shows upload, organize, scan, and administrator-only visibility controls.

