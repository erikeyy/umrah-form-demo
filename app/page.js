import { Suspense } from 'react';
import UmrahForm from './components/UmrahForm'; // [17]

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-10">Loading Form...</div>}>
      <UmrahForm />
    </Suspense>
  );
} // [16]