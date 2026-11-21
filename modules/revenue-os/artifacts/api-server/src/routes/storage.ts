import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { isValidStorageUploadKey } from "../lib/storageUploadAuth";
import { verifiziereToken } from "../lib/adminAccount";
import { matchesDeclaredUploadMetadata, resolveUploadTenantId } from "../lib/storageUploadIntentLogic";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  ConfirmUploadBody,
  ConfirmUploadResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError, UploadNonCompliantError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { db, storageUploadIntentsTable, tenantMembershipsTable } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Upload capabilities are privileged. Accept either a verified Revenue OS session
// or a dedicated server-to-server key; never trust a caller-supplied user/tenant ID.
async function requireStorageUploadAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const expected = process.env["REVENUE_OS_STORAGE_API_KEY"] ?? "";
  const supplied = req.get("X-Revenue-Storage-Key") ?? "";
  if (expected && isValidStorageUploadKey(expected, supplied)) {
    res.locals.storageUploadPrincipal = STORAGE_UPLOAD_PRINCIPAL;
    res.locals.storageUploadOwnerUserId = null;
    res.locals.storageUploadTenantId = null;
    next();
    return;
  }

  const authorization = req.headers.authorization ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const session = bearer ? verifiziereToken(bearer) : null;
  if (session && Number.isSafeInteger(session.userId) && session.userId > 0) {
    if (!db) {
      res.status(503).json({ error: "Upload-Auftragsdatenbank nicht verfügbar" });
      return;
    }
    try {
      const memberships = await db.select({ tenantId: tenantMembershipsTable.tenantId })
        .from(tenantMembershipsTable)
        .where(eq(tenantMembershipsTable.userId, session.userId));
      const tenantResolution = resolveUploadTenantId(
        memberships.map((membership) => membership.tenantId),
        req.get("X-Tenant-ID"),
      );
      if (!tenantResolution.ok) {
        res.status(tenantResolution.reason === "selection_required" ? 400 : 403).json({
          error: tenantResolution.reason === "selection_required"
            ? "X-Tenant-ID ist bei mehreren Tenant-Mitgliedschaften erforderlich"
            : "Keine Berechtigung für diesen Tenant",
        });
        return;
      }
      const tenantId = tenantResolution.tenantId;
      res.locals.storageUploadPrincipal = "user:" + session.userId;
      res.locals.storageUploadOwnerUserId = session.userId;
      res.locals.storageUploadTenantId = tenantId;
      next();
      return;
    } catch (error) {
      req.log.error({ err: error }, "Tenant-Mitgliedschaften konnten nicht geprüft werden");
      res.status(503).json({ error: "Tenant-Berechtigung derzeit nicht prüfbar" });
      return;
    }
  }

  res.status(expected ? 403 : 503).json({
    error: expected ? "Storage upload access denied" : "Storage upload authentication is not configured",
  });
}

// Keep the allowlist and size cap aligned with the supported image workflow;
// video upload is intentionally disabled until its separate delivery path is verified.
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

// Upload intent state is durable in the Revenue OS PostgreSQL database.
// This service identity is deliberately not represented as an end-user or tenant.
const STORAGE_UPLOAD_PRINCIPAL = "revenue-os-storage-service";
const getPrincipal = (res: Response): string => String(res.locals.storageUploadPrincipal ?? STORAGE_UPLOAD_PRINCIPAL);
const getOwnerUserId = (res: Response): number | null => Number.isSafeInteger(res.locals.storageUploadOwnerUserId) ? res.locals.storageUploadOwnerUserId : null;
const getTenantId = (res: Response): number | null => Number.isSafeInteger(res.locals.storageUploadTenantId) ? res.locals.storageUploadTenantId : null;
const OBJECT_PATH_PATTERN = /^\/objects\/uploads\/[0-9a-f-]{36}$/;
const PENDING_UPLOAD_TTL_MS = 30 * 60 * 1000;

function requireUploadDatabase(res: Response): boolean {
  if (db) return true;
  res.status(503).json({ error: "Upload-Auftragsdatenbank nicht verfügbar" });
  return false;
}

async function registerPendingUpload(
  objectPath: string,
  declaredContentType: string,
  declaredSize: number,
  principal: string,
  ownerUserId: number | null,
  tenantId: number | null,
): Promise<void> {
  if (!db) throw new Error("Upload intent database unavailable");
  const now = new Date();
  await db.insert(storageUploadIntentsTable).values({
    objectPath,
    principal,
    ownerUserId,
    tenantId,
    declaredContentType,
    declaredSize,
    status: "pending",
    expiresAt: new Date(now.getTime() + PENDING_UPLOAD_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });
}

async function beginPendingUploadConfirmation(objectPath: string, principal: string, ownerUserId: number | null, tenantId: number | null): Promise<boolean> {
  if (!db) throw new Error("Upload intent database unavailable");
  const [claimed] = await db.update(storageUploadIntentsTable)
    .set({ status: "confirming", updatedAt: new Date() })
    .where(and(
      eq(storageUploadIntentsTable.objectPath, objectPath),
      eq(storageUploadIntentsTable.principal, principal),
      ownerUserId === null ? isNull(storageUploadIntentsTable.ownerUserId) : eq(storageUploadIntentsTable.ownerUserId, ownerUserId),
      tenantId === null ? isNull(storageUploadIntentsTable.tenantId) : eq(storageUploadIntentsTable.tenantId, tenantId),
      eq(storageUploadIntentsTable.status, "pending"),
      gt(storageUploadIntentsTable.expiresAt, new Date()),
    ))
    .returning({ id: storageUploadIntentsTable.id });
  return Boolean(claimed);
}

async function completePendingUploadConfirmation(objectPath: string, principal: string, ownerUserId: number | null, tenantId: number | null, status: "confirmed" | "rejected"): Promise<void> {
  if (!db) throw new Error("Upload intent database unavailable");
  await db.update(storageUploadIntentsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(
      eq(storageUploadIntentsTable.objectPath, objectPath),
      eq(storageUploadIntentsTable.principal, principal),
      ownerUserId === null ? isNull(storageUploadIntentsTable.ownerUserId) : eq(storageUploadIntentsTable.ownerUserId, ownerUserId),
      tenantId === null ? isNull(storageUploadIntentsTable.tenantId) : eq(storageUploadIntentsTable.tenantId, tenantId),
      eq(storageUploadIntentsTable.status, "confirming"),
    ));
}

async function releasePendingUploadConfirmation(objectPath: string, principal: string, ownerUserId: number | null, tenantId: number | null): Promise<void> {
  if (!db) throw new Error("Upload intent database unavailable");
  await db.update(storageUploadIntentsTable)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(
      eq(storageUploadIntentsTable.objectPath, objectPath),
      eq(storageUploadIntentsTable.principal, principal),
      ownerUserId === null ? isNull(storageUploadIntentsTable.ownerUserId) : eq(storageUploadIntentsTable.ownerUserId, ownerUserId),
      tenantId === null ? isNull(storageUploadIntentsTable.tenantId) : eq(storageUploadIntentsTable.tenantId, tenantId),
      eq(storageUploadIntentsTable.status, "confirming"),
      gt(storageUploadIntentsTable.expiresAt, new Date()),
    ));
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

  if (!requireUploadDatabase(res)) return;

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
    await registerPendingUpload(objectPath, contentType, size, getPrincipal(res), getOwnerUserId(res), getTenantId(res));

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

  if (!requireUploadDatabase(res)) return;

  const principal = getPrincipal(res);
  const ownerUserId = getOwnerUserId(res);
  const tenantId = getTenantId(res);
  if (!(await beginPendingUploadConfirmation(objectPath, principal, ownerUserId, tenantId))) {
    res.status(403).json({ error: "No pending upload for this object path" });
    return;
  }

  try {
    const { contentType, size } = await objectStorageService.enforceUploadCompliance(objectPath, {
      allowedContentTypes: ALLOWED_UPLOAD_CONTENT_TYPES,
      maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    });
    const [intent] = await db.select({
      declaredContentType: storageUploadIntentsTable.declaredContentType,
      declaredSize: storageUploadIntentsTable.declaredSize,
    }).from(storageUploadIntentsTable).where(and(
      eq(storageUploadIntentsTable.objectPath, objectPath),
      eq(storageUploadIntentsTable.principal, principal),
      ownerUserId === null ? isNull(storageUploadIntentsTable.ownerUserId) : eq(storageUploadIntentsTable.ownerUserId, ownerUserId),
      tenantId === null ? isNull(storageUploadIntentsTable.tenantId) : eq(storageUploadIntentsTable.tenantId, tenantId),
    )).limit(1);
    if (!intent || !matchesDeclaredUploadMetadata(
      { contentType: intent.declaredContentType, size: intent.declaredSize },
      { contentType, size },
    )) {
      await objectStorageService.deleteObjectEntity(objectPath);
      await completePendingUploadConfirmation(objectPath, principal, ownerUserId, tenantId, "rejected");
      res.status(422).json({ error: "Upload-Metadaten stimmen nicht mit dem Auftrag überein" });
      return;
    }
    await completePendingUploadConfirmation(objectPath, principal, ownerUserId, tenantId, "confirmed");
    res.json(ConfirmUploadResponse.parse({ ok: true, contentType, size }));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      await releasePendingUploadConfirmation(objectPath, principal, ownerUserId, tenantId);
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof UploadNonCompliantError) {
      await completePendingUploadConfirmation(objectPath, principal, ownerUserId, tenantId, "rejected");
      req.log.warn(
        { objectPath, contentType: error.contentType, size: error.size },
        "Upload verstößt gegen Richtlinie, Objekt gelöscht"
      );
      res.status(422).json({ error: "Upload verstößt gegen Größen-/Dateityp-Richtlinie" });
      return;
    }
    await releasePendingUploadConfirmation(objectPath, principal, ownerUserId, tenantId);
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
