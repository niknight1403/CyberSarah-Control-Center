import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
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

// Only server-side agents (e.g. InfluencerAutoPostAgent) currently mint uploads,
// and they only ever write generated social-media images. Keep the allowlist and
// size cap aligned with that real usage so this route cannot be turned into a
// generic, unauthenticated write-anything-anywhere storage sink.
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

// Simple sliding-window limiter for the upload-URL bootstrap route. There is no
// app-level auth on this API (single-operator, private-deployment app), so this
// bounds how many signed write capabilities a single caller can mint per window.
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

// Every presigned upload URL we mint is recorded here (objectPath -> expiry).
// /storage/uploads/confirm may only act on an objectPath that was actually
// issued by /storage/uploads/request-url, and only once. This prevents an
// unauthenticated caller from invoking confirm with an arbitrary/guessed
// object path — including paths belonging to unrelated private objects —
// to trigger a deletion side effect on something it never uploaded.
const OBJECT_PATH_PATTERN = /^\/objects\/uploads\/[0-9a-f-]{36}$/;
const PENDING_UPLOAD_TTL_MS = 30 * 60 * 1000; // presigned URL TTL (15 min) + grace period
const pendingUploads = new Map<string, number>();

function registerPendingUpload(objectPath: string): void {
  pendingUploads.set(objectPath, Date.now() + PENDING_UPLOAD_TTL_MS);
}

function consumePendingUpload(objectPath: string): boolean {
  const expiresAt = pendingUploads.get(objectPath);
  pendingUploads.delete(objectPath);
  return expiresAt !== undefined && expiresAt > Date.now();
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", uploadRateLimiter, async (req: Request, res: Response) => {
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
router.post("/storage/uploads/confirm", async (req: Request, res: Response) => {
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

  if (!consumePendingUpload(objectPath)) {
    res.status(403).json({ error: "No pending upload for this object path" });
    return;
  }

  try {
    const { contentType, size } = await objectStorageService.enforceUploadCompliance(objectPath, {
      allowedContentTypes: ALLOWED_UPLOAD_CONTENT_TYPES,
      maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    });
    res.json(ConfirmUploadResponse.parse({ ok: true, contentType, size }));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof UploadNonCompliantError) {
      req.log.warn(
        { objectPath, contentType: error.contentType, size: error.size },
        "Upload verstößt gegen Richtlinie, Objekt gelöscht"
      );
      res.status(422).json({ error: "Upload verstößt gegen Größen-/Dateityp-Richtlinie" });
      return;
    }
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
