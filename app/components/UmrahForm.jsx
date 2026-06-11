"use client"; // [21, 22]
import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation'; // [23]
import { UploadCloud, CheckCircle2, AlertCircle, Plus, Trash2, ChevronRight, ChevronLeft, FileText, CheckSquare, Square, Scan, Loader2, ShieldCheck } from 'lucide-react'; // [11, 12]
// ... (Import Icon Lucide React)

const MAX_FILE_SIZE = 15 * 1024 * 1024; // Maksimal 15MB [11]
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf']; // [11]

// Fungsi validasi masa berlaku paspor (Minimal 6 Bulan) [13, 14]
const isValidPassport = (dateString) => {
  if (!dateString) return false;
  const selectedDate = new Date(dateString);
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  return selectedDate > sixMonthsFromNow;
}; // [13, 14]

export default function UmrahForm() {
  // Penangkap Parameter URL Dinamis untuk Co-Branding [7, 10, 15]
  const searchParams = useSearchParams();
  const projectName = searchParams.get('project-name'); // [7]

  // Manajemen State Utama
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(""); // [25]
  const [isSuccess, setIsSuccess] = useState(false); // [16]
  
  // State Jemaah Utama (Dilengkapi 5 Data Ekstraksi & Status Paspor)
  const [primary, setPrimary] = useState({
    namaLengkap: '', nik: '', whatsapp: '',email: '', 
    noPaspor: '', pasporExpired: '', tanggalLahir: '', 
    jenisKelamin: '', statusPaspor: 'READY' 
  }); // [18, 26]

  // State Rombongan (Maks. 4 Anggota) & File Dokumen [8, 20]
  const [family, setFamily] = useState([]); // [8]
  const [files, setFiles] = useState({ ktp: null, paspor: null, pasporHal4: null }); // [20]
  const [hasPasporHal4, setHasPasporHal4] = useState(false); // [20]
  const [isScanning, setIsScanning] = useState(false); // [21]
  const [ocrSuccess, setOcrSuccess] = useState(false); // [21]
  const [errors, setErrors] = useState({}); // [21]

    // --- HANDLER FUNGSI UI ---
  const handlePrimaryChange = (e) => {
    const { name, value } = e.target;
    setPrimary(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  }; // [21, 22]

  const addFamilyMember = () => {
    if (family.length < 4) {
      setFamily(prev => [...prev, { 
        id: Date.now(), namaLengkap: '', nik: '', hubungan: '', 
        noPaspor: '', pasporExpired: '', tanggalLahir: '', 
        jenisKelamin: '', statusPaspor: 'READY' 
      }]);
    }
  }; // [21, 22]

  const removeFamilyMember = (id) => setFamily(prev => prev.filter(member => member.id !== id)); // [23]

  const togglePasporHal4 = () => {
    setHasPasporHal4(!hasPasporHal4);
    if (!hasPasporHal4) {
      setFiles(prev => ({ ...prev, pasporHal4: null }));
      setErrors(prev => ({ ...prev, pasporHal4: null }));
    }
  }; // [23]

  // --- FUNGSI SUBMIT KE BACKEND ---
  const onSubmit = async (e) => {
    e.preventDefault(); // [20]
    // if (!validateStep3()) return; // Pastikan validasi berjalan sebelum submit [24]
    
    setIsSubmitting(true); // [20]
    setErrorMsg(""); // [20]

    try {
      // WAJIB menggunakan window.FormData agar Next.js mengambil API bawaan browser [20, 25]
      const formData = new window.FormData(); 
      
      // Deteksi Pintu Pendaftaran (Co-Branding) [20]
      const projectPartner = projectName?.toLowerCase() === 'tira' ? 'Tira Satria Niaga' : 'Reguler'; // [20]
      formData.append("project_partner", projectPartner); // [26]

      // Ekstraksi Objek Data Jemaah Utama [26]
      const pendaftarUtamaPayload = {
        ...primary, 
        hubungan: "Pendaftar Utama"
      }; // [26]
      formData.append("pendaftarUtama", JSON.stringify(pendaftarUtamaPayload)); // [26]
      formData.append("keluarga", JSON.stringify(family)); // [26]

      // Lampirkan File Fisik Biner [26, 27]
      if (files.ktp) formData.append("utama_ktp", files.ktp);
      if (files.paspor) formData.append("utama_paspor", files.paspor);
      if (hasPasporHal4 && files.pasporHal4) formData.append("utama_paspor_hal4", files.pasporHal4);

      // Eksekusi tembakan ke API Server Next.js [27]
      const response = await fetch("/api/register", {
        method: "POST",
        body: formData,
      }); // [27]
      
      if (response.ok) {
         setIsSuccess(true); // Transisi ke Thank You Page [27, 28]
      } else {
         setErrorMsg("Gagal mengirim data. Silakan coba lagi.");
      }
    } catch (error) {
      setErrorMsg("Terjadi kesalahan sistem. Coba lagi."); // [27]
    } finally {
      setIsSubmitting(false);
    }
  };

  // Jika sukses, render Halaman Thank You
  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center p-10 h-screen bg-slate-50">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-800">Pendaftaran Diterima !</h1>
        <h1 className="text-2xl font-bold text-slate-800">Selamat! Anda telah begabung menjadi Keluarga Besar RiDATOUR dan Umroh Tira Satria Niaga Tahun 2026</h1>
        <p className="text-slate-500 text-center mt-2">Terimakasih telah melakukan pendaftaran! Data Anda tersimpan dengan aman di database RiDATOUR.</p>
      </div>
    );
  }

  // --- RENDER UI UTAMA ---
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* HEADER DINAMIS (Co-Branding) */}
        <div className="text-center p-8 bg-slate-50 border-b">
          <div className="flex items-center justify-center w-full mb-6">
             {/* Box Logo Proporsional Anti-Pecah */}
             <div className="w-40 h-20 bg-white rounded-xl shadow-sm border p-2 flex items-center justify-center">
               {projectName?.toLowerCase() === 'tira' ? (
                 <img src="/logo-tira.png" alt="Tira Satria Niaga" className="max-w-full max-h-full object-contain" />
               ) : (
                 <img src="/logo-rida.png" alt="RiDATOUR" className="max-w-full max-h-full object-contain" />
               )}
             </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">
             {projectName?.toLowerCase() === 'tira' ? "Program Khusus Tira Satria Niaga" : "Formulir Pendaftaran Umroh"}
          </h2>
          <p className="text-sm text-slate-500 mt-2">Treat you like family</p>
        </div>

        {/* CONTAINER FORM */}
        <div className="p-8">
           {/* Step 1: Data Diri */}
           {step === 1 && (
             <div className="space-y-6 animate-in fade-in duration-300">
               <div className="border-b pb-2">
                 <h3 className="text-lg font-bold text-slate-800">Data Pendaftar Utama</h3>
                 <p className="text-sm text-slate-500">Pastikan data yang diisi sesuai dengan dokumen identitas asli.</p>
               </div>

               <div className="space-y-4">
                 {/* Input NIK */}
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">NIK KTP (16 Digit)</label>
                   <input 
                     type="text" 
                     name="nik" 
                     value={primary.nik} 
                     onChange={handlePrimaryChange} 
                     placeholder="Masukkan 16 digit NIK"
                     className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all"
                   />
                   {errors.nik && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.nik}</span>}
                 </div>

                 {/* Input Nama Lengkap */}
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                   <input 
                     type="text" 
                     name="namaLengkap" 
                     value={primary.namaLengkap} 
                     onChange={handlePrimaryChange} 
                     placeholder="Nama lengkap sesuai KTP"
                     className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all"
                   />
                   {errors.namaLengkap && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.namaLengkap}</span>}
                 </div>

                 {/* Input WhatsApp */}
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Nomor WhatsApp</label>
                   <input 
                     type="text" 
                     name="whatsapp" 
                     value={primary.whatsapp} 
                     onChange={handlePrimaryChange} 
                     placeholder="Contoh: 08123456789"
                     className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all"
                   />
                   {errors.whatsapp && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.whatsapp}</span>}
                 </div>

                 {/* Input Email (Khusus Pendaftar Utama) */}
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Email</label>
                   <input 
                     type="email" 
                     name="email" 
                     value={primary.email} 
                     onChange={handlePrimaryChange} 
                     placeholder="Contoh: email@domain.com"
                     className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all"
                   />
                   {errors.email && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.email}</span>}
                 </div>
               </div>
                 {/* --- MULAI BLOK KELUARGA (Dalam Step 1) --- */}
                 {family.length > 0 && (
                   <div className="mt-8 border-t pt-6">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">Data Anggota Keluarga</h3>
                     
                     {family.map((member, index) => (
                       <div key={member.id} className="relative mb-6 border border-slate-200 rounded-xl p-5 bg-white shadow-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
                         {/* Tombol Hapus Keluarga */}
                         <button type="button" onClick={() => removeFamilyMember(member.id)} className="absolute top-4 right-4 text-red-500 hover:bg-red-50 p-2 rounded-md transition-colors">
                           <Trash2 className="w-5 h-5" />
                         </button>
                         
                         <h4 className="font-bold text-slate-700 mb-4">Anggota #{index + 1}</h4>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">Status Hubungan</label>
                             <select
                               value={member.hubungan}
                               onChange={(e) => handleFamilyChange(member.id, 'hubungan', e.target.value)}
                               className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 transition-all"
                             >
                               <option value="">Pilih Hubungan</option>
                               <option value="Suami">Suami</option>
                               <option value="Istri">Istri</option>
                               <option value="Anak">Anak</option>
                               <option value="Lainnya">Lainnya</option>
                             </select>
                           </div>
                           <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">NIK KTP (16 Digit)</label>
                             <input
                               type="text"
                               value={member.nik}
                               onChange={(e) => handleFamilyChange(member.id, 'nik', e.target.value)}
                               placeholder="Masukkan NIK"
                               className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 transition-all"
                             />
                           </div>
                           <div className="md:col-span-2">
                             <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                             <input
                               type="text"
                               value={member.namaLengkap}
                               onChange={(e) => handleFamilyChange(member.id, 'namaLengkap', e.target.value)}
                               placeholder="Nama sesuai KTP"
                               className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-600 transition-all"
                             />
                           </div>

                           {/* SAKLAR PASPOR KELUARGA (Backend Bypass Guard) */}
                           <div className="md:col-span-2 mt-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                             <label className="block text-sm font-medium text-slate-700 mb-3">Status Paspor Anggota Ini</label>
                             <div className="flex flex-col sm:flex-row gap-3">
                               <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-all ${member.statusPaspor === 'READY' ? 'border-purple-600 bg-purple-50 text-purple-700 font-medium' : 'border-slate-200 bg-white'}`}>
                                 <input type="radio" name={`paspor-${member.id}`} className="hidden" checked={member.statusPaspor === 'READY'} onChange={() => handleFamilyChange(member.id, 'statusPaspor', 'READY')} />
                                 Sudah Punya Paspor
                               </label>
                               <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-all ${member.statusPaspor === 'PENDING' ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 bg-white'}`}>
                                 <input type="radio" name={`paspor-${member.id}`} className="hidden" checked={member.statusPaspor === 'PENDING'} onChange={() => handleFamilyChange(member.id, 'statusPaspor', 'PENDING')} />
                                 Sedang Dibuat / Menyusul
                               </label>
                             </div>
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}

                 {/* Tombol Aksi Tambah Keluarga (Maks 4) */}
                 {family.length < 4 && (
                   <button type="button" onClick={addFamilyMember} className="mt-4 w-full py-4 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-all flex items-center justify-center font-medium">
                     <Plus className="w-5 h-5 mr-2" />
                     Tambah Anggota Keluarga (Sisa kuota: {4 - family.length})
                   </button>
                 )}
                 {/* --- AKHIR BLOK KELUARGA --- */}
           )}

           {/* Step 2: Validasi Kepemilikan Paspor Utama */}
           {step === 2 && (
             <div className="space-y-6 animate-in fade-in duration-300">
               <div className="border-b pb-2">
                 <h3 className="text-lg font-bold text-slate-800">Kepemilikan Paspor Pendaftar Utama</h3>
                 <p className="text-sm text-slate-500">Tentukan status paspor Anda. Sistem akan menyesuaikan dokumen yang wajib diunggah.</p>
               </div>

               <div className="flex flex-col sm:flex-row gap-4 mt-6">
                 {/* Opsi A: READY (AI Scanner Aktif) */}
                 <label className={`flex-1 flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all ${primary.statusPaspor === 'READY' ? 'border-purple-600 bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-300'}`}>
                   <input 
                     type="radio" 
                     name="statusPasporPrimary" 
                     className="hidden" 
                     checked={primary.statusPaspor === 'READY'} 
                     onChange={() => {
                        setPrimary(prev => ({ ...prev, statusPaspor: 'READY' }));
                        setOcrSuccess(false); // Mengaktifkan mode Laser AI di Step 3
                     }} 
                   />
                   <CheckSquare className={`w-8 h-8 mb-3 ${primary.statusPaspor === 'READY' ? 'text-purple-600' : 'text-slate-400'}`} />
                   <span className={`font-bold text-lg ${primary.statusPaspor === 'READY' ? 'text-purple-800' : 'text-slate-600'}`}>Paspor Sudah Ready</span>
                   <span className="text-xs text-slate-500 text-center mt-2 px-2">Sistem otomatis memindai data paspor Anda.</span>
                 </label>

                 {/* Opsi B: PENDING (AI Scanner BYPASS) */}
                 <label className={`flex-1 flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all ${primary.statusPaspor === 'PENDING' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                   <input 
                     type="radio" 
                     name="statusPasporPrimary" 
                     className="hidden" 
                     checked={primary.statusPaspor === 'PENDING'} 
                     onChange={() => {
                        setPrimary(prev => ({ ...prev, statusPaspor: 'PENDING' }));
                        // 🔥 BYPASS AI SCANNER: Langsung buka kartu verifikasi data di step 3
                        setOcrSuccess(true); 
                     }} 
                   />
                   <FileText className={`w-8 h-8 mb-3 ${primary.statusPaspor === 'PENDING' ? 'text-amber-600' : 'text-slate-400'}`} />
                   <span className={`font-bold text-lg ${primary.statusPaspor === 'PENDING' ? 'text-amber-800' : 'text-slate-600'}`}>Menyusul / Sedang Proses</span>
                   <span className="text-xs text-slate-500 text-center mt-2 px-2">Bypass AI Scanner. Isi manual Nama, Tgl Lahir & Jenis Kelamin.</span>
                 </label>
               </div>
             </div>
           )}


           {/* Notifikasi Error diposisikan taktis di atas tombol agar tidak merusak layout [29] */}
           {errorMsg && (
             <div className="bg-red-50 text-red-700 p-3 rounded-lg mt-6 mb-4 flex items-center">
               <AlertCircle className="w-5 h-5 mr-2" /> {errorMsg}
             </div>
           )}

           {/* FOOTER NAVIGASI TOMBOL */}
           <div className="mt-8 flex justify-between border-t pt-6">
             <button type="button" onClick={() => setStep(prev => prev - 1)} disabled={step === 1} className="px-6 py-2 border rounded-lg text-slate-600 disabled:opacity-50">
               Kembali
             </button>
             
             {step < 3 ? (
               <button type="button" onClick={() => setStep(prev => prev + 1)} className="px-6 py-2 bg-purple-600 text-white rounded-lg">
                 Lanjut
               </button>
             ) : (
               <button type="button" onClick={onSubmit} disabled={isSubmitting} className="px-6 py-2 bg-purple-600 text-white rounded-lg flex items-center">
                 {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                 Kirim Pendaftaran
               </button>
             )}
           </div>

           {/* Lencana Keamanan Terenkripsi [30, 31] */}
           <div className="mt-6 flex items-center justify-center text-xs text-slate-400">
             <ShieldCheck className="w-4 h-4 mr-1 text-green-500" />
             Standar Keamanan Terenkripsi
           </div>

        </div>
      </div>
    </div>
  );
}
}