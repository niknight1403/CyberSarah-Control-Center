# Custom AI Studio Workspace Service

This service is the **execution boundary** for Custom AI Studio. It accepts requests from the mobile client, clones GitHub repositories into a Docker volume, offers selected file and Git operations, starts a Vite-compatible development command, proxies the resulting preview, and produces reviewable AI patch proposals. It deliberately does not expose a shell endpoint or persist user-supplied GitHub and provider credentials.

## Deployment on a VPS

Copy the `workspace-service` directory to the server, create `.env` from `config.example`, set a long unique `SERVICE_ACCESS_TOKEN`, and set `PREVIEW_PUBLIC_BASE_URL` to the service's public **HTTPS** origin. Start the service with the following command.

```bash
cp config.example .env
docker compose up -d --build
```

Place the service behind an HTTPS reverse proxy such as Caddy or Nginx, forwarding the public host to port `8787`. The public URL must preserve WebSocket upgrades because Vite hot reload uses them. Configure the same public origin in `PREVIEW_PUBLIC_BASE_URL`; configure the mobile web app's origin in `ALLOWED_ORIGIN` when using the web build.

## Mobile service contract

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | Returns service readiness and version. |
| `POST /api/v1/repositories/attach` | Clones or updates an HTTPS GitHub repository and enumerates workspace files. |
| `GET` / `PUT /api/v1/workspaces/:id/file` | Reads or writes an in-workspace source file after path validation. |
| `GET / POST /api/v1/workspaces/:id/git/*` | Returns status, creates a commit, and pushes the current branch. |
| `POST /api/v1/workspaces/:id/runtime/start` | Starts `npm run dev -- --host 0.0.0.0` for the attached workspace. |
| `GET /api/v1/workspaces/:id/runtime` | Returns output and the proxied preview URL. |
| `POST /api/v1/agent/proposals` | Produces a reviewable unified-diff proposal without mutating files. |

Every endpoint expects `Authorization: Bearer <SERVICE_ACCESS_TOKEN>`. Enter this value in the mobile app as **Service-Zugriffstoken**. Git operations use the token in `X-GitHub-Token` only for the current request. Provider requests use `X-AI-Provider` and `X-AI-Provider-Key` only for the current request. Avoid proxy logs that record request headers.

## GitHub token scope

Use a **fine-grained** GitHub personal access token restricted to the needed repository. For read-only inspection, grant repository `Contents: read`. To save and push code changes, grant `Contents: write`; only add additional permissions, such as workflows or pull requests, when the workflow needs them. GitHub recommends fine-grained tokens where possible, supports bearer authentication for its REST API, and requires serialized Content API writes to avoid conflicts. [1] [2] [3]

## Security boundary

The service accepts only `https://github.com/owner/repository(.git)` repository URLs, validates every workspace identifier, confines file operations to the designated workspace directory, and does not include a generic shell route. It is still a privileged developer service: restrict the server firewall, use HTTPS, keep `SERVICE_ACCESS_TOKEN` secret, and use a dedicated low-privilege GitHub token per repository.

## References

[1]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens "GitHub Docs: Managing personal access tokens"
[2]: https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api "GitHub Docs: Authenticating to the REST API"
[3]: https://docs.github.com/rest/repos/contents "GitHub Docs: Repository contents API"
