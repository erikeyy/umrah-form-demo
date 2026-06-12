import { NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto"; // Untuk ID_PENDAFTARAN_GRUP acak [38]
import { Readable } from "node:stream";

const MAX_FAMILY_MEMBERS = 4;

const deliveryLabel = (value) => {
  if (value === "DIKIRIM") return "Dikirim ke Alamat Tempat Tinggal";
  if (value === "AMBIL_KANTOR") return "Diambil di Kantor RiDATOUR";
  return "-";
};
const NAME_FILLER_NOISE = /^[CLKI]+$/;
const NAME_OCR_FIXES = new Map([
  ["SERIK", "ERIK"],
  ["NYULIANTO", "YULIANTO"],
]);

const cleanParticipantName = (value = "") => {
  const tokens = String(value)
    .toUpperCase()
    .replace(/[^A-Z\s']/g, " ")
    .split(/\s+/)
    .map((token) => {
      const normalized = token.replace(/[^A-Z]/g, "");
      if (normalized.length < 2 || NAME_FILLER_NOISE.test(normalized)) return "";
      return NAME_OCR_FIXES.get(normalized) || normalized;
    })
    .filter(Boolean);

  return tokens.join(" ").trim();
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeParticipantData = (participant) => ({
  ...participant,
  namaLengkap: cleanParticipantName(participant?.namaLengkap),
  noPaspor: participant?.noPaspor?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "",
});

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
    this.status = 400;
  }
}

const parseJsonFormField = (formData, fieldName, fallback = null) => {
  const rawValue = formData.get(fieldName);
  if (rawValue === null || rawValue === undefined || rawValue === "") return fallback;

  try {
    return JSON.parse(rawValue);
  } catch {
    throw new BadRequestError(`Payload ${fieldName} tidak valid.`);
  }
};

const parsePrimaryParticipant = (formData) => {
  const payload = parseJsonFormField(formData, "pendaftarUtama");
  if (!isPlainObject(payload)) {
    throw new BadRequestError("Data pendaftar utama tidak ditemukan atau tidak valid.");
  }

  return normalizeParticipantData(payload);
};

const parseFamilyParticipants = (formData) => {
  const payload = parseJsonFormField(formData, "keluarga", []);
  if (!Array.isArray(payload)) {
    throw new BadRequestError("Data keluarga tidak valid.");
  }

  const familyMembers = payload
    .filter(isPlainObject)
    .map(normalizeParticipantData);

  if (familyMembers.length > MAX_FAMILY_MEMBERS) {
    throw new BadRequestError(`Anggota keluarga maksimal ${MAX_FAMILY_MEMBERS} orang.`);
  }

  return familyMembers;
};

const getGoogleSheetsId = () => {
  const rawValue = process.env.GOOGLE_SHEETS_ID?.trim();
  if (!rawValue) return "";

  const urlMatch = rawValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];

  return rawValue.split(/[/?#]/)[0];
};

const getGoogleDriveFolderId = () => {
  const rawValue = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!rawValue) return "";

  const foldersMatch = rawValue.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (foldersMatch?.[1]) return foldersMatch[1];

  const idParamMatch = rawValue.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (idParamMatch?.[1]) return idParamMatch[1];

  return rawValue.split(/[/?#]/)[0];
};

const isUploadedFile = (file) =>
  file && typeof file.arrayBuffer === "function" && typeof file.name === "string" && file.size > 0;

const safeFileName = (value = "") =>
  String(value)
    .replace(/[^a-zA-Z0-9._ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const getFileExtension = (file) => {
  const fromName = file.name?.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName.toLowerCase();

  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "application/pdf") return ".pdf";
  return "";
};

const uploadFileToDrive = async (drive, file, { folderId, groupId, participantName, documentType }) => {
  if (!isUploadedFile(file)) return "-";
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = getFileExtension(file);
  const nameParts = [
    groupId,
    documentType,
    safeFileName(participantName || "PESERTA"),
  ].filter(Boolean);

  const response = await drive.files.create({
    requestBody: {
      name: `${nameParts.join(" - ")}${extension}`,
      parents: [folderId],
    },
    media: {
      mimeType: file.type || "application/octet-stream",
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`;
};

// Autentikasi OAuth 2.0 (Service Account User Credentials)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN }); // [38, 39]

export async function POST(request) {
  try {
    const formData = await request.formData(); // [40]
    
    // Parsing String JSON dari Frontend
    const pendaftarUtama = parsePrimaryParticipant(formData);
    const keluarga = parseFamilyParticipants(formData);
    const projectPartner = formData.get("project_partner"); // [37]
    const utamaFiles = {
      ktp: formData.get("utama_ktp"),
      paspor: formData.get("utama_paspor"),
      pasporHal4: formData.get("utama_paspor_hal4"),
      resiPaspor: formData.get("utama_resi_paspor"),
    };

    // Generate ID Rombongan Unik
    const ID_PENDAFTARAN_GRUP = `RIDA-${crypto.randomBytes(4).toString("hex")}`;
    const WAKTU_DAFTAR = new Date().toISOString(); // [37]
    const driveFolderId = getGoogleDriveFolderId();
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const uploadParticipantFiles = async (files, participant, label) => ({
      ktp: await uploadFileToDrive(drive, files.ktp, {
        folderId: driveFolderId,
        groupId: ID_PENDAFTARAN_GRUP,
        participantName: participant.namaLengkap,
        documentType: `${label} KTP`,
      }),
      paspor: await uploadFileToDrive(drive, files.paspor, {
        folderId: driveFolderId,
        groupId: ID_PENDAFTARAN_GRUP,
        participantName: participant.namaLengkap,
        documentType: `${label} PASPOR`,
      }),
      pasporHal4: await uploadFileToDrive(drive, files.pasporHal4, {
        folderId: driveFolderId,
        groupId: ID_PENDAFTARAN_GRUP,
        participantName: participant.namaLengkap,
        documentType: `${label} PASPOR HALAMAN 4`,
      }),
      resiPaspor: await uploadFileToDrive(drive, files.resiPaspor, {
        folderId: driveFolderId,
        groupId: ID_PENDAFTARAN_GRUP,
        participantName: participant.namaLengkap,
        documentType: `${label} RESI PASPOR`,
      }),
    });

    const utamaFileLinks = await uploadParticipantFiles(utamaFiles, pendaftarUtama, "PENDAFTAR UTAMA");

    const sheetValues = [];
    
    // Baris 1: Pendaftar Utama
    sheetValues.push([
      ID_PENDAFTARAN_GRUP,                 // A
      WAKTU_DAFTAR,                        // B
      "Pendaftar Utama",                   // C
      projectPartner,                      // D
      pendaftarUtama.whatsapp,             // E
      pendaftarUtama.email || "-",         // F
      pendaftarUtama.nik,                  // G
      pendaftarUtama.namaLengkap,          // H
      pendaftarUtama.statusPaspor === 'READY' ? pendaftarUtama.noPaspor : "MENYUSUL", // I [18, 43]
      pendaftarUtama.statusPaspor === 'READY' ? pendaftarUtama.pasporExpired : "-",   // J
      pendaftarUtama.tanggalLahir || "-",  // K [44]
      pendaftarUtama.jenisKelamin || "-",  // L
      utamaFileLinks.ktp,                  // M
      utamaFileLinks.paspor !== "-" ? utamaFileLinks.paspor : utamaFileLinks.resiPaspor, // N
      utamaFileLinks.pasporHal4,           // O
      pendaftarUtama.ukuranSeragam || "-", // P
      deliveryLabel(pendaftarUtama.perlengkapanIbadah), // Q
      pendaftarUtama.alamatPengiriman || "-",   // R
      pendaftarUtama.kontakPengiriman || "-"    // S
    ]); // [36, 37, 45]

    // Baris 2 - 5: Anggota Keluarga (Di-loop secara dinamis)
    for (const [index, anggota] of keluarga.entries()) {
      const anggotaFiles = {
        ktp: formData.get(`keluarga_${index}_ktp`),
        paspor: formData.get(`keluarga_${index}_paspor`),
        pasporHal4: formData.get(`keluarga_${index}_paspor_hal4`),
        resiPaspor: formData.get(`keluarga_${index}_resi_paspor`),
      };
      const anggotaFileLinks = await uploadParticipantFiles(
        anggotaFiles,
        anggota,
        `ANGGOTA ${index + 1} ${anggota.hubungan || ""}`.trim()
      );

      sheetValues.push([
        ID_PENDAFTARAN_GRUP,
        WAKTU_DAFTAR,
        anggota.hubungan,
        projectPartner,
        "-", // Kontak disamakan dengan utama
        "-",
        anggota.nik,
        anggota.namaLengkap,
        anggota.statusPaspor === 'READY' ? anggota.noPaspor : "MENYUSUL", // [31, 35]
        anggota.statusPaspor === 'READY' ? anggota.pasporExpired : "-",
        anggota.tanggalLahir || "-",
        anggota.jenisKelamin || "-",
        anggotaFileLinks.ktp,
        anggotaFileLinks.paspor !== "-" ? anggotaFileLinks.paspor : anggotaFileLinks.resiPaspor,
        anggotaFileLinks.pasporHal4,
        anggota.ukuranSeragam || "-",
        deliveryLabel(anggota.perlengkapanIbadah),
        anggota.alamatPengiriman || "-",
        anggota.kontakPengiriman || "-"
      ]);
    } // [37]

    // Eksekusi Tembak ke GSheets
    const spreadsheetId = getGoogleSheetsId();
    if (!spreadsheetId) {
      throw new Error("GOOGLE_SHEETS_ID belum dikonfigurasi.");
    }

    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:S", // [46]
      valueInputOption: "USER_ENTERED",
      requestBody: { values: sheetValues },
    });

    return NextResponse.json({ success: true, message: "Data tersimpan aman" });
  } catch (error) {
    console.error("Register Submit Error:", {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      code: error?.code,
      response: error?.response?.data,
    });
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Terjadi kesalahan internal pada server." }, { status: 500 });
  }
}
