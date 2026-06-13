"use client";

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UploadCloud, CheckCircle2, AlertCircle, Plus, Trash2, ChevronRight, ChevronLeft, FileText, CheckSquare, Square, Scan, Loader2, ShieldCheck } from 'lucide-react';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const OCR_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const TOTAL_STEPS = 4;
const MAX_FAMILY_MEMBERS = 4;
const SERAGAM_OPTIONS = [
  { value: 'XS', label: 'XS', detail: 'LD 86-90 cm, panjang 64-66 cm' },
  { value: 'S', label: 'S', detail: 'LD 90-94 cm, panjang 66-68 cm' },
  { value: 'M', label: 'M', detail: 'LD 94-98 cm, panjang 68-70 cm' },
  { value: 'L', label: 'L', detail: 'LD 98-104 cm, panjang 70-72 cm' },
  { value: 'XL', label: 'XL', detail: 'LD 104-110 cm, panjang 72-74 cm' },
  { value: 'XXL', label: 'XXL', detail: 'LD 110-118 cm, panjang 74-76 cm' },
  { value: 'XXXL', label: 'XXXL', detail: 'LD 118-126 cm, panjang 76-78 cm' },
];
const DELIVERY_OPTIONS = {
  DIKIRIM: 'Dikirim ke Alamat Tempat Tinggal',
  AMBIL_KANTOR: 'Diambil di Kantor RiDATOUR',
};
const NAME_FILLER_NOISE = /^[CLKI]+$/;
const NAME_OCR_FIXES = new Map([
  ['SERIK', 'ERIK'],
  ['NYULIANTO', 'YULIANTO'],
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

const normalizeParticipantData = (participant) => ({
  ...(participant || {}),
  namaLengkap: cleanParticipantName(participant?.namaLengkap),
  noPaspor: participant?.noPaspor?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "",
  kotaAsal: participant?.kotaAsal?.trim() || "",
});

const MONTH_INDEX = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

const toHtmlDateValue = (value = "") => {
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const displayDate = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!displayDate) return "";

  const month = MONTH_INDEX[displayDate[2].toLowerCase()];
  if (!month) return "";

  return `${displayDate[3]}-${month}-${displayDate[1].padStart(2, "0")}`;
};

const formatDateForDisplay = (value = "") => {
  const htmlDate = toHtmlDateValue(value);
  const match = htmlDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "-";

  const month = Object.entries(MONTH_INDEX).find(([, number]) => number === match[2])?.[0];
  if (!month) return value || "-";

  return `${match[3]}-${month.charAt(0).toUpperCase()}${month.slice(1)}-${match[1]}`;
};

const normalizePassportReaderData = (data = {}) => ({
  namaLengkap: data.fullName || data.namaLengkap || "",
  noPaspor: data.passportNumber || data.noPaspor || "",
  pasporIssued: toHtmlDateValue(data.issueDate || data.pasporIssued),
  pasporExpired: toHtmlDateValue(data.expiryDate || data.pasporExpired),
  tanggalLahir: toHtmlDateValue(data.dateOfBirth || data.tanggalLahir),
  jenisKelamin: data.gender || data.jenisKelamin || "",
  tempatLahir: data.placeOfBirth || data.tempatLahir || "",
});

const isParticipantObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readApiResponse = async (response, fallbackMessage) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  const bodyText = await response.text().catch(() => "");
  console.error("Unexpected non-JSON response:", {
    status: response.status,
    contentType,
    bodyPreview: bodyText.slice(0, 200),
  });

  throw new Error(
    response.status === 413
      ? "Ukuran total file terlalu besar untuk server. Kompres dokumen atau upload file yang lebih kecil."
      : fallbackMessage
  );
};

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
  const projectName = searchParams.get('project-name') || 'Reguler';
  const isTiraProject = projectName?.toLowerCase() === 'tira';

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [sfcInfo, setSfcInfo] = useState({
    namaSfc: '',
    whatsappSfc: '',
  });

  // State Jemaah Utama (Sesuai Form Baru)
  const [primary, setPrimary] = useState({
    namaLengkap: '', nik: '', whatsapp: '', email: '',
    noPaspor: '', pasporIssued: '', pasporExpired: '', tanggalLahir: '',
    jenisKelamin: '', tempatLahir: '', statusPaspor: 'READY',
    kotaAsal: '',
    ukuranSeragam: '', perlengkapanIbadah: '',
    alamatPengiriman: '', kontakPengiriman: ''
  });

  const [family, setFamily] = useState([]);
  const [documents, setDocuments] = useState({
    primary: { ktp: null, kk: null, paspor: null, pasporHal4: null, bpjs: null, eicv: null },
    family: {}
  });
  const [hasPasporHal4, setHasPasporHal4] = useState(false);
  
  const [scanningKey, setScanningKey] = useState(null);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const isScanning = Boolean(scanningKey);

  const handlePrimaryChange = (e) => {
    const { name, value } = e.target;
    setPrimary(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleSfcChange = (e) => {
    const { name, value } = e.target;
    setSfcInfo(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleFamilyChange = (id, field, value) => {
    setFamily(prev => prev.map(member => member.id === id ? { ...member, [field]: value } : member));
    const memberIndex = family.findIndex(member => member.id === id);
    const errorKey = memberIndex >= 0 ? `fam_${memberIndex}_${field}` : null;
    if (errorKey && errors[errorKey]) setErrors(prev => ({ ...prev, [errorKey]: null }));
  };

  const addFamilyMember = () => {
    setFamily(prev => {
      if (prev.length >= MAX_FAMILY_MEMBERS) return prev;

      return [...prev, {
        id: `${Date.now()}-${prev.length}`, namaLengkap: '', nik: '', hubungan: '',
        noPaspor: '', pasporIssued: '', pasporExpired: '', tanggalLahir: '',
        jenisKelamin: '', tempatLahir: '', statusPaspor: 'READY',
        kotaAsal: '',
        hasPasporHal4: false,
        ukuranSeragam: '', perlengkapanIbadah: '',
        alamatPengiriman: '', kontakPengiriman: ''
      }];
    });
  };

  const removeFamilyMember = (id) => {
    setFamily(prev => prev.filter(member => member.id !== id));
    setDocuments(prev => {
      const nextFamilyDocuments = { ...prev.family };
      delete nextFamilyDocuments[id];
      return { ...prev, family: nextFamilyDocuments };
    });
  };

  const togglePasporHal4 = () => {
    setHasPasporHal4(!hasPasporHal4);
    if (hasPasporHal4) {
      setDocuments(prev => ({ ...prev, primary: { ...prev.primary, pasporHal4: null } }));
      setErrors(prev => ({ ...prev, pasporHal4: null }));
    }
  };

  const toggleFamilyPasporHal4 = (id, index) => {
    const member = family.find(item => item.id === id);
    const nextValue = !member?.hasPasporHal4;

    setFamily(prev => prev.map(item => item.id === id ? { ...item, hasPasporHal4: nextValue } : item));

    if (!nextValue) {
      setDocuments(prev => {
        const currentMemberDocuments = prev.family[id] || { ktp: null, paspor: null, pasporHal4: null };
        return {
          ...prev,
          family: {
            ...prev.family,
            [id]: { ...currentMemberDocuments, pasporHal4: null }
          }
        };
      });
      setErrors(prev => ({ ...prev, [`fam_${index}_pasporHal4`]: null }));
    }
  };

  const scanPassportOCR = async (file, options = {}) => {
    const { owner = 'primary', memberId = null, index = null } = options;
    const scanKey = owner === 'family' ? `family-${memberId}` : 'primary';

    setScanningKey(scanKey);
    if (owner === 'primary') setOcrSuccess(false);

    try {
      if (!OCR_FILE_TYPES.includes(file.type)) {
        throw new Error('OCR otomatis hanya mendukung JPG/JPEG/PNG/PDF. Silakan isi data paspor manual.');
      }

      const formData = new window.FormData();
      formData.append('file', file);

      const response = await fetch('/api/ocr-passport', {
        method: 'POST',
        body: formData,
      });

      const result = await readApiResponse(response, 'Data paspor belum terbaca. Silakan isi manual.');
      if (!response.ok) throw new Error(result.error || 'Data paspor belum terbaca.');

      const ocrData = normalizePassportReaderData(result.data || {});

      if (owner === 'family') {
        setFamily(prev => prev.map(member => member.id === memberId ? {
          ...member,
          namaLengkap: cleanParticipantName(ocrData.namaLengkap) || member.namaLengkap,
          noPaspor: ocrData.noPaspor || member.noPaspor,
          pasporIssued: ocrData.pasporIssued || member.pasporIssued,
          pasporExpired: ocrData.pasporExpired || member.pasporExpired,
          tanggalLahir: ocrData.tanggalLahir || member.tanggalLahir,
          jenisKelamin: ocrData.jenisKelamin || member.jenisKelamin,
          tempatLahir: ocrData.tempatLahir || member.tempatLahir,
        } : member));
        setErrors(prev => ({
          ...prev,
          [`fam_${index}_paspor`]: null,
          [`fam_${index}_noPaspor`]: null,
          [`fam_${index}_pasporIssued`]: null,
          [`fam_${index}_pasporExpired`]: null,
          [`fam_${index}_tanggalLahir`]: null,
          [`fam_${index}_jenisKelamin`]: null,
          [`fam_${index}_tempatLahir`]: null,
          [`fam_${index}_ocr`]: null,
        }));
      } else {
        setPrimary(prev => ({
          ...prev,
          namaLengkap: cleanParticipantName(ocrData.namaLengkap) || prev.namaLengkap,
          noPaspor: ocrData.noPaspor || prev.noPaspor,
          pasporIssued: ocrData.pasporIssued || prev.pasporIssued,
          pasporExpired: ocrData.pasporExpired || prev.pasporExpired,
          tanggalLahir: ocrData.tanggalLahir || prev.tanggalLahir,
          jenisKelamin: ocrData.jenisKelamin || prev.jenisKelamin,
          tempatLahir: ocrData.tempatLahir || prev.tempatLahir,
        }));
        setOcrSuccess(true);
        setErrors(prev => ({ ...prev, ocr: null, pasporIssued: null, pasporExpired: null, noPaspor: null, namaLengkap: null, tanggalLahir: null, jenisKelamin: null, tempatLahir: null }));
      }
    } catch (err) {
      if (owner === 'family') {
        setErrors(prev => ({ ...prev, [`fam_${index}_ocr`]: err.message || 'Data paspor belum terbaca. Silakan isi manual.' }));
      } else {
        setOcrSuccess(true);
        setErrors(prev => ({ ...prev, ocr: err.message || 'Data paspor belum terbaca. Silakan isi manual.' }));
      }
    } finally {
      setScanningKey(null);
    }
  };

  const getParticipantDocuments = (current = {}) => ({
    ktp: null,
    kk: null,
    paspor: null,
    pasporHal4: null,
    bpjs: null,
    eicv: null,
    ...current,
  });

  const getFamilyDocuments = (id) => getParticipantDocuments(documents.family[id]);

  const handleFileChange = (e, type, options = {}) => {
    const { owner = 'primary', memberId = null, errorKey = type } = options;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setErrors(prev => ({ ...prev, [errorKey]: 'Ukuran file maksimal 15MB!' }));
      return;
    }
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setErrors(prev => ({ ...prev, [errorKey]: 'Format wajib .jpeg, .jpg, .png, atau .pdf!' }));
      return;
    }
    setDocuments(prev => {
      if (owner === 'family') {
        const currentMemberDocuments = getParticipantDocuments(prev.family[memberId]);
        return {
          ...prev,
          family: {
            ...prev.family,
            [memberId]: { ...currentMemberDocuments, [type]: file }
          }
        };
      }

      return { ...prev, primary: { ...getParticipantDocuments(prev.primary), [type]: file } };
    });
    setErrors(prev => ({ ...prev, [errorKey]: null }));
    if (type === 'paspor') scanPassportOCR(file, { owner, memberId, index: options.index });
  };

  const validateStep1 = () => {
    const newErrors = {};
    if (isTiraProject && !sfcInfo.namaSfc.trim()) newErrors.namaSfc = "Nama SFC wajib diisi";
    if (isTiraProject && !/^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(sfcInfo.whatsappSfc)) newErrors.whatsappSfc = "Format WA SFC tidak valid (Contoh: 0812...)";
    if (!/^\d{16}$/.test(primary.nik)) newErrors.nik = "NIK wajib 16 digit angka";
    if (!/^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(primary.whatsapp)) newErrors.whatsapp = "Format WA tidak valid (Contoh: 0812...)";
    if (!primary.kotaAsal.trim()) newErrors.kotaAsal = "Kota asal wajib diisi";
    if (family.length > MAX_FAMILY_MEMBERS) newErrors.familyLimit = `Anggota keluarga maksimal ${MAX_FAMILY_MEMBERS} orang`;

    family.forEach((member, index) => {
      if (!isParticipantObject(member)) {
        newErrors[`fam_${index}_namaLengkap`] = "Data anggota keluarga tidak valid";
        return;
      }

      if (!member.hubungan) newErrors[`fam_${index}_hub`] = "Hubungan wajib diisi";
      if (!/^\d{16}$/.test(member.nik || "")) newErrors[`fam_${index}_nik`] = "NIK wajib 16 digit angka";
      if ((member.namaLengkap || "").length < 3) newErrors[`fam_${index}_namaLengkap`] = "Nama wajib diisi";
      if (!member.kotaAsal?.trim()) newErrors[`fam_${index}_kotaAsal`] = "Kota asal wajib diisi";
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    return true; // Step 2 hanya radio button Kepemilikan Paspor, selalu valid
  };

  const validateStep3 = () => {
    const newErrors = {};
    if (!documents.primary.ktp) newErrors.ktp = "KTP wajib diupload";
    if (!documents.primary.kk) newErrors.kk = "Kartu Keluarga wajib diupload";
    if (family.length > MAX_FAMILY_MEMBERS) newErrors.familyLimit = `Anggota keluarga maksimal ${MAX_FAMILY_MEMBERS} orang`;
    
    if (primary.statusPaspor === 'READY') {
      if (!documents.primary.paspor) newErrors.paspor = "Paspor wajib diupload";
      if (!primary.noPaspor) newErrors.noPaspor = "Nomor paspor wajib diisi";
      if (!isValidPassport(primary.pasporExpired)) newErrors.pasporExpired = "Paspor harus berlaku > 6 bulan";
    }

    if (hasPasporHal4 && !documents.primary.pasporHal4) newErrors.pasporHal4 = "File Halaman 4 wajib diupload (opsi tercentang)";
    
    if (primary.namaLengkap.length < 3) newErrors.namaLengkap = "Nama harus diperiksa & dilengkapi";
    if (!primary.tanggalLahir) newErrors.tanggalLahir = "Tanggal lahir wajib diisi";
    if (!primary.jenisKelamin) newErrors.jenisKelamin = "Jenis kelamin wajib dipilih";

    family.forEach((member, index) => {
      if (!isParticipantObject(member)) {
        newErrors[`fam_${index}_namaLengkap`] = "Data anggota keluarga tidak valid";
        return;
      }

      const memberDocuments = getFamilyDocuments(member.id);
      if (!memberDocuments.ktp) newErrors[`fam_${index}_ktp`] = "KTP anggota wajib diupload";
      if (!memberDocuments.kk) newErrors[`fam_${index}_kk`] = "Kartu Keluarga wajib diupload";

      if (member.statusPaspor === 'READY') {
        if (!memberDocuments.paspor) newErrors[`fam_${index}_paspor`] = "Paspor anggota wajib diupload";
        if (!member.noPaspor) newErrors[`fam_${index}_noPaspor`] = "Nomor paspor wajib diisi";
        if (!isValidPassport(member.pasporExpired)) newErrors[`fam_${index}_pasporExpired`] = "Paspor harus berlaku > 6 bulan";
      }

      if (member.hasPasporHal4 && !memberDocuments.pasporHal4) newErrors[`fam_${index}_pasporHal4`] = "File Halaman 4 wajib diupload";
      if ((member.namaLengkap || "").length < 3) newErrors[`fam_${index}_namaLengkap`] = "Nama harus diperiksa & dilengkapi";
      if (!member.tanggalLahir) newErrors[`fam_${index}_tanggalLahir`] = "Tanggal lahir wajib diisi";
      if (!member.jenisKelamin) newErrors[`fam_${index}_jenisKelamin`] = "Jenis kelamin wajib dipilih";
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep4 = () => {
    const newErrors = {};
    if (family.length > MAX_FAMILY_MEMBERS) newErrors.familyLimit = `Anggota keluarga maksimal ${MAX_FAMILY_MEMBERS} orang`;

    const validateParticipant = (participant, prefix) => {
      if (!isParticipantObject(participant)) {
        newErrors[`${prefix}_namaLengkap`] = "Data peserta tidak valid";
        return;
      }

      if (!participant.ukuranSeragam) newErrors[`${prefix}_ukuranSeragam`] = "Ukuran seragam wajib dipilih";
      if (!participant.kotaAsal?.trim()) newErrors[`${prefix}_kotaAsal`] = "Kota asal wajib diisi";
      if (!participant.perlengkapanIbadah) newErrors[`${prefix}_perlengkapanIbadah`] = "Pilihan perlengkapan ibadah wajib dipilih";
      if (participant.perlengkapanIbadah === 'DIKIRIM') {
        if (!participant.alamatPengiriman?.trim()) newErrors[`${prefix}_alamatPengiriman`] = "Alamat lengkap wajib diisi";
        if (!/^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(participant.kontakPengiriman || '')) {
          newErrors[`${prefix}_kontakPengiriman`] = "Nomor yang dapat dihubungi tidak valid";
        }
      }
    };

    validateParticipant(primary, 'primary');
    family.forEach((member, index) => validateParticipant(member, `fam_${index}`));

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
    if (step === 3 && validateStep3()) {
      setPrimary(prev => normalizeParticipantData(prev));
      setFamily(prev => prev.map(normalizeParticipantData));
      setStep(4);
    }
  };
  
  const prevStep = () => setStep(prev => prev - 1);

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validateStep4()) return;
    
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const formData = new window.FormData(); 
      
      const projectPartner = isTiraProject ? 'Tira Satria Niaga' : 'Reguler';
      formData.append("project_partner", projectPartner);
      formData.append("nama_sfc", sfcInfo.namaSfc.trim());
      formData.append("whatsapp_sfc", sfcInfo.whatsappSfc.trim());
      const finalPrimary = normalizeParticipantData(primary);
      const finalFamily = family
        .filter(isParticipantObject)
        .slice(0, MAX_FAMILY_MEMBERS)
        .map(normalizeParticipantData);

      if (family.length > MAX_FAMILY_MEMBERS) {
        throw new Error(`Anggota keluarga maksimal ${MAX_FAMILY_MEMBERS} orang.`);
      }

      // Sesuai dengan payload Form Baru (tanpa toUpperCase/MENYUSUL di frontend)
      const pendaftarUtamaPayload = {
        ...finalPrimary,
        hubungan: "Pendaftar Utama"
      };
      
      formData.append("pendaftarUtama", JSON.stringify(pendaftarUtamaPayload));
      formData.append("keluarga", JSON.stringify(finalFamily));

      if (documents.primary.ktp) formData.append("utama_ktp", documents.primary.ktp);
      if (documents.primary.kk) formData.append("utama_kk", documents.primary.kk);
      if (documents.primary.paspor) formData.append("utama_paspor", documents.primary.paspor);
      if (hasPasporHal4 && documents.primary.pasporHal4) formData.append("utama_paspor_hal4", documents.primary.pasporHal4);
      if (finalPrimary.statusPaspor === 'PENDING' && documents.primary.pasporHal4) formData.append("utama_resi_paspor", documents.primary.pasporHal4);
      if (documents.primary.bpjs) formData.append("utama_bpjs", documents.primary.bpjs);
      if (documents.primary.eicv) formData.append("utama_eicv", documents.primary.eicv);

      finalFamily.forEach((member, index) => {
        const memberDocuments = getFamilyDocuments(member.id);
        if (memberDocuments.ktp) formData.append(`keluarga_${index}_ktp`, memberDocuments.ktp);
        if (memberDocuments.kk) formData.append(`keluarga_${index}_kk`, memberDocuments.kk);
        if (memberDocuments.paspor) formData.append(`keluarga_${index}_paspor`, memberDocuments.paspor);
        if (member.hasPasporHal4 && memberDocuments.pasporHal4) formData.append(`keluarga_${index}_paspor_hal4`, memberDocuments.pasporHal4);
        if (member.statusPaspor === 'PENDING' && memberDocuments.pasporHal4) formData.append(`keluarga_${index}_resi_paspor`, memberDocuments.pasporHal4);
        if (memberDocuments.bpjs) formData.append(`keluarga_${index}_bpjs`, memberDocuments.bpjs);
        if (memberDocuments.eicv) formData.append(`keluarga_${index}_eicv`, memberDocuments.eicv);
      });

      const response = await fetch("/api/register", {
        method: "POST",
        body: formData,
      });

      const result = await readApiResponse(response, "Gagal mengirim pendaftaran ke server.");
      if (!response.ok) throw new Error(result.error || "Gagal mengirim pendaftaran ke server.");
      
      setIsSuccess(true);
    } catch (err) {
      console.error("Submission Error: ", err);
      setErrorMsg(err.message || "Koneksi bermasalah, silakan coba beberapa saat lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const allParticipants = [
    { ...normalizeParticipantData(primary), hubungan: "Pendaftar Utama", prefix: "primary" },
    ...family.map((member, index) => ({ ...normalizeParticipantData(member), prefix: `fam_${index}` }))
  ];

  const getSizeDetail = (size) => SERAGAM_OPTIONS.find(option => option.value === size)?.detail || "-";
  const getDeliveryLabel = (value) => DELIVERY_OPTIONS[value] || "-";

  const updateParticipantField = (participant, field, value) => {
    const nextValues = field === 'perlengkapanIbadah' && value !== 'DIKIRIM'
      ? { [field]: value, alamatPengiriman: '', kontakPengiriman: '' }
      : { [field]: value };

    if (participant.prefix === 'primary') {
      setPrimary(prev => ({ ...prev, ...nextValues }));
    } else {
      setFamily(prev => prev.map(member => member.id === participant.id ? { ...member, ...nextValues } : member));
    }
    const errorKeys = [`${participant.prefix}_${field}`];
    if (field === 'perlengkapanIbadah') {
      errorKeys.push(`${participant.prefix}_alamatPengiriman`, `${participant.prefix}_kontakPengiriman`);
    }
    setErrors(prev => errorKeys.reduce((acc, key) => ({ ...acc, [key]: null }), prev));
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
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-purple-100 bg-white p-6 text-center shadow-2xl shadow-slate-900/20">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#6D28D9]" />
            <p className="text-lg font-bold text-slate-900">Passport sedang dipindai</p>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto">
        
        {/* ================= HEADER MELAYANG (FLOATING) ================= */}
        <div className="text-center mb-8">
          {isTiraProject ? (
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
            {isTiraProject ? (
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
                  style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }} 
                />
              </div>
              <div className="relative z-10 flex justify-between">
                {[ { num: 1, label: 'Data & Keluarga' }, { num: 2, label: 'Status Paspor' }, { num: 3, label: 'Dokumen' }, { num: 4, label: 'Review' } ].map((item) => (
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
                {isTiraProject && <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-5 space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Umroh RiDATOUR bersama Tira Satria Niaga</h3>
                    <p className="text-sm font-semibold text-[#6D28D9] mt-1">Estimasi Keberangkatan 12 Agustus 2026</p>
                  </div>

                  <div className="rounded-xl bg-white/80 border border-purple-100 p-4 space-y-3 text-sm text-slate-700">
                    <p className="font-bold text-slate-800">Informasi Kontak</p>
                    <p>
                      Informasi dan konfirmasi pengiriman Dokumen dan Perlengkapan Ibadah:{" "}
                      <span className="font-semibold">Bpk Memed Meidi</span>{" "}
                      <a className="font-bold text-[#6D28D9] hover:underline" href="https://wa.me/6281315588744?text=Assalamu%E2%80%99alaikum%20Pak%20Memed,%20Saya%20SFC%20-%20%5BNama%20SFC%5D,%20mau%20konfirmasi%20pengiriman%20Dokumen%20dan%20Perlengkapan%20Ibadah.%20" target="_blank" rel="noreferrer">+62 813-1558-8744</a>
                    </p>
                    <p>
                      Informasi Program Keberangkatan:{" "}
                      <span className="font-semibold">Mas Erik Julianto</span>{" "}
                      <a className="font-bold text-[#6D28D9] hover:underline" href="https://wa.me/62818970910?text=Assalamu%E2%80%99alaikum%20Mas%20Erik,%20Saya%20%5BNama%20SFC/Nama%20Anda%5D,%20saya%20mau%20tanya%20untuk%20keberangkatan%20Umroh%20Tira%202026" target="_blank" rel="noreferrer">+62 818-970-910</a>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Nama SFC</label>
                      <input type="text" name="namaSfc" value={sfcInfo.namaSfc} onChange={handleSfcChange} className="w-full p-3 rounded-lg border border-purple-200 bg-white focus:ring-2 focus:ring-[#6D28D9] outline-none transition-all" placeholder="Tuliskan nama anda" />
                      {errors.namaSfc && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.namaSfc}</span>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">No WhatsApp SFC</label>
                      <input type="tel" name="whatsappSfc" value={sfcInfo.whatsappSfc} onChange={handleSfcChange} className="w-full p-3 rounded-lg border border-purple-200 bg-white focus:ring-2 focus:ring-[#6D28D9] outline-none transition-all" placeholder="Contoh: 08123456789" />
                      {errors.whatsappSfc && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.whatsappSfc}</span>}
                    </div>
                  </div>
                </div>}
                
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kota Asal Peserta</label>
                      <input type="text" name="kotaAsal" value={primary.kotaAsal} onChange={handlePrimaryChange} className="w-full p-3 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#6D28D9] focus:border-transparent outline-none transition-all" placeholder="Contoh: Bandung" />
                      {errors.kotaAsal && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors.kotaAsal}</span>}
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
                            {errors[`fam_${index}_nik`] && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors[`fam_${index}_nik`]}</span>}
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                            <input type="text" value={member.namaLengkap} onChange={(e) => handleFamilyChange(member.id, 'namaLengkap', e.target.value)} className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all" placeholder="Nama sesuai KTP" />
                            {errors[`fam_${index}_namaLengkap`] && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors[`fam_${index}_namaLengkap`]}</span>}
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Kota Asal Peserta</label>
                            <input type="text" value={member.kotaAsal || ""} onChange={(e) => handleFamilyChange(member.id, 'kotaAsal', e.target.value)} className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all" placeholder="Contoh: Bandung" />
                            {errors[`fam_${index}_kotaAsal`] && <span className="text-red-500 text-xs mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{errors[`fam_${index}_kotaAsal`]}</span>}
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

                {family.length < MAX_FAMILY_MEMBERS && (
                  <button type="button" onClick={addFamilyMember} className="mt-4 w-full py-4 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl hover:border-[#6D28D9] hover:text-[#6D28D9] hover:bg-[#6D28D9]/5 transition-all flex items-center justify-center font-medium">
                    <Plus className="w-5 h-5 mr-2" /> Tambah Anggota Keluarga (Sisa kuota: {MAX_FAMILY_MEMBERS - family.length})
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
                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${documents.primary.ktp ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                      {documents.primary.ktp ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{documents.primary.ktp.name}</p> : <><UploadCloud className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload KTP</p></>}
                      <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'ktp')} />
                    </label>
                    {errors.ktp && <p className="text-red-500 text-xs">{errors.ktp}</p>}
                  </div>

                  {/* UPLOAD KK */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Kartu Keluarga Utama</label>
                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${documents.primary.kk ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                      {documents.primary.kk ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{documents.primary.kk.name}</p> : <><UploadCloud className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload Kartu Keluarga</p></>}
                      <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'kk')} />
                    </label>
                    {errors.kk && <p className="text-red-500 text-xs">{errors.kk}</p>}
                  </div>

                  {/* UPLOAD PASPOR KONDISIONAL */}
                  {primary.statusPaspor === 'READY' ? (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <label className="block text-sm font-semibold text-slate-700 flex items-center">Foto Paspor Utama <Scan size={14} className="ml-1 text-[#6D28D9]" /></label>
                      <label className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer overflow-hidden transition-colors ${documents.primary.paspor && scanningKey !== 'primary' ? 'border-green-400 bg-green-50' : scanningKey === 'primary' ? 'border-[#6D28D9] bg-[#6D28D9]/5' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                        <div className="flex flex-col items-center justify-center z-10">
                          {scanningKey === 'primary' ? <><Loader2 className="w-8 h-8 text-[#6D28D9] animate-spin mb-2" /><p className="text-sm text-[#6D28D9] font-semibold">Membaca Data...</p></>
                          : documents.primary.paspor ? <p className="text-sm text-green-700 font-medium text-center px-4 line-clamp-2">{documents.primary.paspor.name}</p>
                          : <><FileText className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload Paspor</p></>}
                        </div>
                        {scanningKey === 'primary' && <div className="absolute top-0 left-0 w-full h-1 bg-[#6D28D9] shadow-[0_0_8px_#6D28D9] animate-scan" />}
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'paspor')} disabled={scanningKey === 'primary'} />
                      </label>
                      {errors.paspor && <p className="text-red-500 text-xs">{errors.paspor}</p>}
                      {errors.ocr && <p className="text-amber-600 text-xs">{errors.ocr}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <label className="block text-sm font-semibold text-slate-700">Foto Bukti Resi Pendaftaran Imigrasi (Opsional)</label>
                      <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${documents.primary.pasporHal4 ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                        {documents.primary.pasporHal4 ? <p className="text-xs text-amber-700 font-medium px-4 text-center line-clamp-2">{documents.primary.pasporHal4.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-400">Upload Berkas Resi (Jika ada)</p></>}
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'pasporHal4')} />
                      </label>
                      <p className="text-[11px] text-slate-400 italic">*Langkah ini bisa dilewati jika belum melakukan wawancara/foto di kantor Imigrasi.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Kartu BPJS (Opsional)</label>
                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${documents.primary.bpjs ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                      {documents.primary.bpjs ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{documents.primary.bpjs.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-500">Upload BPJS</p></>}
                      <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'bpjs')} />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Kartu e-ICV Meningitis (Opsional)</label>
                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${documents.primary.eicv ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                      {documents.primary.eicv ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{documents.primary.eicv.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-500">Upload e-ICV</p></>}
                      <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'eicv')} />
                    </label>
                  </div>
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Paspor</label>
                            <input type="text" name="noPaspor" value={primary.noPaspor} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm uppercase tracking-wider font-medium" />
                            {errors.noPaspor && <p className="text-red-500 text-xs mt-0.5">{errors.noPaspor}</p>}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Terbit</label>
                            <input type="date" name="pasporIssued" value={primary.pasporIssued || ""} onChange={handlePrimaryChange} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium" />
                            {errors.pasporIssued && <p className="text-red-500 text-xs mt-0.5">{errors.pasporIssued}</p>}
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
                        <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer ${documents.primary.pasporHal4 ? 'border-purple-400 bg-purple-50' : 'border-purple-200 bg-white'}`}>
                          {documents.primary.pasporHal4 ? <p className="text-xs text-purple-700 font-medium">{documents.primary.pasporHal4.name}</p> : <p className="text-xs text-purple-600">Upload Halaman 4 Paspor</p>}
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'pasporHal4')} />
                        </label>
                        {errors.pasporHal4 && <p className="text-red-500 text-xs mt-1">{errors.pasporHal4}</p>}
                      </div>
                    )}
                  </div>
                )}

                {family.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-200 space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Dokumen Anggota Keluarga</h3>
                      <p className="text-sm text-slate-500 mt-1">Upload dokumen dan validasi data untuk setiap anggota rombongan.</p>
                    </div>

                    {family.map((member, index) => {
                      const memberDocuments = getFamilyDocuments(member.id);
                      return (
                        <div key={member.id} className="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm">
                          <div className="mb-5">
                            <p className="text-xs font-bold text-[#6D28D9] uppercase tracking-wide">{member.hubungan || `Anggota #${index + 1}`}</p>
                            <h4 className="text-lg font-bold text-slate-800 mt-1">{member.namaLengkap || `Anggota #${index + 1}`}</h4>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="block text-sm font-semibold text-slate-700">Foto KTP Anggota</label>
                              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${memberDocuments.ktp ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                {memberDocuments.ktp ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{memberDocuments.ktp.name}</p> : <><UploadCloud className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload KTP</p></>}
                                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'ktp', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_ktp` })} />
                              </label>
                              {errors[`fam_${index}_ktp`] && <p className="text-red-500 text-xs">{errors[`fam_${index}_ktp`]}</p>}
                            </div>

                            <div className="space-y-2">
                              <label className="block text-sm font-semibold text-slate-700">Kartu Keluarga Anggota</label>
                              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${memberDocuments.kk ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                {memberDocuments.kk ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{memberDocuments.kk.name}</p> : <><UploadCloud className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload Kartu Keluarga</p></>}
                                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'kk', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_kk` })} />
                              </label>
                              {errors[`fam_${index}_kk`] && <p className="text-red-500 text-xs">{errors[`fam_${index}_kk`]}</p>}
                            </div>

                            {member.statusPaspor === 'READY' ? (
                              <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700">Foto Paspor Anggota</label>
                                <label className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer overflow-hidden transition-colors ${memberDocuments.paspor && scanningKey !== `family-${member.id}` ? 'border-green-400 bg-green-50' : scanningKey === `family-${member.id}` ? 'border-[#6D28D9] bg-[#6D28D9]/5' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                  {scanningKey === `family-${member.id}` ? <><Loader2 className="w-8 h-8 text-[#6D28D9] animate-spin mb-2" /><p className="text-sm text-[#6D28D9] font-semibold">Membaca Data...</p></>
                                  : memberDocuments.paspor ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{memberDocuments.paspor.name}</p>
                                  : <><FileText className="w-8 h-8 text-slate-400 mb-2" /><p className="text-sm text-slate-500">Upload Paspor</p></>}
                                  {scanningKey === `family-${member.id}` && <div className="absolute top-0 left-0 w-full h-1 bg-[#6D28D9] shadow-[0_0_8px_#6D28D9] animate-scan" />}
                                  <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'paspor', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_paspor`, index })} disabled={scanningKey === `family-${member.id}`} />
                                </label>
                                {errors[`fam_${index}_paspor`] && <p className="text-red-500 text-xs">{errors[`fam_${index}_paspor`]}</p>}
                                {errors[`fam_${index}_ocr`] && <p className="text-amber-600 text-xs">{errors[`fam_${index}_ocr`]}</p>}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700">Foto Bukti Resi Pendaftaran Imigrasi (Opsional)</label>
                                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${memberDocuments.pasporHal4 ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                                  {memberDocuments.pasporHal4 ? <p className="text-xs text-amber-700 font-medium px-4 text-center line-clamp-2">{memberDocuments.pasporHal4.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-400">Upload Berkas Resi (Jika ada)</p></>}
                                  <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'pasporHal4', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_pasporHal4` })} />
                                </label>
                                <p className="text-[11px] text-slate-400 italic">*Langkah ini bisa dilewati jika belum melakukan wawancara/foto di kantor Imigrasi.</p>
                              </div>
                            )}

                            <div className="space-y-2">
                              <label className="block text-sm font-semibold text-slate-700">Kartu BPJS (Opsional)</label>
                              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${memberDocuments.bpjs ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                                {memberDocuments.bpjs ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{memberDocuments.bpjs.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-500">Upload BPJS</p></>}
                                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'bpjs', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_bpjs` })} />
                              </label>
                            </div>

                            <div className="space-y-2">
                              <label className="block text-sm font-semibold text-slate-700">Kartu e-ICV Meningitis (Opsional)</label>
                              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${memberDocuments.eicv ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'}`}>
                                {memberDocuments.eicv ? <p className="text-sm text-green-700 font-medium px-4 text-center line-clamp-2">{memberDocuments.eicv.name}</p> : <><FileText className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-500">Upload e-ICV</p></>}
                                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'eicv', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_eicv` })} />
                              </label>
                            </div>
                          </div>

                          <div className="mt-5 bg-[#6D28D9]/5 border border-[#6D28D9]/20 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center text-[#6D28D9] font-bold mb-1">
                              <Scan size={18} className="mr-2" /> {member.statusPaspor === 'READY' ? 'Verifikasi Data Paspor Anggota' : 'Lengkapi Data Identitas Anggota'}
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Sesuai KTP / Paspor</label>
                              <input type="text" value={member.namaLengkap} onChange={(e) => handleFamilyChange(member.id, 'namaLengkap', e.target.value)} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm uppercase font-medium" />
                              {errors[`fam_${index}_namaLengkap`] && <p className="text-red-500 text-xs mt-0.5">{errors[`fam_${index}_namaLengkap`]}</p>}
                            </div>

                            {member.statusPaspor === 'READY' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Paspor</label>
                                  <input type="text" value={member.noPaspor} onChange={(e) => handleFamilyChange(member.id, 'noPaspor', e.target.value)} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm uppercase tracking-wider font-medium" />
                                  {errors[`fam_${index}_noPaspor`] && <p className="text-red-500 text-xs mt-0.5">{errors[`fam_${index}_noPaspor`]}</p>}
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Terbit</label>
                                  <input type="date" value={member.pasporIssued || ""} onChange={(e) => handleFamilyChange(member.id, 'pasporIssued', e.target.value)} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium" />
                                  {errors[`fam_${index}_pasporIssued`] && <p className="text-red-500 text-xs mt-0.5">{errors[`fam_${index}_pasporIssued`]}</p>}
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Kedaluwarsa</label>
                                  <input type="date" value={member.pasporExpired} onChange={(e) => handleFamilyChange(member.id, 'pasporExpired', e.target.value)} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium" />
                                  {errors[`fam_${index}_pasporExpired`] && <p className="text-red-500 text-xs mt-0.5">{errors[`fam_${index}_pasporExpired`]}</p>}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
                                <input type="date" value={member.tanggalLahir || ""} onChange={(e) => handleFamilyChange(member.id, 'tanggalLahir', e.target.value)} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium" />
                                {errors[`fam_${index}_tanggalLahir`] && <p className="text-red-500 text-xs mt-0.5">{errors[`fam_${index}_tanggalLahir`]}</p>}
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                                <select value={member.jenisKelamin || ""} onChange={(e) => handleFamilyChange(member.id, 'jenisKelamin', e.target.value)} className="w-full p-2.5 rounded-lg border border-purple-200 outline-none text-sm font-medium bg-white">
                                  <option value="">Pilih...</option>
                                  <option value="L">Laki-laki (Male)</option>
                                  <option value="P">Perempuan (Female)</option>
                                </select>
                                {errors[`fam_${index}_jenisKelamin`] && <p className="text-red-500 text-xs mt-0.5">{errors[`fam_${index}_jenisKelamin`]}</p>}
                              </div>
                            </div>
                          </div>

                          {member.statusPaspor === 'READY' && (
                            <div className="mt-5 p-4 border border-slate-200 rounded-2xl bg-slate-50">
                              <label className="flex items-start cursor-pointer group">
                                <button type="button" onClick={() => toggleFamilyPasporHal4(member.id, index)} className="mt-0.5 text-[#6D28D9] flex-shrink-0 transition-transform group-hover:scale-110">
                                  {member.hasPasporHal4 ? <CheckSquare size={20} /> : <Square size={20} />}
                                </button>
                                <div className="ml-3">
                                  <span className="block text-sm font-semibold text-slate-800">Terdapat Penambahan Nama (Halaman 4 Paspor)</span>
                                </div>
                              </label>
                              {member.hasPasporHal4 && (
                                <div className="mt-4">
                                  <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer ${memberDocuments.pasporHal4 ? 'border-purple-400 bg-purple-50' : 'border-purple-200 bg-white'}`}>
                                    {memberDocuments.pasporHal4 ? <p className="text-xs text-purple-700 font-medium">{memberDocuments.pasporHal4.name}</p> : <p className="text-xs text-purple-600">Upload Halaman 4 Paspor</p>}
                                    <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFileChange(e, 'pasporHal4', { owner: 'family', memberId: member.id, errorKey: `fam_${index}_pasporHal4` })} />
                                  </label>
                                  {errors[`fam_${index}_pasporHal4`] && <p className="text-red-500 text-xs mt-1">{errors[`fam_${index}_pasporHal4`]}</p>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* ================= STEP 4: REVIEW & VALIDASI DATA ================= */}
            {step === 4 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="border-b pb-2">
                  <h2 className="text-xl font-bold text-slate-800">Review & Validasi Data</h2>
                  <p className="text-sm text-slate-500">Periksa kembali seluruh data sebelum pendaftaran dikirim.</p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-bold mb-1">Panduan universal size chart Indonesia</p>
                  <p>Ukuran seragam bersifat unisex dewasa. LD = lingkar dada. Pilih ukuran yang paling nyaman, terutama jika akan dipakai berlapis.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {SERAGAM_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 border border-amber-100">
                        <span className="font-bold">{option.label}</span>
                        <span className="text-xs text-amber-800 text-right">{option.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {isTiraProject && <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 text-sm text-slate-700">
                  <p className="font-bold text-slate-800 mb-2">Informasi SFC</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><span className="text-slate-500">Nama SFC:</span> <span className="font-semibold text-slate-800">{sfcInfo.namaSfc || "-"}</span></div>
                    <div><span className="text-slate-500">No WhatsApp SFC:</span> <span className="font-semibold text-slate-800">{sfcInfo.whatsappSfc || "-"}</span></div>
                  </div>
                </div>}

                {allParticipants.map((participant, index) => (
                  <div key={participant.prefix} className="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-5">
                      <div>
                        <p className="text-xs font-bold text-[#6D28D9] uppercase tracking-wide">{participant.hubungan || `Anggota #${index}`}</p>
                        <h3 className="text-lg font-bold text-slate-800 mt-1">{participant.namaLengkap || "Nama belum diisi"}</h3>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-3 py-1">Peserta {index + 1}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Ukuran Seragam</label>
                        <select
                          value={participant.ukuranSeragam || ""}
                          onChange={(e) => updateParticipantField(participant, 'ukuranSeragam', e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all bg-white"
                        >
                          <option value="">Pilih ukuran</option>
                          {SERAGAM_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label} - {option.detail}</option>
                          ))}
                        </select>
                        {errors[`${participant.prefix}_ukuranSeragam`] && <p className="text-red-500 text-xs mt-1">{errors[`${participant.prefix}_ukuranSeragam`]}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Perlengkapan Ibadah</label>
                        <select
                          value={participant.perlengkapanIbadah || ""}
                          onChange={(e) => updateParticipantField(participant, 'perlengkapanIbadah', e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#6D28D9] transition-all bg-white"
                        >
                          <option value="">Pilih metode</option>
                          <option value="DIKIRIM">{DELIVERY_OPTIONS.DIKIRIM}</option>
                          <option value="AMBIL_KANTOR">{DELIVERY_OPTIONS.AMBIL_KANTOR}</option>
                        </select>
                        {errors[`${participant.prefix}_perlengkapanIbadah`] && <p className="text-red-500 text-xs mt-1">{errors[`${participant.prefix}_perlengkapanIbadah`]}</p>}
                      </div>
                    </div>

                    {participant.perlengkapanIbadah === 'DIKIRIM' && (
                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 mb-5 animate-in fade-in duration-150">
                        <div className="flex items-start gap-2 text-orange-800 mb-4">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <p className="text-sm font-semibold">Biaya pengiriman perlengkapan ibadah ditanggung oleh jamaah masing-masing.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Alamat Lengkap Pengiriman</label>
                            <textarea
                              value={participant.alamatPengiriman || ""}
                              onChange={(e) => updateParticipantField(participant, 'alamatPengiriman', e.target.value)}
                              rows={3}
                              className="w-full border border-orange-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-orange-400 transition-all bg-white"
                              placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota/kabupaten, provinsi, kode pos"
                            />
                            {errors[`${participant.prefix}_alamatPengiriman`] && <p className="text-red-500 text-xs mt-1">{errors[`${participant.prefix}_alamatPengiriman`]}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Nomor yang Dapat Dihubungi</label>
                            <input
                              type="tel"
                              value={participant.kontakPengiriman || ""}
                              onChange={(e) => updateParticipantField(participant, 'kontakPengiriman', e.target.value)}
                              className="w-full border border-orange-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-orange-400 transition-all bg-white"
                              placeholder="Contoh: 08123456789"
                            />
                            {errors[`${participant.prefix}_kontakPengiriman`] && <p className="text-red-500 text-xs mt-1">{errors[`${participant.prefix}_kontakPengiriman`]}</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                      <p className="text-sm font-bold text-slate-800 mb-3">Ringkasan Data Peserta</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div><span className="text-slate-500">NIK:</span> <span className="font-semibold text-slate-800">{participant.nik || "-"}</span></div>
                        <div><span className="text-slate-500">Kota asal:</span> <span className="font-semibold text-slate-800">{participant.kotaAsal || "-"}</span></div>
                        <div><span className="text-slate-500">Status paspor:</span> <span className="font-semibold text-slate-800">{participant.statusPaspor === 'READY' ? 'Sudah punya paspor' : 'Menyusul / sedang proses'}</span></div>
                        <div><span className="text-slate-500">No. paspor:</span> <span className="font-semibold text-slate-800">{participant.statusPaspor === 'READY' ? participant.noPaspor || "-" : "MENYUSUL"}</span></div>
                        <div><span className="text-slate-500">Terbit paspor:</span> <span className="font-semibold text-slate-800">{participant.statusPaspor === 'READY' ? formatDateForDisplay(participant.pasporIssued) : "-"}</span></div>
                        <div><span className="text-slate-500">Expired paspor:</span> <span className="font-semibold text-slate-800">{participant.statusPaspor === 'READY' ? formatDateForDisplay(participant.pasporExpired) : "-"}</span></div>
                        <div><span className="text-slate-500">Tanggal lahir:</span> <span className="font-semibold text-slate-800">{formatDateForDisplay(participant.tanggalLahir)}</span></div>
                        <div><span className="text-slate-500">Jenis kelamin:</span> <span className="font-semibold text-slate-800">{participant.jenisKelamin || "-"}</span></div>
                        <div><span className="text-slate-500">Ukuran seragam:</span> <span className="font-semibold text-slate-800">{participant.ukuranSeragam ? `${participant.ukuranSeragam} (${getSizeDetail(participant.ukuranSeragam)})` : "-"}</span></div>
                        <div><span className="text-slate-500">Perlengkapan:</span> <span className="font-semibold text-slate-800">{getDeliveryLabel(participant.perlengkapanIbadah)}</span></div>
                        {participant.perlengkapanIbadah === 'DIKIRIM' && (
                          <>
                            <div className="sm:col-span-2"><span className="text-slate-500">Alamat kirim:</span> <span className="font-semibold text-slate-800">{participant.alamatPengiriman || "-"}</span></div>
                            <div className="sm:col-span-2"><span className="text-slate-500">Kontak kirim:</span> <span className="font-semibold text-slate-800">{participant.kontakPengiriman || "-"}</span></div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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

              {step < TOTAL_STEPS ? (
                <button type="button" onClick={nextStep} className="px-8 py-3 bg-[#6D28D9] text-white font-bold tracking-wide rounded-xl hover:bg-[#5b21b6] shadow-md shadow-purple-200 transition-all flex items-center">
                  {step === 3 ? "Review Data" : "Lanjut"} <ChevronRight size={18} className="ml-1.5" />
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
