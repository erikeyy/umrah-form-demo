"use client"; // [21, 22]
import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation'; // [23]
// ... (Import Icon Lucide React)

export default function UmrahForm() {
  const searchParams = useSearchParams();
  const projectName = searchParams.get('project-name'); // [24]

  // Manajemen State Utama
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(""); // [25]
  
  // State Jemaah Utama (Dilengkapi 5 Data Ekstraksi & Status Paspor)
  const [primary, setPrimary] = useState({
    namaLengkap: '', nik: '', whatsapp: '', 
    noPaspor: '', pasporExpired: '', tanggalLahir: '', 
    jenisKelamin: '', statusPaspor: 'READY' 
  }); // [18, 26]

  const [family, setFamily] = useState([]); // Maks. 4 anggota [20]
  const [files, setFiles] = useState({ ktp: null, paspor: null, pasporHal4: null });
  const [hasPasporHal4, setHasPasporHal4] = useState(false); // [27]

  // Fungsi Submit & Pembangunan Payload
  const onSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const formData = new window.FormData(); // Memaksa penggunaan API Browser [28]
      
      // Deteksi Pintu Pendaftaran (Co-Branding)
      const projectPartner = projectName?.toLowerCase() === 'tira' ? 'Tira Satria Niaga' : 'Reguler';
      formData.append("project_partner", projectPartner); // [15]

      // Ekstraksi Objek Data Jemaah
      const pendaftarUtamaPayload = {
        ...primary, // Sudah mencakup statusPaspor: 'READY'/'PENDING' [26, 29]
        hubungan: "Pendaftar Utama"
      };
      formData.append("pendaftarUtama", JSON.stringify(pendaftarUtamaPayload)); // [30]
      formData.append("keluarga", JSON.stringify(family)); // [30, 31]

      // Lampirkan File Fisik
      formData.append("utama_ktp", files.ktp);
      if (files.paspor) formData.append("utama_paspor", files.paspor);
      if (hasPasporHal4 && files.pasporHal4) formData.append("utama_paspor_hal4", files.pasporHal4);

      // Tembak ke API Server
      const response = await fetch("/api/register", {
        method: "POST",
        body: formData,
      }); // [32]
      
      // Transisi ke Thank You Page...
    } catch (error) {
      setErrorMsg("Gagal memproses data. Coba lagi.");
    }
  };

  return (
    // ... UI Layout dengan Tailwind CSS
    // Kondisional Logo Partner: {projectName?.toLowerCase() === 'tira' ? <img src="/logo-tira.png" /> : <img src="/logo-rida.png" />} [33]
    // Render Pesan Error Tepat Di Atas Tombol Submit: {errorMsg && <div className="bg-red-50 text-red-700">{errorMsg}</div>} [34]
  );
}