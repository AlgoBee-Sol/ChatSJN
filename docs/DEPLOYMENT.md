# Cloudflare deployment considerations

No Cloudflare resources have been created and nothing has been published. This phase implements and verifies local software. Do not treat the local launcher's filesystem or automatic MongoDB as production infrastructure.

## Preserve MERN for the first hosted version

The smallest migration that preserves the requested stack is a static React frontend on Workers Static Assets and the Node/Express API in a Node-compatible origin or Cloudflare Container, using MongoDB Atlas (or another managed MongoDB). A same-origin edge route should forward `/api/*` to the API so cookie/CSRF rules remain unchanged. Uploaded originals need durable object storage; replace the local filesystem adapter with R2 before ephemeral/container hosting. Source metadata and vectors remain in MongoDB.

Cloudflare supports static frontend assets and container backends, but account availability, runtime behavior and deployment limits must be checked when access is supplied. This is an architecture recommendation, not a tested deployment template. References: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Cloudflare Containers](https://developers.cloudflare.com/containers/).

An all-Workers alternative would require deliberate changes: replace native Argon2 dependencies and Node PDF extraction, implement suitable persistence/upload adapters, and test any MongoDB integration. D1 is a relational alternative and would replace Mongoose rather than simply serve as its connection string. [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) and [D1](https://developers.cloudflare.com/d1/) describe these platform boundaries. We have not silently replaced the requested MERN stack with D1.

## Hosted beta preparation

- Choose the account, region/retention requirements, domain and HTTPS application origin.
- Move MongoDB to a managed authenticated service with backups and restoration testing.
- Replace local upload storage with private R2 objects and add lifecycle/retention policy.
- Provision server-side model secrets; confirm model access, rate limits and costs using real evaluations.
- Provide a persistent production `BETTER_AUTH_SECRET` and HTTPS `APP_ORIGIN`; route API and web under the same site.
- Configure the production Google OAuth Web client, exact HTTPS callback URL and server-only Google credentials; see [authentication](AUTHENTICATION.md).
- Bind the API to the host/container interface as needed; the local version intentionally binds only to 127.0.0.1.
- Replace process-local rate limits, startup-wide ingestion recovery and single-instance leases before scaling beyond one API process. Add shared job coordination, durable audit exports and upload resource isolation.
- Configure exact trusted proxy hops; never blindly enable Express `trust proxy`.
- Decide registration gating, account verification/recovery, deletion/retention and reviewer responsibilities for the hosted audience.
- Run the test suite and a real-provider religious evaluation against authorized approved sources, including Urdu and Roman Urdu.
- Keep search indexing off for private beta. Add the final domain and public indexing only after approving the public landing content. Do not index conversations or admin pages.

CLI configuration will be created using the current Cloudflare CLI workflow when account access and hosting architecture are confirmed. No account identifiers, deployment tokens or guessed resource IDs are committed now.
