const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "reservations.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const ENV_ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const MIN_ADMIN_PASSWORD_LENGTH = 6;

const defaultData = {
  settings: {
    eventTitle: "Soiree casque VR",
    eventDate: "Ce soir",
    venue: "Salle de jeu",
    description:
      "Reserve un creneau, viens avec ton prenom, et profite d'une session VR.",
  },
  devices: [
    { id: "device-1", name: "Casque VR 1", active: true },
    { id: "device-2", name: "Casque VR 2", active: true },
    { id: "device-3", name: "Casque VR 3", active: true },
  ],
  slots: [
    { id: "slot-2000", label: "20:00 - 20:15", capacity: 3, active: true },
    { id: "slot-2020", label: "20:20 - 20:35", capacity: 3, active: true },
    { id: "slot-2040", label: "20:40 - 20:55", capacity: 3, active: true },
    { id: "slot-2100", label: "21:00 - 21:15", capacity: 3, active: true },
    { id: "slot-2120", label: "21:20 - 21:35", capacity: 3, active: true },
    { id: "slot-2140", label: "21:40 - 21:55", capacity: 3, active: true },
  ],
  reservations: [],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    await writeData(defaultData);
  }
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 120_000, 64, "sha512")
    .toString("hex");
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function readAdminConfig() {
  if (ENV_ADMIN_PASSWORD) {
    const salt = crypto
      .createHash("sha256")
      .update(`env-admin:${process.cwd()}`)
      .digest("hex");
    return {
      configured: true,
      source: "env",
      salt,
      passwordHash: hashPassword(ENV_ADMIN_PASSWORD, salt),
      sessionSecret:
        process.env.SESSION_SECRET ||
        crypto
          .createHash("sha256")
          .update(`vr-session:${salt}:${process.cwd()}`)
          .digest("hex"),
    };
  }

  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ADMIN_FILE)) {
    return { configured: false, source: "setup" };
  }

  const text = await fsp.readFile(ADMIN_FILE, "utf8");
  const parsed = JSON.parse(text);
  return {
    configured: Boolean(parsed.passwordHash && parsed.salt),
    source: "setup",
    salt: parsed.salt,
    passwordHash: parsed.passwordHash,
    sessionSecret:
      parsed.sessionSecret ||
      crypto
        .createHash("sha256")
        .update(`vr-session:${parsed.passwordHash}:${process.cwd()}`)
        .digest("hex"),
  };
}

async function writeAdminConfig(password) {
  const salt = crypto.randomBytes(24).toString("hex");
  const adminConfig = {
    salt,
    passwordHash: hashPassword(password, salt),
    sessionSecret: crypto.randomBytes(48).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${ADMIN_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, `${JSON.stringify(adminConfig, null, 2)}\n`);
  await fsp.rename(tempFile, ADMIN_FILE);
  return { configured: true, source: "setup", ...adminConfig };
}

function verifyPassword(password, adminConfig) {
  if (!adminConfig.configured) return false;
  return timingSafeStringEqual(
    hashPassword(password, adminConfig.salt),
    adminConfig.passwordHash,
  );
}

function normalizeData(raw) {
  return {
    settings: { ...defaultData.settings, ...(raw.settings || {}) },
    devices: Array.isArray(raw.devices) ? raw.devices : defaultData.devices,
    slots: Array.isArray(raw.slots) ? raw.slots : defaultData.slots,
    reservations: Array.isArray(raw.reservations) ? raw.reservations : [],
  };
}

async function readData() {
  await ensureDataFile();
  const text = await fsp.readFile(DATA_FILE, "utf8");
  return normalizeData(JSON.parse(text));
}

async function writeData(data) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, `${JSON.stringify(normalizeData(data), null, 2)}\n`);
  await fsp.rename(tempFile, DATA_FILE);
}

async function parseBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw Object.assign(new Error("Le corps de la requete est trop grand."), {
        status: 413,
      });
    }
  }

  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("JSON invalide."), { status: 400 });
  }
}

function cleanText(value, max = 80) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanBoolean(value) {
  return value === true || value === "true" || value === "on";
}

function cleanCapacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(50, Math.round(parsed)));
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function reservationCount(data, slotId) {
  return data.reservations.filter((reservation) => reservation.slotId === slotId)
    .length;
}

function publicPayload(data) {
  const slots = data.slots
    .filter((slot) => slot.active)
    .map((slot) => {
      const taken = reservationCount(data, slot.id);
      return {
        id: slot.id,
        label: slot.label,
        capacity: slot.capacity,
        taken,
        remaining: Math.max(0, slot.capacity - taken),
      };
    });

  return {
    settings: data.settings,
    devices: data.devices.filter((device) => device.active),
    slots,
  };
}

function createToken(sessionSecret) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

async function verifyToken(req) {
  const adminConfig = await readAdminConfig();
  if (!adminConfig.configured || !adminConfig.sessionSecret) return false;

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !token.includes(".")) return false;

  const [payload, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", adminConfig.sessionSecret)
    .update(payload)
    .digest("base64url");

  if (!timingSafeStringEqual(signature, expected)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

async function requireAdmin(req, res) {
  if (!(await verifyToken(req))) {
    sendError(res, 401, "Connexion admin requise.");
    return false;
  }
  return true;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/status") {
    const adminConfig = await readAdminConfig();
    return sendJson(res, 200, {
      configured: adminConfig.configured,
      source: adminConfig.source,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/public") {
    const data = await readData();
    return sendJson(res, 200, publicPayload(data));
  }

  if (req.method === "POST" && url.pathname === "/api/reservations") {
    const body = await parseBody(req);
    const firstName = cleanText(body.firstName, 40);
    const lastName = cleanText(body.lastName, 40);
    const slotId = cleanText(body.slotId, 80);

    if (firstName.length < 2 || lastName.length < 2) {
      return sendError(res, 400, "Indique un prenom et un nom.");
    }

    const data = await readData();
    const slot = data.slots.find((item) => item.id === slotId && item.active);
    if (!slot) {
      return sendError(res, 404, "Ce creneau n'est plus disponible.");
    }

    if (reservationCount(data, slot.id) >= slot.capacity) {
      return sendError(res, 409, "Ce creneau est complet.");
    }

    const duplicate = data.reservations.some(
      (reservation) =>
        reservation.slotId === slot.id &&
        reservation.firstName.toLowerCase() === firstName.toLowerCase() &&
        reservation.lastName.toLowerCase() === lastName.toLowerCase(),
    );
    if (duplicate) {
      return sendError(res, 409, "Cette reservation existe deja.");
    }

    const reservation = {
      id: createId("reservation"),
      slotId: slot.id,
      firstName,
      lastName,
      status: "reserved",
      createdAt: new Date().toISOString(),
    };
    data.reservations.push(reservation);
    await writeData(data);

    return sendJson(res, 201, { reservation, slot });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/setup") {
    const adminConfig = await readAdminConfig();
    if (adminConfig.configured) {
      return sendError(res, 409, "Le code admin est deja configure.");
    }

    const body = await parseBody(req);
    const password = String(body.password || "");
    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
      return sendError(
        res,
        400,
        `Choisis un code admin d'au moins ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`,
      );
    }
    if (password !== String(body.confirmPassword || "")) {
      return sendError(res, 400, "Les deux codes ne correspondent pas.");
    }

    const created = await writeAdminConfig(password);
    return sendJson(res, 201, { token: createToken(created.sessionSecret) });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const adminConfig = await readAdminConfig();
    if (!adminConfig.configured) {
      return sendError(res, 409, "Cree d'abord ton code admin.");
    }

    const body = await parseBody(req);
    if (!verifyPassword(String(body.password || ""), adminConfig)) {
      return sendError(res, 401, "Code admin incorrect.");
    }
    return sendJson(res, 200, { token: createToken(adminConfig.sessionSecret) });
  }

  if (url.pathname.startsWith("/api/admin/") && !(await requireAdmin(req, res))) {
    return undefined;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/state") {
    const data = await readData();
    return sendJson(res, 200, data);
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/settings") {
    const body = await parseBody(req);
    const data = await readData();
    data.settings = {
      eventTitle: cleanText(body.eventTitle, 80) || defaultData.settings.eventTitle,
      eventDate: cleanText(body.eventDate, 80),
      venue: cleanText(body.venue, 80),
      description: cleanText(body.description, 220),
    };
    await writeData(data);
    return sendJson(res, 200, data.settings);
  }

  if (req.method === "POST" && url.pathname === "/api/admin/devices") {
    const body = await parseBody(req);
    const data = await readData();
    const device = {
      id: createId("device"),
      name: cleanText(body.name, 60) || `Casque VR ${data.devices.length + 1}`,
      active: cleanBoolean(body.active ?? true),
    };
    data.devices.push(device);
    await writeData(data);
    return sendJson(res, 201, device);
  }

  const deviceMatch = url.pathname.match(/^\/api\/admin\/devices\/([^/]+)$/);
  if (deviceMatch) {
    const data = await readData();
    const device = data.devices.find((item) => item.id === deviceMatch[1]);
    if (!device) return sendError(res, 404, "Appareil introuvable.");

    if (req.method === "PUT") {
      const body = await parseBody(req);
      device.name = cleanText(body.name, 60) || device.name;
      device.active = cleanBoolean(body.active);
      await writeData(data);
      return sendJson(res, 200, device);
    }

    if (req.method === "DELETE") {
      data.devices = data.devices.filter((item) => item.id !== device.id);
      await writeData(data);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/admin/slots") {
    const body = await parseBody(req);
    const data = await readData();
    const slot = {
      id: createId("slot"),
      label: cleanText(body.label, 60) || "Nouveau creneau",
      capacity: cleanCapacity(body.capacity),
      active: cleanBoolean(body.active ?? true),
    };
    data.slots.push(slot);
    await writeData(data);
    return sendJson(res, 201, slot);
  }

  const slotMatch = url.pathname.match(/^\/api\/admin\/slots\/([^/]+)$/);
  if (slotMatch) {
    const data = await readData();
    const slot = data.slots.find((item) => item.id === slotMatch[1]);
    if (!slot) return sendError(res, 404, "Creneau introuvable.");

    if (req.method === "PUT") {
      const body = await parseBody(req);
      slot.label = cleanText(body.label, 60) || slot.label;
      slot.capacity = cleanCapacity(body.capacity);
      slot.active = cleanBoolean(body.active);
      await writeData(data);
      return sendJson(res, 200, slot);
    }

    if (req.method === "DELETE") {
      if (reservationCount(data, slot.id) > 0) {
        return sendError(
          res,
          409,
          "Ce creneau contient des reservations. Desactive-le ou supprime les reservations avant.",
        );
      }
      data.slots = data.slots.filter((item) => item.id !== slot.id);
      await writeData(data);
      return sendJson(res, 200, { ok: true });
    }
  }

  const reservationMatch = url.pathname.match(
    /^\/api\/admin\/reservations\/([^/]+)$/,
  );
  if (reservationMatch) {
    const data = await readData();
    const reservation = data.reservations.find(
      (item) => item.id === reservationMatch[1],
    );
    if (!reservation) return sendError(res, 404, "Reservation introuvable.");

    if (req.method === "PUT") {
      const body = await parseBody(req);
      const slot = data.slots.find((item) => item.id === cleanText(body.slotId, 80));
      if (!slot) return sendError(res, 404, "Creneau introuvable.");

      reservation.firstName =
        cleanText(body.firstName, 40) || reservation.firstName;
      reservation.lastName = cleanText(body.lastName, 40) || reservation.lastName;
      reservation.slotId = slot.id;
      reservation.status =
        body.status === "checked-in" ? "checked-in" : "reserved";
      await writeData(data);
      return sendJson(res, 200, reservation);
    }

    if (req.method === "DELETE") {
      data.reservations = data.reservations.filter(
        (item) => item.id !== reservation.id,
      );
      await writeData(data);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendError(res, 404, "Route API introuvable.");
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";
  if (pathname === "/public") pathname = "/index.html";
  if (pathname.startsWith("/public/")) pathname = pathname.slice("/public".length);

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, "Acces refuse.");
  }

  try {
    const body = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const cacheControl =
      ext === ".html" || ext === ".css" || ext === ".js"
        ? "no-store"
        : "public, max-age=3600";
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
    });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "Page introuvable.");
    } else {
      throw error;
    }
  }
}

function localAddresses() {
  const addresses = [`http://localhost:${PORT}`];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(`http://${entry.address}:${PORT}`);
      }
    }
  }
  return addresses;
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    sendError(res, error.status || 500, error.message || "Erreur serveur.");
  }
});

server.listen(PORT, HOST, async () => {
  await ensureDataFile();
  const adminConfig = await readAdminConfig();
  console.log("Reservation VR demarree.");
  if (adminConfig.configured) {
    console.log("Admin: code configure.");
  } else {
    console.log("Admin: ouvre /admin pour creer ton code.");
  }
  console.log("Ouvrir:");
  for (const address of localAddresses()) {
    console.log(`- ${address}`);
  }
});
