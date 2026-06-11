import { Suspense } from 'react';
import UmrahForm from './components/UmrahForm';

export default function RegisterPage() {
  return (
    // Suspense akan mengamankan form yang membaca URL Parameter dari Error SSR
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center font-bold text-purple-600">Memuat Formulir Aman...</div>}>
      <UmrahForm />
    </Suspense>
  );
}