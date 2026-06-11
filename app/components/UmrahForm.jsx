"use client";

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UploadCloud, CheckCircle2, AlertCircle, Plus, Trash2, ChevronRight, ChevronLeft, FileText, CheckSquare, Square, Scan, Loader2, ShieldCheck } from 'lucide-react';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Fungsi Validasi Masa Berlaku Paspor
const isValidPassport = (dateString) => {
  if (!dateString) return false;
  const selectedDate = new Date(dateString);
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  return selectedDate > sixMonthsFromNow;
};

export default function UmrahForm() {
  const searchParams = useSearchParams();
  const projectName = searchParams.get('project-name');

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // State Jemaah Utama (Sesuai Form Baru)
  const [primary, setPrimary] = useState({
    namaLengkap: '', nik: '', whatsapp: '', email: '',
    noPaspor: '', pasporExpired: '', tanggalLahir: '',
    jenisKelamin: '', statusPaspor: 'READY'
  });

  const [family, setFamily] = useState([]);
  const [files, setFiles] = useState({ ktp: null, paspor: null, pasporHal4: null });
  const [hasPasporHal4, setHasPasporHal4] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  const handlePrimaryChange = (e) => {
    const { name, value } = e.target;
    setPrimary(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleFamilyChange = (id, field, value) => {
    setFamily(prev => prev.map(member => member.id === id ? { ...member, [field]: value } : member));
  };

  const addFamilyMember = () => {
    if (family.length < 4) {
      setFamily(prev => [...prev, {
        id: Date.now(), namaLengkap: '', nik: '', hubungan: '',
        noPaspor: '', pasporExpired: '', tanggalLahir: '',
        jenisKelamin: '', statusPaspor: 'READY'
      }]);
    }
  };

  const removeFamilyMember = (id) => setFamily(prev => prev.filter(member => member.id !== id));

  const togglePasporHal4 = () => {
    setHasPasporHal4(!hasPasporHal4);
    if (hasPasporHal4) {
      setFiles(prev => ({ ...prev, pasporHal4: null }));
      setErrors(prev => ({ ...prev, pasporHal4: null }));
    }
  };

  const simulatePassportOCR = (file) => {
    setIsScanning(true);
    setOcrSuccess(false);
    setTimeout(() => {
      setPrimary(prev => ({
        ...prev,
        namaLengkap: prev.namaLengkap || "ERIK JULIANTO",
        noPaspor: "X1234567",
        pasporExpired: "2031-06-10",
        tanggalLahir: "1990-01-01",
        jenisKelamin: "L"
      }));
      setIsScanning(false);
      setOcrSuccess(true);
      setErrors(prev => ({ ...prev, pasporExpired: null, noPaspor: null, namaLengkap: null, tanggalLahir: null, jenisKelamin: null }));
    }, 1500);
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files;
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setErrors(prev => ({ ...prev, [type]: 'Ukuran file maksimal 15MB!' }));
      return;
    }
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setErrors(prev => ({ ...prev, [type]: 'Format wajib .jpeg, .jpg, .png, atau .pdf!' }));
      return;
    }
    setFiles(prev => ({ ...prev, [type]: file }));
    setErrors(prev => ({ ...prev, [type]: null }));
    if (type === 'paspor') simulatePassportOCR(file);
  };

  // 👇 PERBAIKAN LOGIKA: Keluarga divalidasi di Step 1 & Regex dikembalikan ke Form Baru
  const validateStep1 = () => {
    const newErrors = {};
    if (!/^\d{16}$/.test(primary.nik)) newErrors.nik = "NIK wajib 16 digit angka";
    
    // 👇 INI REGEX ASLI YANG BENAR (MENGEMBALIKAN LOGIKA DARI FORM LAMA/BARU LO)
    if (!/^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(primary.whatsapp)) newErrors.whatsapp = "Format WA tidak valid (Contoh: 0812...)";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
    

    
    // Logika keluarga ditarik dari validateStep2 ke sini
    family.forEach((member, index) => {
      if (!member.hubungan) newErrors[`fam_${index}_hub`] = "Hubungan wajib diisi";
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    return true; // Step 2 hanya radio button Kepemilikan Paspor, selalu valid
  };

  const validateStep3 = () => {
    const newErrors = {};
    if (!files.ktp) newErrors.ktp = "KTP wajib diupload";
    
    if (primary.statusPaspor === 'READY') {
      if (!files.paspor) newErrors.paspor = "Paspor wajib diupload";
      if (!primary.noPaspor) newErrors.noPaspor = "Nomor paspor wajib diisi";
      if (!isValidPassport(primary.pasporExpired)) newErrors.pasporExpired = "Paspor harus berlaku > 6 bulan";
    }

    if (hasPasporHal4 && !files.pasporHal4) newErrors.pasporHal4 = "File Halaman 4 wajib diupload (opsi tercentang)";
    
    if (primary.namaLengkap.length < 3) newErrors.namaLengkap = "Nama harus diperiksa & dilengkapi";
    if (!primary.tanggalLahir) newErrors.tanggalLahir = "Tanggal lahir wajib diisi";
    if (!primary.jenisKelamin) newErrors.jenisKelamin = "Jenis kelamin wajib dipilih";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
  };
  
  const prevStep = () => setStep(prev => prev - 1);

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof validateStep3 === 'function' && !validateStep3()) return;
    
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const formData = new window.FormData(); 
      
      const projectPartner = projectName?.toLowerCase() === 'tira' ? 'Tira Satria Niaga' : 'Reguler';
      formData.append("project_partner", projectPartner);

      // Sesuai dengan payload Form Baru (tanpa toUpperCase/MENYUSUL di frontend)
      const pendaftarUtamaPayload = {
        ...primary,
        hubungan: "Pendaftar Utama"
      };
      
      formData.append("pendaftarUtama", JSON.stringify(pendaftarUtamaPayload));
      formData.append("keluarga", JSON.stringify(family));

      if (files.ktp) formData.append("utama_ktp", files.ktp);
      if (files.paspor) formData.append("utama_paspor", files.paspor);
      if (hasPasporHal4 && files.pasporHal4) formData.append("utama_paspor_hal4", files.pasporHal4);

      const response = await fetch("/api/register", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal mengirim pendaftaran ke server.");
      
      setIsSuccess(true);
    } catch (err) {
      console.error("Submission Error: ", err);
      setErrorMsg(err.message || "Koneksi bermasalah, silakan coba beberapa saat lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="max-w-2xl w-full bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-3">Pendaftaran Diterima!</h2>
          <p className="text-slate-600 mb-2">
            Selamat! Anda telah bergabung menjadi Keluarga Besar RiDATOUR 
            {projectName?.toLowerCase() === 'tira' && " dan Program Umroh Tira Satria Niaga"} Tahun 2026.
          </p>
          <p className="text-slate-500 text-sm mb-8">Terima kasih telah melakukan pendaftaran! Data Anda tersimpan dengan aman di database kami.</p>
          <button onClick={() => window.location.reload()} className="w-full py-4 bg-[#6D28D9] text-white font-bold rounded-xl hover:bg-[#5b21b6] transition-colors shadow-md">
            Selesai
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 font-sans text-slate-800">
      <div className="max-w-2xl mx-auto">
        
        {/* ================= HEADER MELAYANG (FLOATING) ================= */}
        <div className="text-center mb-8">
          {projectName?.toLowerCase() === "tira" ? (
            <div className="flex items-center justify-center space-x-3 sm:space-x-5 mb-6">
              <div className="w-32 h-16 sm:w-40 sm:h-20 flex items-center justify-center p-2 bg-white rounded-xl shadow-sm border border-slate-100 transition-all hover:shadow-md">
                <img src="/logo-rida.png" alt="RiDATOUR" className="max-w-full max-h-full object-contain drop-shadow-sm" />
              </div>
              <span className="text-slate-300 font-black text-xl sm:text-2xl">X</span>
              <div className="w-32 h-16 sm:w-40 sm:h-20 flex items-center justify-center p-2 bg-white rounded-xl shadow-sm border border-slate-100 transition-all hover:shadow-md">
                <img src="/logo-tira.png" alt="Mitra Partner" className="max-w-full max-h-full object-contain drop-shadow-sm" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center mb-6">
              <div className="w-48 h-24 sm:w-56 sm:h-28 flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md">
                <img src="/logo-rida.png" alt="RiDATOUR" className="max-w-full max-h-full object-contain drop-shadow-md" />
              </div>
            </div>
          )}
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Form Pendaftaran Umroh</h1>
          {projectName?.toLowerCase() === "tira" ? (
            <p className="text-[#6D28D9] font-bold mt-3 bg-purple-100 inline-block px-5 py-1.5 rounded-full text-sm shadow-sm border border-purple-200">
              Program Khusus Tira Satria Niaga
            </p>
          ) : (
            <p className="text-[#eab308] font-medium mt-2">Treat you like family</p>
          )}
        </div>

        {/* ================= KARTU FORM UTAMA (ROUNDED 3XL) ================= */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 overflow-hidden border border-slate-100">
          
          {/* PROGRESS BAR ABSOLUT (Desain Lama) */}
          <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-8 pt-6 pb-10">
            <div className="relative max-w-[85%] mx-auto">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0">
                <div 
                  className="h-full bg-[#6D28D9] rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${((step - 1) / 2) * 100}%` }} 
                />
              </div>
              <div className="relative z-10 flex justify-between">
                {[ { num: 1, label: 'Data & Keluarga' }, { num: 2, label: 'Status Paspor' }, { num: 3, label: 'Dokumen' } ].map((item) => (
                  <div key={item.num} className="flex flex-col items-center relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${step >= item.num ? 'bg-[#6D28D9] text-white shadow-md shadow-purple-200' : 'bg-white border-2 border-slate-200 text-slate-400'}`}>
                      {item.num}
                    </div>
                    <span className={`absolute top-10 text-[11px] sm:text-xs font-semibold whitespace-nowrap text-center ${step >= item.num ? 'text-[#6D28D9]' : 'text-slate-500'}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-8">
            
            {/* ================= STEP 1: DATA PENDAFTAR & KELUARGA (Kata-kata dari Form Baru) ================= */}
            {step === 1 && (
              <div className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
                
                {/* Blok Pendaftar Utama */}
                <div className="space-y-4">
                  <div className="border-b border-slate-700 pb-2 mb-6">
                    <h3 className="text-lg font-bold text-slate-800">Data Pendaftar Utama</h3>
                    <p className="text-sm text-slate-500 mt-1">Pastikan data yang diisi sesuai dengan dokumen identitas asli.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">NIK KTP (16 Digit)</label>
                      <input type="text" name="nik" value={primary.nik} onChange={handlePrimaryChange} maxLength="16" className="w-full p-3 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#6D28D9] focus:border-transparent outline-none transition-all" placeholder="Masukkan 16 digit NIK" />
                      {errors.nik && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.nik}</span>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                      <input type="text" name="namaLengkap" value={primary.namaLengkap} onChange={handlePrimaryChange} className="w-full p-3 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#6D28D9] focus:border-transparent outline-none transition-all" placeholder="Nama lengkap sesuai KTP" />
                      {errors.namaLengkap && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.namaLengkap}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nomor WhatsApp</label>
                      <input type="tel" name="whatsapp" value={primary.whatsapp} onChange={handlePrimaryChange} className="w-full p-3 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#6D28D9] focus:border-transparent outline-none transition-all" placeholder="Contoh: 08123456789" />
                      {errors.whatsapp && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.whatsapp}</span>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Email</label>
                      <input type="email" name="email" value={primary.email} onChange={handlePrimaryChange} className="w-full p-3 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#6D28D9] focus:border-transparent outline-none transition-all" placeholder="Contoh: email@domain.com" />
                      {errors.email && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Blok Anggota Keluarga */}
                {family.length > 0 && (
                  <div className="mt-8 border-t pt-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Data Anggota Keluarga</h3>
                    {family.map((member, index) => (
                      <div key={member.id} className="relative mb-6 border border-slate-200 rounded-xl p-5 bg-white shadow-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
                        <button type="button" onClick={() => removeFamilyMember(member.id)} className="absolute top-4 right-4 text-red-500 hover:bg-red-50 p-2 rounded-md transition-colors"><Trash2 className="w-5 h-5" /></button>
                        <h4 className="font-bold text-slate-700 mb-4">Anggota #{index + 1}</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Status Hubungan</label>
                            <select value={member.hubungan} onChange={(e) => handleFamilyChange(member.id, 'hubungan', e.target.value)} className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all">
                              <option value="">Pilih Hubungan</option>
                              <option value="Suami">Suami</option><option value="Istri">Istri</option><option value="Anak">Anak</option><option value="Lainnya">Lainnya</option>
                            </select>
                            {errors[`fam_${index}_hub`] && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors[`fam_${index}_hub`]}</span>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">NIK KTP (16 Digit)</label>
                            <input type="text" value={member.nik} onChange={(e) => handleFamilyChange(member.id, 'nik', e.target.value)} maxLength="16" className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all" placeholder="Masukkan NIK" />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                            <input type="text" value={member.namaLengkap} onChange={(e) => handleFamilyChange(member.id, 'namaLengkap', e.target.value)} className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all" placeholder="Nama sesuai KTP" />
                          </div>
                          
                          {/* SAKLAR PASPOR KELUARGA */}
                          <div className="md:col-span-2 mt-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <label className="block text-sm font-medium text-slate-700 mb-3">Status Paspor Anggota Ini</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                              <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-all ${member.statusPaspor === 'READY' ? 'border-[#6D28D9] bg-[#6D28D9]/10 text-[#6D28D9] font-medium' : 'border-slate-200 bg-white'}`}>
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

                {family.length < 4 && (
                  <button type="button" onClick={addFamilyMember} className="mt-4 w-full py-4 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl hover:border-[#6D28D9] hover:text-[#6D28D9] hover:bg-[#6D28D9]/5 transition-all flex items-center justify-center font-medium">
                    <Plus className="w-5 h-5 mr-2" /> Tambah Anggota Keluarga (Sisa kuota: {4 - family.length})
                  </button>
                )}
              </div>
            )}

            {/* ================= STEP 2: STATUS PASPOR UTAMA (Kata-kata dari Form Baru) ================= */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b pb-2">
                  <h3 className="text-lg font-bold text-slate-800">Kepemilikan Paspor Pendaftar Utama</h3>
                  <p className="text-sm text-slate-500">Tentukan status paspor Anda. Sistem akan menyesuaikan dokumen yang wajib diunggah.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 mt-6">
                  {/* Opsi READY */}
                  <label className={`flex-1 flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all ${primary.statusPaspor === 'READY' ? 'border-[#6D28D9] bg-[#6D28D9]/5' : 'border-slate-200 bg-white hover:border-[#6D28D9]/30'}`}>
                    <input type="radio" name="statusPasporPrimary" className="hidden" checked={primary.statusPaspor === 'READY'} 
                      onChange={() => { setPrimary(prev => ({ ...prev, statusPaspor: 'READY' })); setOcrSuccess(false); }} 
                    />
                    <CheckSquare className={`w-8 h-8 mb-3 ${primary.statusPaspor === 'READY' ? 'text-[#6D28D9]' : 'text-slate-400'}`} />
                    <span className={`font-bold text-lg ${primary.statusPaspor === 'READY' ? 'text-[#6D28D9]' : 'text-slate-600'}`}>Paspor Sudah Ready</span>
                    <span className="text-xs text-slate-500 text-center mt-2 px-2">Sistem otomatis memindai data paspor Anda.</span>
                  </label>
                  
                  {/* Opsi PENDING */}
                  <label className={`flex-1 flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all ${primary.statusPaspor === 'PENDING' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                    <input type="radio" name="statusPasporPrimary" className="hidden" checked={primary.statusPaspor === 'PENDING'} 
                      onChange={() => { setPrimary(prev => ({ ...prev, statusPaspor: 'PENDING' })); setOcrSuccess(true); }} 
                    />
                    <FileText className={`w-8 h-8 mb-3 ${primary.statusPaspor === 'PENDING' ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span className={`font-bold text-lg ${primary.statusPaspor === 'PENDING' ? 'text-amber-800' : 'text-slate-600'}`}>Menyusul / Sedang Proses</span>
                    <span className="text-xs text-slate-500 text-center mt-2 px-2">Bypass AI Scanner. Isi manual Nama, Tgl Lahir & Jenis Kelamin.</span>
                  </label>
                </div>
              </div>
            )}

            {/* ================= STEP 3: UPLOAD DOKUMEN (Kata-kata dari Form Baru) ================= */}
            {step === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="border-b pb-2">
                  <h2 className="text-xl font-bold text-slate-800">Upload Dokumen & Auto-Fill</h2>
                  <p className="text-sm text-slate-500">Sistem akan mengekstrak data dari paspor Anda secara otomatis.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* UPLOAD KTP */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Foto KTP Utama</label>
                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${files.ktp ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                      {files.ktp ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{files.ktp.name}</p> : <><UploadCloud className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload KTP</p></>}
                      <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'ktp')} />
                    </label>
                    {errors.ktp && <p className="text-red-500 text-xs">{errors.ktp}</p>}
                  </div>

                  {/* UPLOAD PASPOR KONDISIONAL */}
                  {primary.statusPaspor === 'READY' ? (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <label className="block text-sm font-semibold text-slate-700 flex items-center">Foto Paspor Utama <Scan size={14} className="ml-1 text-[#6D28D9]" /></label>
                      <label className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer overflow-hidden transition-colors ${files.paspor && !isScanning ? 'border-green-400 bg-green-50' : isScanning ? 'border-[#6D28D9] bg-[#6D28D9]/5' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                        <div className="flex flex-col items-center justify-center z-10">
                          {isScanning ? <><Loader2 className="w-8 h-8 text-[#6D28D9] animate-spin mb-2" /><p className="text-sm text-[#6D28D9] font-semibold">Membaca Data...</p></>
                          : files.paspor ? <p className="text-sm text-green-700 font-medium text-center px-4 line-clamp-2">{files.paspor.name}</p>
                          : <><FileText className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload Paspor</p></>}
                        </div>
                        {isScanning && <div className="absolute top-0 left-0 w-full h-1 bg-[#6D28D9] shadow-[0_0_8px_#6D28D9] animate-scan" />}
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'paspor')} disabled={isScanning} />
                      </label>
                      {errors.paspor && <p className="text-red-500 text-xs">{errors.paspor}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <label className="block text-sm font-semibold text-slate-700">Foto Bukti Resi Pendaftaran Imigrasi (Opsional)</label>
                      <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${files.pasporHal4 ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                        {files.pasporHal4 ? <p className="text-xs text-amber-700 font-medium px-4 text-center line-clamp-2">{files.pasporHal4.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-400">Upload Berkas Resi (Jika ada)</p></>}
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'pasporHal4')} />
                      </label>
                      <p className="text-[11px] text-slate-400 italic">*Langkah ini bisa dilewati jika belum melakukan wawancara/foto di kantor Imigrasi.</p>
                    </div>
                  )}
                </div>

                {/* KARTU VERIFIKASI DATA IDENTITAS */}
                {(ocrSuccess || primary.statusPaspor === 'PENDING') && (
                  <div className="bg-[#6D28D9]/5 border border-[#6D28D9]/20 rounded-2xl p-5 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center text-[#6D28D9] font-bold mb-1">
                      <Scan size={18} className="mr-2" /> {primary.statusPaspor === 'READY' ? 'Verifikasi Data Paspor' : 'Lengkapi Data Identitas Jemaah'}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Sesuai KTP / Paspor</label>
                        <input type="text" name="namaLengkap" value={primary.namaLengkap} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm uppercase font-medium" />
                        {errors.namaLengkap && <p className="text-red-500 text-xs mt-0.5">{errors.namaLengkap}</p>}
                      </div>
                      
                      {primary.statusPaspor === 'READY' && (
                        <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Paspor</label>
                            <input type="text" name="noPaspor" value={primary.noPaspor} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm uppercase tracking-wider font-medium" />
                            {errors.noPaspor && <p className="text-red-500 text-xs mt-0.5">{errors.noPaspor}</p>}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Kedaluwarsa</label>
                            <input type="date" name="pasporExpired" value={primary.pasporExpired} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium" />
                            {errors.pasporExpired && <p className="text-red-500 text-xs mt-0.5">{errors.pasporExpired}</p>}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
                          <input type="date" name="tanggalLahir" value={primary.tanggalLahir || ""} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium" />
                          {errors.tanggalLahir && <p className="text-red-500 text-xs mt-0.5">{errors.tanggalLahir}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                          <select name="jenisKelamin" value={primary.jenisKelamin || ""} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium bg-white">
                            <option value="">Pilih...</option>
                            <option value="L">Laki-laki (Male)</option>
                            <option value="P">Perempuan (Female)</option>
                          </select>
                          {errors.jenisKelamin && <p className="text-red-500 text-xs mt-0.5">{errors.jenisKelamin}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CHECKBOX HALAMAN 4 */}
                {primary.statusPaspor === 'READY' && (
                  <div className="mt-6 p-4 border border-slate-200 rounded-2xl bg-slate-50 animate-in fade-in duration-200">
                    <label className="flex items-start cursor-pointer group">
                      <button type="button" onClick={togglePasporHal4} className="mt-0.5 text-[#6D28D9] flex-shrink-0 transition-transform group-hover:scale-110">
                        {hasPasporHal4 ? <CheckSquare size={20} /> : <Square size={20} />}
                      </button>
                      <div className="ml-3">
                        <span className="block text-sm font-semibold text-slate-800">Terdapat Penambahan Nama (Halaman 4 Paspor)</span>
                      </div>
                    </label>
                    {hasPasporHal4 && (
                      <div className="mt-4 animate-in fade-in duration-150">
                        <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer ${files.pasporHal4 ? 'border-purple-400 bg-purple-50' : 'border-purple-200 bg-white'}`}>
                          {files.pasporHal4 ? <p className="text-xs text-purple-700 font-medium">{files.pasporHal4.name}</p> : <p className="text-xs text-purple-600">Upload Halaman 4 Paspor</p>}
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'pasporHal4')} />
                        </label>
                        {errors.pasporHal4 && <p className="text-red-500 text-xs mt-1">{errors.pasporHal4}</p>}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ERROR NOTIFICATION */}
            {errorMsg && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg mt-6 mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 shrink-0" /> {errorMsg}
              </div>
            )}

            {/* FOOTER NAVIGASI TOMBOL (Sesuai gaya form lama namun chunky) */}
            <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
              {step > 1 ? (
                <button type="button" onClick={prevStep} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 flex items-center transition-colors">
                  <ChevronLeft size={18} className="mr-1.5" /> Kembali
                </button>
              ) : <div/>}

              {step < 3 ? (
                <button type="button" onClick={nextStep} className="px-8 py-3 bg-[#6D28D9] text-white font-bold tracking-wide rounded-xl hover:bg-[#5b21b6] shadow-md shadow-purple-200 transition-all flex items-center">
                  Lanjut <ChevronRight size={18} className="ml-1.5" />
                </button>
              ) : (
                <button type="button" onClick={onSubmit} disabled={isSubmitting || isScanning} className="px-8 py-3 bg-[#eab308] text-slate-900 font-bold tracking-wide rounded-xl hover:bg-[#dca507] shadow-md shadow-yellow-200 transition-all flex items-center disabled:opacity-70">
                  {isSubmitting ? <><Loader2 size={18} className="mr-2 animate-spin" /> Memproses...</> : <><CheckCircle2 size={18} className="mr-2" /> Kirim Pendaftaran</>}
                </button>
              )}
            </div>

          </div>
        </div>

        {/* LENCANA STANDAR KEAMANAN */}
        <div className="mt-8 mb-4 flex flex-col items-center justify-center text-slate-500">
          <div className="flex items-center justify-center mb-2 text-green-700 bg-green-50 px-5 py-2 rounded-full border border-green-200 shadow-sm">
            <ShieldCheck size={18} className="mr-2" />
            <span className="text-xs font-bold tracking-wider uppercase">Standar Keamanan Terenkripsi</span>
          </div>
          <p className="text-xs text-center mt-1 max-w-md">Kerahasiaan data dilindungi. Dokumen hanya digunakan untuk keperluan pendaftaran.</p>
        </div>

      </div>
    </div>
  );
}