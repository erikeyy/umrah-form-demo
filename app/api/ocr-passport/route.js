// app/api/ocr-passport/route.js
import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB [11]
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "application/pdf"]);

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

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    // 1. Validasi Keberadaan Berkas
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File paspor tidak ditemukan." }, { status: 400 });
    }

    // 2. Validasi Batasan Ukuran Dokumen (Maks 15MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ukuran file maksimal 15MB." }, { status: 400 });
    }

    // 3. Guarding Filter MIME-Type Dokumen
    if (file.type && !ACCEPTED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({
        error: "Format wajib .jpeg, .jpg, .png, atau .pdf.",
      }, { status: 415 });
    }

    // =========================================================================
    // SIMULASI GOOGLE DOCUMENT AI PASSPORT PROCESSOR (Rp0 - TRANSIENT MODE)
    // =========================================================================
    
    // Memberikan jeda waktu buatan (artificial delay) 1.8 detik di sisi server
    // untuk menyimulasikan komputasi kluster AI Google yang sesungguhnya.
    await new Promise((resolve) => setTimeout(resolve, 1800));

    // Kumpulan database data tiruan (Realistik Passport Dataset) untuk auto-fill
    const mockPassportPool = [
      {
        passportNumber: "A" + Math.floor(1000000 + Math.random() * 9000000),
        fullName: "ERIK JULIANTO DEMO",
        nationality: "IDN",
        dateOfBirth: "17-Aug-1998",
        placeOfBirth: "JAKARTA",
        gender: "L",
        issueDate: "12-Dec-2022",
        expiryDate: "12-Dec-2032",
        mrz: "P<IDNKEYY<<ERIK<JULIANTO<<<<<<<<<<<<<<<<<<\nA" + Math.floor(1000000) + "7IDN9808174M3212125<<<<<<<<<<<<<<02"
      },
      {
        passportNumber: "B" + Math.floor(1000000 + Math.random() * 9000000),
        fullName: "SITI AMINAH SANDBOX",
        nationality: "IDN",
        dateOfBirth: "20-May-1995",
        placeOfBirth: "SURABAYA",
        gender: "P",
        issueDate: "15-Jan-2024",
        expiryDate: "15-Jan-2034",
        mrz: "P<IDNAMINAH<<SITI<<<<<<<<<<<<<<<<<<<<<<<<<<\nB" + Math.floor(1000000) + "4IDN9505207F3401156<<<<<<<<<<<<<<04"
      },
      {
        passportNumber: "X" + Math.floor(1000000 + Math.random() * 9000000),
        fullName: "BUDI SANTOSO PORTFOLIO",
        nationality: "IDN",
        dateOfBirth: "10-Nov-1990",
        placeOfBirth: "BANDUNG",
        gender: "L",
        issueDate: "23-Jun-2023",
        expiryDate: "23-Jun-2033",
        mrz: "P<IDNSANTOSO<<BUDI<<<<<<<<<<<<<<<<<<<<<<<<<\nX" + Math.floor(1000000) + "2IDN9011105M3306231<<<<<<<<<<<<<<06"
      }
    ];

    // Ambil data paspor simulasi secara acak setiap kali pengunjung mengunggah berkas
    const selectedPassport = mockPassportPool[Math.floor(Math.random() * mockPassportPool.length)];

    // Cetak ke log terminal server lokal lo sebagai indikator debugging portfolio yang sukses
    console.log(`[OCR MOCK PASSPORT] Berhasil menyimulasikan pembacaan file: ${file.name}`);
    console.log("Returned Payload Data:", selectedPassport);

    return NextResponse.json({ 
      success: true, 
      data: selectedPassport 
    });

  } catch (error) {
    console.error("Google Passport OCR Mock Error:", error);
    return NextResponse.json({
      error: "Gagal membaca data paspor melalui Google Cloud. Silakan isi manual.",
      data: { ...PASSPORT_OUTPUT_EMPTY },
    }, { status: 500 });
  }
}