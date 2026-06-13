import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "application/pdf"]);
const DOCUMENT_AI_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const PASSPORT_OUTPUT_EMPTY = {
  passportNumber: "",
  fullName: "",
  nationality: "",
  dateOfBirth: "",
  placeOfBirth: "",
  gender: "",
  issueDate: "",
  expiryDate: "",
  mrz: "",
};

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return "";
};

const getDocumentAiConfig = () => ({
  projectId: getEnv("DOCUMENT_AI_PROJECT_ID", "GOOGLE_CLOUD_PROJECT_ID", "GOOGLE_PROJECT_ID"),
  location: getEnv("DOCUMENT_AI_LOCATION", "GOOGLE_DOCUMENT_AI_LOCATION") || "us",
  processorId: getEnv("DOCUMENT_AI_PROCESSOR_ID", "GOOGLE_DOCUMENT_AI_PROCESSOR_ID"),
});

const assertDocumentAiConfig = () => {
  const config = getDocumentAiConfig();
  const missing = [];

  if (!process.env.GOOGLE_CLIENT_ID?.trim()) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET?.trim()) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.GOOGLE_REFRESH_TOKEN?.trim()) missing.push("GOOGLE_REFRESH_TOKEN");
  if (!config.projectId) missing.push("DOCUMENT_AI_PROJECT_ID");
  if (!config.processorId) missing.push("DOCUMENT_AI_PROCESSOR_ID");

  if (missing.length > 0) {
    throw new Error(`Konfigurasi Google Cloud belum lengkap: ${missing.join(", ")}.`);
  }

  return config;
};

const createOAuthClient = () => {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    scope: DOCUMENT_AI_SCOPE,
  });

  return client;
};

const cleanPassportNumber = (value = "") =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").slice(0, 9);

const cleanTextValue = (value = "") =>
  String(value)
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/[«‹]/g, "<")
    .replace(/[»›]/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();

const cleanName = (value = "") =>
  String(value)
    .toUpperCase()
    .replace(/[^A-Z\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const normalizeDate = (value) => {
  if (!value) return "";

  const raw = String(value)
    .trim()
    .replace(/[./]/g, "-")
    .replace(/\s+/g, " ");

  const iso = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const dmy = raw.match(/\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  const monthNames = {
    jan: "01",
    januari: "01",
    feb: "02",
    februari: "02",
    mar: "03",
    maret: "03",
    apr: "04",
    april: "04",
    may: "05",
    mei: "05",
    jun: "06",
    juni: "06",
    jul: "07",
    juli: "07",
    aug: "08",
    agustus: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    okt: "10",
    oktober: "10",
    nov: "11",
    november: "11",
    dec: "12",
    des: "12",
    desember: "12",
  };
  const namedMonth = raw.toLowerCase().match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/);
  if (namedMonth && monthNames[namedMonth[2]]) {
    return `${namedMonth[3]}-${monthNames[namedMonth[2]]}-${namedMonth[1].padStart(2, "0")}`;
  }

  const namedMonthDashed = raw.toLowerCase().match(/\b(\d{1,2})-([a-z]+)-(\d{4})\b/);
  if (namedMonthDashed && monthNames[namedMonthDashed[2]]) {
    return `${namedMonthDashed[3]}-${monthNames[namedMonthDashed[2]]}-${namedMonthDashed[1].padStart(2, "0")}`;
  }

  return "";
};

const formatDateForOutput = (value) => {
  const isoDate = normalizeDate(value);
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const month = MONTH_ABBR[Number(match[2]) - 1];
  if (!month) return "";

  return `${match[3]}-${month}-${match[1]}`;
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

const normalizeMrzLine = (line = "") =>
  line
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/[<({\[]/g, "<")
    .replace(/[>)}\]]/g, "<")
    .replace(/[^A-Z0-9<]/g, "");

const parseMrz = (text = "") => {
  const lines = text
    .split(/\n/)
    .map(normalizeMrzLine)
    .filter((line) => line.includes("<") && line.length >= 30);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line1 = lines[index];
    const line2 = lines[index + 1];

    if (!line1.startsWith("P<") || line2.length < 27) continue;

    const [surname = "", givenNames = ""] = line1.slice(5).split("<<");

    return {
      passportNumber: cleanPassportNumber(line2.slice(0, 9).replace(/</g, "")),
      fullName: cleanName(`${givenNames.replace(/</g, " ")} ${surname.replace(/</g, " ")}`),
      nationality: line2.slice(10, 13).replace(/</g, ""),
      dateOfBirth: mrzDateToIso(line2.slice(13, 19).replace(/[A-Z]/g, "0"), "birth"),
      gender: line2[20] === "F" ? "P" : line2[20] === "M" ? "L" : "",
      expiryDate: mrzDateToIso(line2.slice(21, 27).replace(/[A-Z]/g, "0"), "expiry"),
      mrz: `${line1}\n${line2}`,
    };
  }

  return {};
};

const getLines = (text = "") =>
  text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const valueAfterLabel = (lines, labelPattern) => {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sameLine = line.match(new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(.+)$`, "i"));
    if (sameLine?.[1]) return sameLine[1].trim();

    if (new RegExp(labelPattern, "i").test(line) && lines[index + 1]) {
      return lines[index + 1].trim();
    }
  }

  return "";
};

const findFirstDateNearLabel = (lines, labelPattern) => {
  const datePattern = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/;

  for (let index = 0; index < lines.length; index += 1) {
    if (!new RegExp(labelPattern, "i").test(lines[index])) continue;

    const current = lines[index].match(datePattern)?.[1];
    if (current) return normalizeDate(current);

    const next = lines[index + 1]?.match(datePattern)?.[1];
    if (next) return normalizeDate(next);
  }

  return "";
};

const parsePlainTextFields = (text = "") => {
  const lines = getLines(text);
  const passportRaw =
    valueAfterLabel(lines, "(?:passport\\s*(?:no|number)|document\\s*(?:no|number)|nomor\\s*paspor|no\\.?\\s*paspor)") ||
    text.match(/\b[A-Z][0-9O]{7,8}\b/i)?.[0] ||
    "";
  const genderRaw = valueAfterLabel(lines, "(?:sex|gender|jenis\\s*kelamin)");

  return {
    passportNumber: passportRaw ? cleanPassportNumber(passportRaw) : "",
    fullName: cleanName(valueAfterLabel(lines, "(?:full\\s*name|name|nama\\s*lengkap|nama)")),
    nationality: valueAfterLabel(lines, "(?:nationality|kewarganegaraan|warga\\s*negara)").toUpperCase(),
    dateOfBirth: findFirstDateNearLabel(lines, "(?:date\\s*of\\s*birth|birth\\s*date|tanggal\\s*lahir|tgl\\.?\\s*lahir)"),
    placeOfBirth: valueAfterLabel(lines, "(?:place\\s*of\\s*birth|tempat\\s*lahir)").toUpperCase(),
    gender: /^(m|male|l|laki)/i.test(genderRaw)
      ? "L"
      : /^(f|female|p|perempuan)/i.test(genderRaw)
        ? "P"
        : "",
    issueDate: findFirstDateNearLabel(lines, "(?:date\\s*of\\s*issue|issue\\s*date|tanggal\\s*dikeluarkan|tanggal\\s*terbit)"),
    expiryDate: findFirstDateNearLabel(lines, "(?:expiry|expiration|date\\s*of\\s*expiry|berlaku\\s*sampai|tanggal\\s*berakhir)"),
  };
};

const getNormalizedDateValue = (entity) => {
  const dateValue = entity?.normalizedValue?.dateValue;
  if (!dateValue?.year || !dateValue?.month || !dateValue?.day) return "";

  return `${dateValue.year}-${String(dateValue.month).padStart(2, "0")}-${String(dateValue.day).padStart(2, "0")}`;
};

const getEntityText = (entity) =>
  cleanTextValue(
    getNormalizedDateValue(entity) ||
      entity?.mentionText ||
      entity?.normalizedValue?.text ||
      entity?.textAnchor?.content ||
      ""
  );

const normalizeEntityType = (type = "") =>
  String(type).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const ENTITY_FIELD_MAP = new Map([
  ["passport_number", "passportNumber"],
  ["passport_no", "passportNumber"],
  ["document_number", "passportNumber"],
  ["id_number", "passportNumber"],
  ["name", "fullName"],
  ["full_name", "fullName"],
  ["given_names", "fullName"],
  ["surname", "fullName"],
  ["nationality", "nationality"],
  ["country_code", "nationality"],
  ["date_of_birth", "dateOfBirth"],
  ["birth_date", "dateOfBirth"],
  ["place_of_birth", "placeOfBirth"],
  ["birth_place", "placeOfBirth"],
  ["sex", "gender"],
  ["gender", "gender"],
  ["date_of_issue", "issueDate"],
  ["issue_date", "issueDate"],
  ["date_of_expiry", "expiryDate"],
  ["expiration_date", "expiryDate"],
  ["expiry_date", "expiryDate"],
  ["mrz", "mrz"],
]);

const normalizeGender = (value = "") => {
  if (/^(m|male|l|laki)/i.test(value)) return "L";
  if (/^(f|female|p|perempuan)/i.test(value)) return "P";
  return "";
};

const normalizeFieldValue = (field, value) => {
  if (!value) return "";
  if (field === "passportNumber") return cleanPassportNumber(value);
  if (field === "fullName") return cleanName(value);
  if (field === "nationality" || field === "placeOfBirth") return value.toUpperCase();
  if (field === "gender") return normalizeGender(value);
  if (field.endsWith("Date") || field === "dateOfBirth") return normalizeDate(value);
  if (field === "mrz") return value.toUpperCase();
  return value;
};

const parseDocumentEntities = (entities = []) => {
  const result = { ...PASSPORT_OUTPUT_EMPTY };
  const nameParts = [];

  for (const entity of entities) {
    const type = normalizeEntityType(entity.type);
    const field = ENTITY_FIELD_MAP.get(type);
    if (entity.properties?.length) {
      const nestedResult = parseDocumentEntities(entity.properties);
      for (const key of Object.keys(PASSPORT_OUTPUT_EMPTY)) {
        if (!result[key] && nestedResult[key]) result[key] = nestedResult[key];
      }
    }

    if (!field) continue;

    const value = normalizeFieldValue(field, getEntityText(entity));
    if (!value) continue;

    if ((type === "given_names" || type === "surname") && field === "fullName") {
      nameParts.push(value);
      continue;
    }

    if (!result[field]) result[field] = value;
  }

  if (!result.fullName && nameParts.length > 0) {
    result.fullName = cleanName(nameParts.join(" "));
  }

  return result;
};

const mergePassportData = (...results) =>
  results.reduce((merged, result) => {
    for (const key of Object.keys(PASSPORT_OUTPUT_EMPTY)) {
      if (!merged[key] && result?.[key]) merged[key] = result[key];
    }

    return merged;
  }, { ...PASSPORT_OUTPUT_EMPTY });

const formatPassportDates = (data) => ({
  ...data,
  dateOfBirth: formatDateForOutput(data.dateOfBirth),
  issueDate: formatDateForOutput(data.issueDate),
  expiryDate: formatDateForOutput(data.expiryDate),
});

const runDocumentAi = async (buffer, mimeType) => {
  const { projectId, location, processorId } = assertDocumentAiConfig();
  const authClient = createOAuthClient();
  const { token } = await authClient.getAccessToken();

  if (!token) throw new Error("Gagal mendapatkan Google access token dari refresh token.");

  const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rawDocument: {
        content: buffer.toString("base64"),
        mimeType: mimeType || "image/jpeg",
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || "Google Document AI gagal memproses file paspor.";
    throw new Error(message);
  }

  return payload.document || {};
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File paspor tidak ditemukan." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ukuran file maksimal 15MB." }, { status: 400 });
    }

    if (file.type && !ACCEPTED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({
        error: "Format wajib .jpeg, .jpg, .png, atau .pdf.",
      }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await runDocumentAi(buffer, file.type);
    const text = cleanTextValue(document.text || "");
    const entityResult = parseDocumentEntities(document.entities || []);
    const textResult = parsePlainTextFields(text);
    const mrzResult = parseMrz(text);
    const data = formatPassportDates(mergePassportData(mrzResult, entityResult, textResult));

    if (!data.passportNumber && !data.fullName && !data.dateOfBirth && !data.expiryDate) {
      return NextResponse.json({
        error: "Data paspor belum terbaca. Silakan isi manual atau upload foto paspor yang lebih jelas.",
        data,
      }, { status: 422 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Google Passport OCR Error:", error);
    return NextResponse.json({
      error: error.message || "Gagal membaca data paspor melalui Google Cloud. Silakan isi manual.",
      data: { ...PASSPORT_OUTPUT_EMPTY },
    }, { status: 500 });
  }
}
