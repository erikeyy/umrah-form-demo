import { NextResponse } from "next/server";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

const REQUIRED_ENV = [
  "DOCUMENT_AI_PROJECT_ID",
  "DOCUMENT_AI_LOCATION",
  "DOCUMENT_AI_PROCESSOR_ID",
];

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

const getDocumentAiClient = () => {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new DocumentProcessorServiceClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key?.replace(/\\n/g, "\n"),
      },
      projectId: credentials.project_id,
    });
  }

  if (process.env.DOCUMENT_AI_CLIENT_EMAIL && process.env.DOCUMENT_AI_PRIVATE_KEY) {
    return new DocumentProcessorServiceClient({
      credentials: {
        client_email: process.env.DOCUMENT_AI_CLIENT_EMAIL,
        private_key: process.env.DOCUMENT_AI_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      projectId: process.env.DOCUMENT_AI_PROJECT_ID,
    });
  }

  return new DocumentProcessorServiceClient();
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
    const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missingEnv.length > 0) {
      return NextResponse.json({
        error: `Konfigurasi Document AI belum lengkap: ${missingEnv.join(", ")}`,
      }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File paspor tidak ditemukan." }, { status: 400 });
    }

    const client = getDocumentAiClient();
    const name = client.processorPath(
      process.env.DOCUMENT_AI_PROJECT_ID,
      process.env.DOCUMENT_AI_LOCATION,
      process.env.DOCUMENT_AI_PROCESSOR_ID
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
    console.error("Passport OCR Error:", error);
    return NextResponse.json({
      error: "Gagal membaca data paspor melalui Document AI.",
    }, { status: 500 });
  }
}
