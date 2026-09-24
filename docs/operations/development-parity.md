# Development parity

The development server uses the same local-storage provider, catalog format,
profile routes, upload limits, and production build command as production. Its
data remains isolated:

- Catalog: `/home/mediaspacedev/media-dev-data`
- Media files: `/home/mediaspacedev/media-dev-storage`
- Production sources: `/home/mediaspacedev/deployments/mediaspace/shared/data`
  and `/home/mediaspacedev/media-storage`

Development has separate session and administrator secrets in `.env.local`.
Never copy production environment files or credentials into the development
checkout.

Preview the production dataset:

```bash
npm run dev:sync-production-data
```

Refresh development after production media or profile changes:

```bash
npm run dev:sync-production-data -- --apply
```

The command backs up existing development catalog files before replacing them,
copies local media into the separate development storage directory, and never
writes to production.
