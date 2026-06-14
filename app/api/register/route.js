// app/api/register/route.js
import { NextResponse } from "next/server";
import crypto from "node:crypto";

const MAX_FAMILY_MEMBERS = 4;
const ACCEPTED_DOCUMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
]);
const ACCEPTED_DOCUMENT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".pdf"]);

const deliveryLabel = (value) => {
  if (value === "DIKIRIM") return "Dikirim ke Alamat Tempat Tinggal";
  if (value === "AMBIL_KANTOR") return "Diambil di Kantor Travel";
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

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatDateForSheet = (value) => {
  if (!value) return "-";

  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const month = MONTH_ABBR[Number(isoMatch[2]) - 1];
    return month ? `${isoMatch[3]}-${month}-${isoMatch[1]}` : raw;
  }

  const displayMatch = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (displayMatch) {
    return `${displayMatch[1].padStart(2, "0")}-${displayMatch[2]}-${displayMatch[3]}`;
  }

  return raw;
};

const isUploadedFile = (file) =>
  file && typeof file.arrayBuffer === "function" && typeof file.name === "string" && file.size > 0;

const getFileExtension = (file) => {
  const fromName = file.name?.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName.toLowerCase();

  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "application/pdf") return ".pdf";
  return "";
};

const assertAcceptedDocumentFile = (file) => {
  const extension = getFileExtension(file);
  const hasAcceptedMime = !file.type || ACCEPTED_DOCUMENT_MIME_TYPES.has(file.type);
  const hasAcceptedExtension = ACCEPTED_DOCUMENT_EXTENSIONS.has(extension);

  if (!hasAcceptedMime || !hasAcceptedExtension) {
    throw new BadRequestError("Format dokumen wajib PNG, JPG, JPEG, atau PDF.");
  }
};

// --- MOCK ENGINE: SIMULASI UPLOAD CLOUD TRANSSETTING ---
const simulateUploadToDrive = async (file, label, docType) => {
  if (!isUploadedFile(file)) return "-";
  assertAcceptedDocumentFile(file);
  
  // Murni simulasi: Mengembalikan Virtual Link tiruan yang UU PDP Compliant
  const mockFileId = crypto.randomBytes(8).toString("hex");
  return `https://drive.google.com/mock-view/gdrive-portfolio-sandbox/${mockFileId}/${file.name}`;
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const action = formData.get("action");

    // =========================================================================
    // SCENARIO 1: MOCK INTERCEPTOR UTK LASER AI OCR SCANNER (PASPOR STEP 3)
    // =========================================================================
    if (action === "ocr") {
      const passportFile = formData.get("file");
      if (!passportFile || !isUploadedFile(passportFile)) {
        throw new BadRequestError("Berkas paspor tidak ditemukan untuk dipindai.");
      }
      assertAcceptedDocumentFile(passportFile);

      // Beri efek jeda buatan (artificial delay) 1.8 detik agar terkesan AI sedang komputasi berat
      await new Promise((resolve) => setTimeout(resolve, 1800));

      // Kumpulan data simulasi ekstraksi MRZ paspor acak berkualitas tinggi
      const mockDatabaseOCR = [
        { namaLengkap: "ERIK JULIANTO DEMO", noPaspor: "X" + Math.floor(1000000 + Math.random() * 9000000), pasporExpired: "2032-08-17" },
        { namaLengkap: "BUDI SANTOSO SANDBOX", noPaspor: "B" + Math.floor(1000000 + Math.random() * 9000000), pasporExpired: "2031-11-12" },
        { namaLengkap: "SITI AMINAH PORTFOLIO", noPaspor: "A" + Math.floor(1000000 + Math.random() * 9000000), pasporExpired: "2033-05-20" }
      ];

      const selectedMock = mockDatabaseOCR[Math.floor(Math.random() * mockDatabaseOCR.length)];

      return NextResponse.json({
        success: true,
        message: "Google Document AI Simulated Successfully (Transient Memory Mode)",
        data: selectedMock
      });
    }

    // =========================================================================
    // SCENARIO 2: MOCK INTEGRASI UTK SUBMIT FINAL (GSHEETS & GDRIVE BYPASS)
    // =========================================================================
    
    // Tetap jalankan validasi & normalisasi data asli dari frontend untuk membuktikan keutuhan logic
    const pendaftarUtama = parsePrimaryParticipant(formData);
    const keluarga = parseFamilyParticipants(formData);
    const projectPartner = formData.get("project_partner") || "cobrand";
    const namaSfc = String(formData.get("nama_sfc") || "").trim() || "-";
    const whatsappSfc = String(formData.get("whatsapp_sfc") || "").trim() || "-";

    const utamaFiles = {
      ktp: formData.get("utama_ktp"),
      kk: formData.get("utama_kk"),
      paspor: formData.get("utama_paspor"),
      pasporHal4: formData.get("utama_paspor_hal4"),
      resiPaspor: formData.get("utama_resi_paspor"),
      bpjs: formData.get("utama_bpjs"),
      eicv: formData.get("utama_eicv"),
    };

    if (!isUploadedFile(utamaFiles.kk)) {
      throw new BadRequestError("Kartu Keluarga pendaftar utama wajib diupload.");
    }

    // Generate Meta Data internal tiruan
    const ID_PENDAFTARAN_GRUP = `KianGroup-${crypto.randomBytes(4).toString("hex")}`;
    const WAKTU_DAFTAR = formatDateForSheet(new Date().toISOString());

    // Simulasi pengunggahan berkas biner pendaftar utama ke Google Drive virtual
    const utamaFileLinks = {
      ktp: await simulateUploadToDrive(utamaFiles.ktp, "PENDAFTAR UTAMA", "KTP"),
      kk: await simulateUploadToDrive(utamaFiles.kk, "PENDAFTAR UTAMA", "KARTU KELUARGA"),
      paspor: await simulateUploadToDrive(utamaFiles.paspor, "PENDAFTAR UTAMA", "PASPOR"),
      pasporHal4: await simulateUploadToDrive(utamaFiles.pasporHal4, "PENDAFTAR UTAMA", "PASPOR HALAMAN 4"),
      resiPaspor: await simulateUploadToDrive(utamaFiles.resiPaspor, "PENDAFTAR UTAMA", "RESI PASPOR"),
      bpjs: await simulateUploadToDrive(utamaFiles.bpjs, "PENDAFTAR UTAMA", "BPJS"),
      eicv: await simulateUploadToDrive(utamaFiles.eicv, "PENDAFTAR UTAMA", "E-ICV MENINGITIS"),
    };

    // Simulasi penyusunan baris data array yang siap ditembak ke Google Sheets Manifes asli
    const simulatedSheetRows = [];
    simulatedMockRowInsert(simulatedSheetRows, {
      idGrup: ID_PENDAFTARAN_GRUP,
      waktu: WAKTU_DAFTAR,
      role: "Pendaftar Utama",
      partner: projectPartner,
      participant: pendaftarUtama,
      links: utamaFileLinks,
      sfcName: namaSfc,
      sfcWa: whatsappSfc
    });

    // Simulasi looping penanganan data dokumen & manifes baris keluarga
    for (const [index, anggota] of keluarga.entries()) {
      const anggotaFiles = {
        ktp: formData.get(`keluarga_${index}_ktp`),
        kk: formData.get(`keluarga_${index}_kk`),
        paspor: formData.get(`keluarga_${index}_paspor`),
        pasporHal4: formData.get(`keluarga_${index}_paspor_hal4`),
        resiPaspor: formData.get(`keluarga_${index}_resi_paspor`),
        bpjs: formData.get(`keluarga_${index}_bpjs`),
        eicv: formData.get(`keluarga_${index}_eicv`),
      };

      if (!isUploadedFile(anggotaFiles.kk)) {
        throw new BadRequestError(`Kartu Keluarga anggota ${index + 1} wajib diupload.`);
      }

      const labelAnggota = `ANGGOTA ${index + 1} ${anggota.hubungan || ""}`.trim();
      const anggotaFileLinks = {
        ktp: await simulateUploadToDrive(anggotaFiles.ktp, labelAnggota, "KTP"),
        kk: await simulateUploadToDrive(anggotaFiles.kk, labelAnggota, "KARTU KELUARGA"),
        paspor: await simulateUploadToDrive(anggotaFiles.paspor, labelAnggota, "PASPOR"),
        pasporHal4: await simulateUploadToDrive(anggotaFiles.pasporHal4, labelAnggota, "PASPOR HALAMAN 4"),
        resiPaspor: await simulateUploadToDrive(anggotaFiles.resiPaspor, labelAnggota, "RESI PASPOR"),
        bpjs: await simulateUploadToDrive(anggotaFiles.bpjs, labelAnggota, "BPJS"),
        eicv: await simulateUploadToDrive(anggotaFiles.eicv, labelAnggota, "E-ICV MENINGITIS"),
      };

      simulatedMockRowInsert(simulatedSheetRows, {
        idGrup: ID_PENDAFTARAN_GRUP,
        waktu: WAKTU_DAFTAR,
        role: anggota.hubungan,
        partner: projectPartner,
        participant: anggota,
        links: anggotaFileLinks,
        sfcName: namaSfc,
        sfcWa: whatsappSfc,
        isFamily: true
      });
    }

    // Beri artificial delay submit final selama 1.5 detik agar visual user experience spinner berputar indah
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Cetak visual simulasi struktur data utuh di log console backend lokal lo buat bukti debugging portfolio
    console.log("=== [SANDBOX MOCK REGISTRATION COMPLIANT UU PDP] ===");
    console.log(`Generated Group ID: ${ID_PENDAFTARAN_GRUP}`);
    console.log("Simulated Matrix Rows to spreadsheet Data:", JSON.stringify(simulatedSheetRows, null, 2));

    return NextResponse.json({
      success: true,
      message: "Simulasi Berhasil! Seluruh berkas biner diuji-unggah secara virtual dan dipetakan ke memori transient (Regulasi UU PDP Terpenuhi).",
      registrationId: ID_PENDAFTARAN_GRUP
    });

  } catch (error) {
    const status = error instanceof BadRequestError ? error.status : 500;
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error di dalam Mock Sandbox." },
      { status }
    );
  }
}

// --- HELPER FUNCTION UNTUK MENYUNSUL STRUKTUR MATRIKS BARIS SHEET TIRUAN ---
function simulatedMockRowInsert(targetArray, { idGrup, waktu, role, partner, participant, links, sfcName, sfcWa, isFamily = false }) {
  targetArray.push([
    idGrup,                                                                        // A
    waktu,                                                                         // B
    role,                                                                          // C
    partner,                                                                       // D
    isFamily ? "-" : (participant.whatsapp || "-"),                                // E
    isFamily ? "-" : (participant.email || "-"),                                   // F
    participant.nik || "-",                                                        // G
    participant.namaLengkap,                                                       // H
    participant.kotaAsal || "-",                                                   // I
    participant.statusPaspor === 'READY' ? participant.noPaspor : "MENYUSUL",      // J
    participant.statusPaspor === 'READY' ? formatDateForSheet(participant.pasporIssued) : "-",  // K
    participant.statusPaspor === 'READY' ? formatDateForSheet(participant.pasporExpired) : "-", // L
    formatDateForSheet(participant.tanggalLahir),                                  // M
    participant.jenisKelamin || "-",                                               // N
    links.ktp,                                                                     // O
    links.paspor !== "-" ? links.paspor : links.resiPaspor,                        // P
    links.pasporHal4,                                                              // Q
    participant.ukuranSeragam || "-",                                              // R
    deliveryLabel(participant.perlengkapanIbadah),                                 // S
    participant.alamatPengiriman || "-",                                           // T
    participant.kontakPengiriman || "-",                                           // U
    sfcName,                                                                       // V
    sfcWa,                                                                         // W
    links.kk,                                                                      // X
    links.bpjs,                                                                    // Y
    links.eicv                                                                     // Z
  ]);
}