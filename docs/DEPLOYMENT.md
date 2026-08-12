# Deployment

## Container deployment

1. Copy `.env.example` values into the platform secret manager and replace every placeholder.
2. Provision MongoDB as a replica set and Redis with persistence appropriate to the environment.
3. Build the API image and client static assets with `docker compose build`.
4. Start MongoDB/Redis, initialize the local replica set once, then start `server`, `worker` and `client`.
5. Run `npm run seed` only in an explicit demo environment.
6. Check `/health` for liveness and `/ready` for dependency readiness.

For production, terminate TLS at a reverse proxy, restrict `CLIENT_ORIGIN`, set `TRUST_PROXY=true` only behind that trusted proxy, mount no public upload directory, and replace local proof storage with private S3-compatible object storage.

## Managed platform shape

Deploy `server` and `worker` from the same image with different commands. Serve `client/dist` from a static host/CDN. Configure a WebSocket-capable load balancer. Multiple API instances require the Socket.IO Redis adapter. Apply MongoDB IP/network restrictions and Redis TLS/password configuration supplied by the provider URL.

## Rollback

Application releases are backward-compatible at the current schema stage. Roll back the server/client image together; leave the worker on the matching version. Avoid destructive schema migrations. Export/backup the database before future migrations.

