import { NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto"; // Untuk ID_PENDAFTARAN_GRUP acak [38]

const deliveryLabel = (value) => {
  if (value === "DIKIRIM") return "Dikirim ke Alamat Tempat Tinggal";
  if (value === "AMBIL_KANTOR") return "Diambil di Kantor RiDATOUR";
  return "-";
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
    const pendaftarUtama = JSON.parse(formData.get("pendaftarUtama"));
    const keluarga = JSON.parse(formData.get("keluarga") || "[]");
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

    // --- PROSES GOOGLE DRIVE & DOCUMENT AI (Background) ---
    // Logika Pengaman AI Bypass:
    // if (pendaftarUtama.statusPaspor !== "MENYUSUL") {
    //    -> Jalankan Document AI OCR Scanner untuk baca MRZ Paspor
    // } else {
    //    -> Bypass AI, ganti penamaan nama file ke "RESI_PASPOR - Nama" [40-42]
    // }

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
      utamaFiles.ktp ? "URL_KTP_DRIVE" : "-", // M
      utamaFiles.paspor ? "URL_PASPOR_UTAMA_DRIVE" : (utamaFiles.resiPaspor ? "URL_RESI_PASPOR_UTAMA_DRIVE" : "-"), // N
      utamaFiles.pasporHal4 ? "URL_PASPOR_HAL4_DRIVE" : "-", // O
      pendaftarUtama.ukuranSeragam || "-", // P
      deliveryLabel(pendaftarUtama.perlengkapanIbadah), // Q
      pendaftarUtama.alamatPengiriman || "-",   // R
      pendaftarUtama.kontakPengiriman || "-"    // S
    ]); // [36, 37, 45]

    // Baris 2 - 5: Anggota Keluarga (Di-loop secara dinamis)
    keluarga.forEach((anggota, index) => {
      const anggotaFiles = {
        ktp: formData.get(`keluarga_${index}_ktp`),
        paspor: formData.get(`keluarga_${index}_paspor`),
        pasporHal4: formData.get(`keluarga_${index}_paspor_hal4`),
        resiPaspor: formData.get(`keluarga_${index}_resi_paspor`),
      };

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
        anggotaFiles.ktp ? "URL_KTP_KELUARGA_DRIVE" : "-",
        anggotaFiles.paspor ? "URL_PASPOR_KELUARGA_DRIVE" : (anggotaFiles.resiPaspor ? "URL_RESI_PASPOR_KELUARGA_DRIVE" : "-"),
        anggotaFiles.pasporHal4 ? "URL_PASPOR_HAL4_KELUARGA_DRIVE" : "-",
        anggota.ukuranSeragam || "-",
        deliveryLabel(anggota.perlengkapanIbadah),
        anggota.alamatPengiriman || "-",
        anggota.kontakPengiriman || "-"
      ]);
    }); // [37]

    // Eksekusi Tembak ke GSheets
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: "Sheet1!A:S", // [46]
      valueInputOption: "USER_ENTERED",
      requestBody: { values: sheetValues },
    });

    return NextResponse.json({ success: true, message: "Data tersimpan aman" });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal pada server." }, { status: 500 });
  }
}
