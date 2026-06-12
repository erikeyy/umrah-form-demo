import { NextResponse } from "next/server";
import path from "node:path";
import { createWorker } from "tesseract.js";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const TESSERACT_LANG_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0"
);
const TESSERACT_WORKER_PATH = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js"
);
const TESSERACT_CORE_PATH = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js-core"
);

const cleanPassportNumber = (value = "") =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");

const normalizeOcrText = (text = "") =>
  text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/[«‹]/g, "<")
    .replace(/[»›]/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();

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

const normalizeMrzLine = (line = "") =>
  line
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/[<({\[]/g, "<")
    .replace(/[>)}\]]/g, "<")
    .replace(/[^A-Z0-9<]/g, "");

const MRZ_FILLER_NOISE = /^[CLKI]+$/;
const COMMON_LEADING_NOISE_FIXES = new Map([
  ["SERIK", "ERIK"],
  ["NYULIANTO", "YULIANTO"],
]);

const cleanMrzNameToken = (token = "") => {
  const normalized = token.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized.length < 2 || MRZ_FILLER_NOISE.test(normalized)) return "";
  if (COMMON_LEADING_NOISE_FIXES.has(normalized)) return COMMON_LEADING_NOISE_FIXES.get(normalized);

  return normalized;
};

const cleanMrzName = (...nameParts) => {
  const tokens = nameParts
    .join(" ")
    .split(/\s+/)
    .map(cleanMrzNameToken)
    .filter(Boolean);

  return tokens.join(" ").trim();
};

const parseMrz = (text = "") => {
  const lines = text
    .split(/\n/)
    .map(normalizeMrzLine)
    .filter((line) => line.includes("<") && line.length >= 30);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line1 = lines[index];
    const line2 = lines[index + 1];

    if (!line1.startsWith("P<") || line2.length < 27) continue;

    const nameParts = line1.slice(5).split("<<");
    const surname = nameParts[0]?.replace(/</g, " ").trim();
    const givenNames = nameParts[1]?.replace(/</g, " ").trim();
    const namaLengkap = cleanMrzName(givenNames, surname);

    return {
      noPaspor: cleanPassportNumber(line2.slice(0, 9).replace(/</g, "")),
      tanggalLahir: mrzDateToIso(line2.slice(13, 19).replace(/[A-Z]/g, "0"), "birth"),
      pasporExpired: mrzDateToIso(line2.slice(21, 27).replace(/[A-Z]/g, "0"), "expiry"),
      jenisKelamin: line2[20] === "F" ? "P" : line2[20] === "M" ? "L" : "",
      namaLengkap,
      source: "mrz",
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
  const nameRaw =
    valueAfterLabel(lines, "(?:full\\s*name|name|nama\\s*lengkap|nama)") ||
    "";

  return {
    noPaspor: passportRaw ? cleanPassportNumber(passportRaw).slice(0, 9) : "",
    tanggalLahir: findFirstDateNearLabel(lines, "(?:date\\s*of\\s*birth|birth\\s*date|tanggal\\s*lahir|tgl\\.?\\s*lahir)"),
    pasporExpired: findFirstDateNearLabel(lines, "(?:expiry|expiration|date\\s*of\\s*expiry|berlaku\\s*sampai|tanggal\\s*berakhir)"),
    namaLengkap: nameRaw
      .replace(/[^A-Za-z\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
    jenisKelamin: /^(m|male|l|laki)/i.test(genderRaw)
      ? "L"
      : /^(f|female|p|perempuan)/i.test(genderRaw)
        ? "P"
        : "",
    source: "plain_text",
  };
};

const mergeOcrResults = (textResult, mrzResult) => ({
  noPaspor: mrzResult.noPaspor || textResult.noPaspor || "",
  tanggalLahir: mrzResult.tanggalLahir || textResult.tanggalLahir || "",
  pasporExpired: mrzResult.pasporExpired || textResult.pasporExpired || "",
  namaLengkap: mrzResult.namaLengkap || textResult.namaLengkap || "",
  jenisKelamin: mrzResult.jenisKelamin || textResult.jenisKelamin || "",
  source: mrzResult.noPaspor ? "mrz" : textResult.source || "none",
});

const runLocalOcr = async (buffer) => {
  const worker = await createWorker("eng", 1, {
    cacheMethod: "none",
    corePath: TESSERACT_CORE_PATH,
    langPath: TESSERACT_LANG_PATH,
    workerPath: TESSERACT_WORKER_PATH,
  });

  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);

    return normalizeOcrText(text);
  } finally {
    await worker.terminate();
  }
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
        error: "OCR lokal hanya mendukung foto paspor .jpeg, .jpg, atau .png. Untuk PDF, silakan isi data paspor manual.",
      }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await runLocalOcr(buffer);
    const textResult = parsePlainTextFields(text);
    const mrzResult = parseMrz(text);
    const data = mergeOcrResults(textResult, mrzResult);

    if (!data.noPaspor && !data.tanggalLahir && !data.pasporExpired) {
      return NextResponse.json({
        error: "Data paspor belum terbaca. Silakan isi manual atau upload foto paspor yang lebih jelas.",
        data,
      }, { status: 422 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Local Passport OCR Error:", error);
    return NextResponse.json({
      error: "Gagal membaca data paspor melalui OCR lokal. Silakan isi manual.",
    }, { status: 500 });
  }
}
