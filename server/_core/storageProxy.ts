import type { Express, Request } from "express";
import { ENV } from "./env";
import { validateSignedStorageUrl, validateStorageObjectKey } from "../../lib/storage-proxy-logic";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*splat", async (req: Request<{ splat?: string[] }>, res) => {
    const rawSplat = req.params.splat;
    const key = Array.isArray(rawSplat) ? rawSplat.join("/") : rawSplat;
    if (!validateStorageObjectKey(key)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      if (forgeUrl.protocol !== "https:" && forgeUrl.hostname !== "localhost" && forgeUrl.hostname !== "127.0.0.1") {
        res.status(500).send("Storage backend URL must use HTTPS");
        return;
      }
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: \`Bearer \${ENV.forgeApiKey}\` },
        redirect: "error",
      });

      if (!forgeResp.ok) {
        console.error(\`[StorageProxy] forge error: \${forgeResp.status}\`);
        res.status(502).send("Storage backend error");
        return;
      }

      const payload = (await forgeResp.json()) as { url?: unknown };
      if (!validateSignedStorageUrl(payload.url)) {
        res.status(502).send("Invalid signed storage URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, payload.url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err instanceof Error ? err.message : "unknown error");
      res.status(502).send("Storage proxy error");
    }
  });
}
