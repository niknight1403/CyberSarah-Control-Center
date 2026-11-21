import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { isValidStorageUploadKey } from "../lib/storageUploadAuth";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  ConfirmUploadBody,
  ConfirmUploadResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError, UploadNonCompliantError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Upload capabilities are privileged. Require a dedicated server-to-server key;
// do not reuse the dashboard/browser key or rely on the private deployment boundary.
function requireStorageUploadAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env["REVENUE_OS_STORAGE_API_KEY"] ?? "";
  const supplied = req.get("X-Revenue-Storage-Key") ?? "";
  if (!expected) {
    res.status(503).json({ error: "Storage upload authentication is not configured" });
    return;
  }
  if (!isValidStorageUploadKey(expected, supplied)) {
    res.status(403).json({ error: "Storage upload access denied" });
    return;
  }
  next();
}

// Only server-side agents currently mint uploads. Keep the allowlist and size cap
// aligned with the actual generated-image workflow; video upload is not enabled.
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

// Simple sliding-window limiter for authenticated upload-URL requests.
const UPLOAD_RATE_LIMIT_MAX = 20;
const UPLOAD_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const uploadRequestLog = new Map<string, number[]>();

function isUploadRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - UPLOAD_RATE_LIMIT_WINDOW_MS;
  const timestamps = (uploadRequestLog.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= UPLOAD_RATE_LIMIT_MAX) {
    uploadRequestLog.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  uploadRequestLog.set(key, timestamps);
  return false;
}

function uploadRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? "unknown";
  if (isUploadRateLimited(key)) {
    res.status(429).json({ error: "Zu viele Upload-Anfragen, bitte später erneut versuchen" });
    return;
  }
  next();
}

// Keep upload intents process-local until a durable, owner-bound store is available.
// Confirmation uses a short claim so concurrent requests cannot both finalize the
// same intent. Transient GCS errors release the claim for a safe retry.
const OBJECT_PATH_PATTERN = /^\/objects\/uploads\/[0-9a-f-]{36}$/;
const PENDING_UPLOAD_TTL_MS = 30 * 60 * 1000; // presigned URL TTL (15 min) + grace period
type PendingUploadState = { expiresAt: number; status: "pending" | "confirming" };
const pendingUploads = new Map<string, PendingUploadState>();

function registerPendingUpload(objectPath: string): void {
  pendingUploads.set(objectPath, { expiresAt: Date.now() + PENDING_UPLOAD_TTL_MS, status: "pending" });
}

function beginPendingUploadConfirmation(objectPath: string): boolean {
  const intent = pendingUploads.get(objectPath);
  if (!intent || intent.expiresAt <= Date.now() || intent.status !== "pending") {
    if (intent && intent.expiresAt <= Date.now()) pendingUploads.delete(objectPath);
    return false;
  }
  intent.status = "confirming";
  return true;
}

function completePendingUploadConfirmation(objectPath: string): void {
  pendingUploads.delete(objectPath);
}

function releasePendingUploadConfirmation(objectPath: string): void {
  const intent = pendingUploads.get(objectPath);
  if (!intent) return;
  if (intent.expiresAt <= Date.now()) {
    pendingUploads.delete(objectPath);
    return;
  }
  if (intent.status === "confirming") intent.status = "pending";
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireStorageUploadAuth, uploadRateLimiter, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) {
    res.status(415).json({ error: "Nicht unterstützter Dateityp" });
    return;
  }

  if (size > MAX_UPLOAD_SIZE_BYTES) {
    res.status(413).json({ error: "Datei zu groß" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    registerPendingUpload(objectPath);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads/confirm
 *
 * Must be called after the client PUTs the file to the presigned URL. The PUT
 * itself goes directly to GCS and is never observed by this server, so the
 * content-type/size checked at request-url time only reflects what the caller
 * *claimed* it would upload — not what was actually written. This route
 * re-reads the object's real GCS metadata and deletes it immediately if it
 * violates the same allowlist/size cap, closing that gap.
 */
router.post("/storage/uploads/confirm", requireStorageUploadAuth, async (req: Request, res: Response) => {
  const parsed = ConfirmUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { objectPath } = parsed.data;

  if (!OBJECT_PATH_PATTERN.test(objectPath)) {
    res.status(400).json({ error: "Invalid object path" });
    return;
  }

  if (!beginPendingUploadConfirmation(objectPath)) {
    res.status(403).json({ error: "No pending upload for this object path" });
    return;
  }

  try {
    const { contentType, size } = await objectStorageService.enforceUploadCompliance(objectPath, {
      allowedContentTypes: ALLOWED_UPLOAD_CONTENT_TYPES,
      maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    });
    completePendingUploadConfirmation(objectPath);
    res.json(ConfirmUploadResponse.parse({ ok: true, contentType, size }));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      releasePendingUploadConfirmation(objectPath);
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof UploadNonCompliantError) {
      completePendingUploadConfirmation(objectPath);
      req.log.warn(
        { objectPath, contentType: error.contentType, size: error.size },
        "Upload verstößt gegen Richtlinie, Objekt gelöscht"
      );
      res.status(422).json({ error: "Upload verstößt gegen Größen-/Dateityp-Richtlinie" });
      return;
    }
    releasePendingUploadConfirmation(objectPath);
    req.log.error({ err: error }, "Error confirming upload");
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * This app has no app-level user/session model (single-operator, private
 * deployment), so access is decided purely from each object's ACL policy:
 * only objects explicitly marked "public" (e.g. via trySetObjectEntityAclPolicy)
 * are servable here. Objects with no ACL policy or an explicit "private"
 * policy are rejected — knowing the object path is never sufficient on its own.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
