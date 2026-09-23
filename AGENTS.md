<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment boundaries

This checkout is development only. Production runs from independent releases in
`/home/mediaspacedev/deployments/mediaspace/releases`, selected by the `current`
symlink. Never build, install dependencies, or edit source inside an existing
production release, and never point the production service at this checkout.

Use `npm run deploy:prod` for production updates and `npm run rollback:prod` for
rollback. These validate a new release before switching production. See
`docs/deployments.md` for the full workflow. Keep development environment files,
catalog, uploads, and session secrets separate from production. Do not copy
production credentials into development. Services belong to `mediaspacedev`'s
user systemd manager.
