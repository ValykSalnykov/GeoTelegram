'use client';

import dynamic from 'next/dynamic';

const GeoTelegramApp = dynamic(() => import('./GeoTelegramApp'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <p className="text-slate-500">Завантаження...</p>
    </div>
  ),
});

export default function ClientWrapper() {
  return <GeoTelegramApp />;
}
