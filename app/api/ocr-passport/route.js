import { NextResponse } from "next/server";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

const CONFIG_ENV = {
  projectId: ["DOCUMENT_AI_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GOOGLE_PROJECT_ID"],
  location: ["DOCUMENT_AI_LOCATION"],
  processorId: ["DOCUMENT_AI_PROCESSOR_ID", "DOCUMENT_AI_PASSPORT_PROCESSOR_ID"],
  serviceAccountJson: ["GOOGLE_SERVICE_ACCOUNT_JSON", "DOCUMENT_AI_SERVICE_ACCOUNT_JSON"],
  clientEmail: ["DOCUMENT_AI_CLIENT_EMAIL", "GOOGLE_CLIENT_EMAIL"],
  privateKey: ["DOCUMENT_AI_PRIVATE_KEY", "GOOGLE_PRIVATE_KEY"],
};

const FIELD_ALIASES = {
  noPaspor: [
    "passport_number",
    "passport number",
    "document_number",
    "document number",
    "nomor_paspor",
    "nomor paspor",
    "no_paspor",
    "no paspor",
  ],
  tanggalLahir: [
    "date_of_birth",
    "date of birth",
    "birth_date",
    "birth date",
    "tanggal_lahir",
    "tanggal lahir",
    "dob",
  ],
  pasporExpired: [
    "expiration_date",
    "expiration date",
    "expiry_date",
    "expiry date",
    "date_of_expiry",
    "date of expiry",
    "passport_expiry",
    "passport expiry",
    "tanggal_berakhir",
    "tanggal berakhir",
    "berlaku_sampai",
    "berlaku sampai",
  ],
  namaLengkap: [
    "full_name",
    "full name",
    "name",
    "nama",
    "nama_lengkap",
    "nama lengkap",
    "surname_given_names",
  ],
  jenisKelamin: [
    "sex",
    "gender",
    "jenis_kelamin",
    "jenis kelamin",
  ],
};

class DocumentAiConfigError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "DocumentAiConfigError";
    this.details = details;
  }
}

const getEnv = (keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const parseServiceAccountJson = (rawJson) => {
  if (!rawJson) return null;

  try {
    return JSON.parse(rawJson);
  } catch {
    throw new DocumentAiConfigError(
      "Konfigurasi Document AI tidak valid.",
      ["GOOGLE_SERVICE_ACCOUNT_JSON harus berupa JSON service account yang valid."]
    );
  }
};

const getDocumentAiConfig = () => {
  const serviceAccountJson = getEnv(CONFIG_ENV.serviceAccountJson);
  const credentials = parseServiceAccountJson(serviceAccountJson);
  const projectId = getEnv(CONFIG_ENV.projectId) || credentials?.project_id || "";
  const location = getEnv(CONFIG_ENV.location);
  const processorId = getEnv(CONFIG_ENV.processorId);
  const clientEmail = getEnv(CONFIG_ENV.clientEmail);
  const privateKey = getEnv(CONFIG_ENV.privateKey);
  const hasSplitCredentials = Boolean(clientEmail && privateKey);
  const hasAdcCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  const missing = [];
  if (!projectId) missing.push("DOCUMENT_AI_PROJECT_ID");
  if (!location) missing.push("DOCUMENT_AI_LOCATION");
  if (!processorId) missing.push("DOCUMENT_AI_PROCESSOR_ID");
  if (!credentials && !hasSplitCredentials && !hasAdcCredentials) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON atau DOCUMENT_AI_CLIENT_EMAIL + DOCUMENT_AI_PRIVATE_KEY");
  }

  if (missing.length > 0) {
    throw new DocumentAiConfigError(
      `Konfigurasi Document AI belum lengkap: ${missing.join(", ")}`,
      missing
    );
  }

  return {
    projectId,
    location,
    processorId,
    credentials,
    clientEmail,
    privateKey,
  };
};

const getDocumentAiClient = ({ credentials, clientEmail, privateKey, projectId }) => {
  if (credentials) {
    return new DocumentProcessorServiceClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key?.replace(/\\n/g, "\n"),
      },
      projectId,
    });
  }

  if (clientEmail && privateKey) {
    return new DocumentProcessorServiceClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      projectId,
    });
  }

  return new DocumentProcessorServiceClient({ projectId });
};

const normalizeKey = (value = "") => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cleanPassportNumber = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");

const getTextAnchorText = (text, textAnchor) => {
  const segments = textAnchor?.textSegments || [];
  return segments.map((segment) => {
    const start = Number(segment.startIndex || 0);
    const end = Number(segment.endIndex || 0);
    return text.slice(start, end);
  }).join("");
};

const normalizeDate = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  const normalized = raw.replace(/[./]/g, "-");

  const iso = normalized.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const dmy = normalized.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  return "";
};

const mrzDateToIso = (value, mode) => {
  if (!/^\d{6}$/.test(value)) return "";

  const yy = Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const now = new Date();
  let year = 2000 + yy;

  if (mode === "birth") {
    const candidate = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (candidate > now) year -= 100;
  }

  if (mode === "expiry") {
    const candidate = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (candidate.getFullYear() < now.getFullYear() - 10) year += 100;
  }

  return `${year}-${month}-${day}`;
};

const parseMrz = (text = "") => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.toUpperCase().replace(/\s/g, ""))
    .filter((line) => line.includes("<") && line.length >= 30);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line1 = lines[index];
    const line2 = lines[index + 1];

    if (!line1.startsWith("P<") || line2.length < 27) continue;

    const nameParts = line1.slice(5).split("<<");
    const surname = nameParts[0]?.replace(/</g, " ").trim();
    const givenNames = nameParts[1]?.replace(/</g, " ").trim();

    return {
      noPaspor: cleanPassportNumber(line2.slice(0, 9).replace(/</g, "")),
      tanggalLahir: mrzDateToIso(line2.slice(13, 19), "birth"),
      pasporExpired: mrzDateToIso(line2.slice(21, 27), "expiry"),
      jenisKelamin: line2[20] === "F" ? "P" : line2[20] === "M" ? "L" : "",
      namaLengkap: [givenNames, surname].filter(Boolean).join(" ").trim(),
      source: "mrz",
    };
  }

  return {};
};

const getEntityValue = (entity, documentText) => {
  const normalizedText = entity.normalizedValue?.text;
  const normalizedDate = entity.normalizedValue?.dateValue;

  if (normalizedText) return normalizedText;
  if (normalizedDate?.year && normalizedDate?.month && normalizedDate?.day) {
    return `${normalizedDate.year}-${String(normalizedDate.month).padStart(2, "0")}-${String(normalizedDate.day).padStart(2, "0")}`;
  }
  if (entity.mentionText) return entity.mentionText;
  return getTextAnchorText(documentText, entity.textAnchor);
};

const parseEntities = (document) => {
  const documentText = document?.text || "";
  const fields = {};
  const allEntities = [];

  const collectEntities = (entities = []) => {
    for (const entity of entities) {
      allEntities.push(entity);
      collectEntities(entity.properties || []);
    }
  };

  collectEntities(document?.entities || []);

  for (const entity of allEntities) {
    const key = normalizeKey(entity.type || "");
    const value = getEntityValue(entity, documentText);

    for (const [fieldName, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.map(normalizeKey).includes(key) && value) {
        fields[fieldName] = value;
      }
    }
  }

  return {
    noPaspor: fields.noPaspor ? cleanPassportNumber(fields.noPaspor) : "",
    tanggalLahir: normalizeDate(fields.tanggalLahir),
    pasporExpired: normalizeDate(fields.pasporExpired),
    namaLengkap: fields.namaLengkap?.replace(/\s+/g, " ").trim().toUpperCase() || "",
    jenisKelamin: /^(m|male|l|laki)/i.test(fields.jenisKelamin || "")
      ? "L"
      : /^(f|female|p|perempuan)/i.test(fields.jenisKelamin || "")
        ? "P"
        : "",
    source: "entities",
  };
};

const mergeOcrResults = (entityResult, mrzResult) => ({
  noPaspor: mrzResult.noPaspor || entityResult.noPaspor || "",
  tanggalLahir: mrzResult.tanggalLahir || entityResult.tanggalLahir || "",
  pasporExpired: mrzResult.pasporExpired || entityResult.pasporExpired || "",
  namaLengkap: entityResult.namaLengkap || mrzResult.namaLengkap || "",
  jenisKelamin: mrzResult.jenisKelamin || entityResult.jenisKelamin || "",
  source: mrzResult.noPaspor ? "mrz" : entityResult.source || "none",
});

export async function POST(request) {
  try {
    const config = getDocumentAiConfig();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File paspor tidak ditemukan." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ukuran file maksimal 15MB." }, { status: 400 });
    }

    if (file.type && !ACCEPTED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Format wajib .jpeg, .jpg, .png, atau .pdf." }, { status: 400 });
    }

    const client = getDocumentAiClient(config);
    const name = client.processorPath(
      config.projectId,
      config.location,
      config.processorId
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: buffer.toString("base64"),
        mimeType: file.type || "application/pdf",
      },
    });

    const document = result.document;
    const entityResult = parseEntities(document);
    const mrzResult = parseMrz(document?.text);
    const data = mergeOcrResults(entityResult, mrzResult);

    if (!data.noPaspor && !data.tanggalLahir && !data.pasporExpired) {
      return NextResponse.json({
        error: "Data paspor belum terbaca. Silakan isi manual atau upload foto paspor yang lebih jelas.",
        data,
      }, { status: 422 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof DocumentAiConfigError) {
      console.error("Passport OCR Config Error:", error.message);
      return NextResponse.json({
        error: error.message,
      }, { status: 500 });
    }

    console.error("Passport OCR Error:", error);
    return NextResponse.json({
      error: "Gagal membaca data paspor melalui Document AI.",
    }, { status: 500 });
  }
}
