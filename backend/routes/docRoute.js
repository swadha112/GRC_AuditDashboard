import express from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";

const router = express.Router();

const STORE_PATH = path.join(process.cwd(), "docStore.json"); // backend root
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const STATUSES = ["Not Started", "Draft", "Reviewed", "Approved", "Implemented"];

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const obj = JSON.parse(raw);
    if (!obj.documents) obj.documents = [];
    return obj;
  } catch {
    const init = { documents: [] };
    await fs.writeFile(STORE_PATH, JSON.stringify(init, null, 2), "utf-8");
    return init;
  }
}

async function writeStore(store) {
  const tmp = STORE_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf-8");
  await fs.rename(tmp, STORE_PATH);
}

function nowISO() {
  return new Date().toISOString();
}

function getRole(req) {
  return String(req.query.role || req.header("x-role") || "viewer").toLowerCase();
}

function assertRole(req, allowed) {
  const role = getRole(req);
  if (!allowed.includes(role)) {
    const err = new Error(`Forbidden for role: ${role}`);
    err.status = 403;
    throw err;
  }
  return role;
}

/**
 * ✅ Non-repudiation identity (temporary demo):
 * In real auth, you will derive these from JWT/SSO claims.
 */
function getActor(req) {
  const role = getRole(req);
  const actorName =
    String(req.header("x-user-name") || "").trim() ||
    // fallback demo names by role
    (role === "approver" ? "Approver User" : role === "editor" ? "Editor User" : "Viewer User");

  const actorId = String(req.header("x-user-id") || "").trim() || null; // email/employeeId ideally
  return { role, actorName, actorId };
}

function ensureDocBasics(doc) {
  doc.timestamps = doc.timestamps || {};
  if (!doc.timestamps.createdAt) doc.timestamps.createdAt = nowISO();
  if (!doc.timestamps.updatedAt) doc.timestamps.updatedAt = doc.timestamps.createdAt;
  if (!("approvedAt" in doc.timestamps)) doc.timestamps.approvedAt = null;
  doc.auditTrail = doc.auditTrail || [];
}

function addAudit(doc, actor, action, details, at = nowISO()) {
  ensureDocBasics(doc);

  doc.auditTrail.unshift({
    at,
    actorRole: actor.role,
    actorName: actor.actorName, // ✅ new
    actorId: actor.actorId,     // ✅ new
    action,
    details,
  });

  doc.timestamps.updatedAt = at;
}

// Multer disk storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureUploadDir();
      cb(null, UPLOAD_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// GET /api/docs
router.get("/", async (req, res, next) => {
  try {
    const store = await readStore();
    const control = String(req.query.control || "").trim();
    const docs = store.documents || [];
    const out = control ? docs.filter((d) => d.control === control) : docs;
    // make sure fields exist to avoid UI null issues
    out.forEach(ensureDocBasics);
    res.json({ documents: out });
  } catch (e) {
    next(e);
  }
});

// GET /api/docs/:id
router.get("/:id", async (req, res, next) => {
  try {
    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    ensureDocBasics(doc);
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// GET /api/docs/:id/download
router.get("/:id/download", async (req, res, next) => {
  try {
    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const storedName = doc.file?.storedName;
    if (!storedName) return res.status(404).json({ error: "No file uploaded yet" });

    const filePath = path.join(UPLOAD_DIR, storedName);
    res.download(filePath, doc.file.originalName || "document");
  } catch (e) {
    next(e);
  }
});

// GET /api/docs/:id/view  (inline preview)
router.get("/:id/view", async (req, res, next) => {
  try {
    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const storedName = doc.file?.storedName;
    if (!storedName) return res.status(404).json({ error: "No file uploaded yet" });

    const filePath = path.join(UPLOAD_DIR, storedName);
    res.setHeader("Content-Type", doc.file?.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${doc.file?.originalName || "document"}"`);
    return res.sendFile(filePath);
  } catch (e) {
    next(e);
  }
});

// PATCH /api/docs/:id/metadata   (editor/approver)
router.patch("/:id/metadata", async (req, res, next) => {
  try {
    assertRole(req, ["editor", "approver"]);
    const actor = getActor(req);

    const { title, owner, approver, correlations } = req.body || {};
    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    ensureDocBasics(doc);

    if (typeof title === "string") doc.title = title;
    if (typeof owner === "string") doc.owner = owner;
    if (typeof approver === "string") doc.approver = approver;

    if (correlations && typeof correlations === "object") {
      doc.correlations = { ...(doc.correlations || {}), ...correlations };
    }

    addAudit(doc, actor, "update_metadata", "Updated metadata");
    await writeStore(store);
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// POST /api/docs/:id/upload  (editor/approver)
router.post("/:id/upload", upload.single("file"), async (req, res, next) => {
  try {
    assertRole(req, ["editor", "approver"]);
    const actor = getActor(req);

    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    ensureDocBasics(doc);

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    doc.file = {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };

    // bump version minor: "x.y" -> "x.(y+1)"
    const parts = String(doc.version || "0.0").split(".");
    const maj = parts[0] || "0";
    const min = Number(parts[1] || "0");
    doc.version = `${maj}.${Number.isFinite(min) ? min + 1 : 1}`;

    if (doc.status === "Not Started") doc.status = "Draft";

    addAudit(doc, actor, "upload_file", `Uploaded ${req.file.originalname}`);
    await writeStore(store);
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// PATCH /api/docs/:id/status  (approver)
router.patch("/:id/status", async (req, res, next) => {
  try {
    assertRole(req, ["approver"]);
    const actor = getActor(req);

    const { status, note } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status", allowed: STATUSES });
    }

    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    ensureDocBasics(doc);

    doc.status = status;

    const at = nowISO();
    if (status === "Approved") doc.timestamps.approvedAt = at;

    addAudit(doc, actor, "update_status", `Status -> ${status}${note ? " | " + note : ""}`, at);
    await writeStore(store);
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// POST /api/docs/:id/comment  (editor/approver)
router.post("/:id/comment", async (req, res, next) => {
  try {
    assertRole(req, ["editor", "approver"]);
    const actor = getActor(req);

    const { comment } = req.body || {};
    if (!comment || !String(comment).trim()) return res.status(400).json({ error: "comment required" });

    const store = await readStore();
    const doc = (store.documents || []).find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    ensureDocBasics(doc);

    addAudit(doc, actor, "comment", String(comment).trim());
    await writeStore(store);
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

router.use((err, req, res, next) => {
  const code = err.status || 500;
  res.status(code).json({ error: err.message || "Server error" });
});

export default router;