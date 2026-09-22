import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

/**
 * Standard-GCP-Auth (ersetzt den Replit-Sidecar unter 127.0.0.1:1106).
 *
 * Unterstützt zwei Wege, je nachdem was in der Ziel-Umgebung verfügbar ist:
 * 1. GOOGLE_APPLICATION_CREDENTIALS zeigt auf eine Service-Account-JSON-Datei
 *    (klassischer GCP-Weg, funktioniert auf jedem VPS/Container).
 * 2. GCS_SERVICE_ACCOUNT_JSON enthält den JSON-Inhalt direkt als String
 *    (praktisch für Plattformen wie Railway/Render, die nur Env-Vars,
 *    aber keine Dateien als Secrets anbieten).
 *
 * Mit echten Service-Account-Credentials kann die Storage-Client-Bibliothek
 * signierte URLs selbst erzeugen — der Sidecar-Aufruf für signObjectURL()
 * entfällt dadurch komplett (siehe unten).
 */
function ladeStorageOptionen(): ConstructorParameters<typeof Storage>[0] {
  const inlineJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    try {
      const credentials = JSON.parse(inlineJson);
      return { credentials, projectId: credentials.project_id };
    } catch {
      throw new Error(
        "GCS_SERVICE_ACCOUNT_JSON ist kein gültiges JSON. Erwartet wird der komplette Inhalt " +
          "der Service-Account-Schlüsseldatei aus der GCP Console (IAM & Admin → Service Accounts).",
      );
    }
  }

  // Fallback: GOOGLE_APPLICATION_CREDENTIALS (Dateipfad) wird von der Google-Client-Library
  // automatisch gelesen — hier reicht ein leeres Options-Objekt, sofern die Env-Var gesetzt ist.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {};
  }

  console.warn("⚠️ Keine GCP-Credentials — Object Storage deaktiviert");
  return {} as any;
}

let _storageClient: any = null;
try {
  _storageClient = new Storage(ladeStorageOptionen());
} catch (err) {
  console.warn("⚠️ Object Storage nicht verfügbar:", (err as Error).message?.slice(0, 80));
}
export const objectStorageClient = _storageClient;

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * Re-checks an uploaded object's actual size/content-type (as recorded by
   * GCS, not client-supplied metadata) against the given policy. The PUT to
   * the presigned URL goes directly to GCS and is never observed by this
   * server, so declared metadata at request-url time cannot be trusted to
   * match what was actually written. Non-compliant objects are deleted
   * immediately so they cannot be read, made public, or left to accumulate
   * storage cost.
   */
  async enforceUploadCompliance(
    objectPath: string,
    { allowedContentTypes, maxSizeBytes }: { allowedContentTypes: Set<string>; maxSizeBytes: number }
  ): Promise<{ contentType: string; size: number }> {
    const objectFile = await this.getObjectEntityFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    const contentType = (metadata.contentType as string) || "";
    const size = Number(metadata.size) || 0;

    const compliant =
      size > 0 && size <= maxSizeBytes && allowedContentTypes.has(contentType);

    if (!compliant) {
      await objectFile.delete({ ignoreNotFound: true });
      throw new UploadNonCompliantError(contentType, size);
    }

    return { contentType, size };
  }

  /**
   * Defense-in-depth sweep for the uploads/ prefix. `enforceUploadCompliance`
   * only runs when a caller voluntarily calls the confirm route — a caller
   * that never confirms could otherwise leave an oversized/disallowed (or
   * simply abandoned) object sitting in the bucket indefinitely. This sweep
   * deletes any object under uploads/ that is non-compliant, or that has
   * never received an ACL policy (i.e. was never confirmed+finalized by a
   * legitimate caller) after `maxUnconfirmedAgeMs`.
   */
  async sweepNonCompliantUploads({
    allowedContentTypes,
    maxSizeBytes,
    maxUnconfirmedAgeMs,
  }: {
    allowedContentTypes: Set<string>;
    maxSizeBytes: number;
    maxUnconfirmedAgeMs: number;
  }): Promise<{ scanned: number; deleted: number }> {
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const uploadsPrefixPath = `${entityDir}uploads/`;
    const { bucketName, objectName: prefix } = parseObjectPath(uploadsPrefixPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix });

    let deleted = 0;
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size) || 0;
      const contentType = (metadata.contentType as string) || "";
      const hasAclPolicy = Boolean(metadata?.metadata?.["custom:aclPolicy"]);
      const createdMs = metadata.timeCreated ? new Date(metadata.timeCreated as string).getTime() : 0;
      const ageMs = createdMs ? Date.now() - createdMs : 0;

      const nonCompliant = size <= 0 || size > maxSizeBytes || !allowedContentTypes.has(contentType);
      const abandoned = !hasAclPolicy && ageMs > maxUnconfirmedAgeMs;

      if (nonCompliant || abandoned) {
        await file.delete({ ignoreNotFound: true });
        deleted++;
      }
    }

    return { scanned: files.length, deleted };
  }
}

export class UploadNonCompliantError extends Error {
  constructor(
    public readonly contentType: string,
    public readonly size: number
  ) {
    super(`Upload violates policy: contentType=${contentType} size=${size}`);
    this.name = "UploadNonCompliantError";
    Object.setPrototypeOf(this, UploadNonCompliantError.prototype);
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  // Mit echten Service-Account-Credentials (statt des Replit-Sidecars) kann
  // die Google-Client-Library signierte URLs direkt und ohne Netzwerk-Umweg
  // erzeugen — vorausgesetzt der Service Account hat die Rolle
  // "Service Account Token Creator" (roles/iam.serviceAccountTokenCreator)
  // auf sich selbst, bzw. bei GOOGLE_APPLICATION_CREDENTIALS reicht ein
  // Key mit private_key.
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const [signedURL] = await file.getSignedUrl({
    version: "v4",
    action: method === "GET" || method === "HEAD" ? "read" : method === "PUT" ? "write" : "delete",
    expires: Date.now() + ttlSec * 1000,
  });
  return signedURL;
}
