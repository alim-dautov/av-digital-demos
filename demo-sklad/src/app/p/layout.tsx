import Image from "next/image";

export const metadata = { robots: { index: false, follow: false } };

/** Публичные страницы по ссылке (КП, акт сверки) — без меню и авторизации */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-navy px-4 py-4 sm:px-8"><Image src="/brand/logo-full-white.svg" alt="Electro Demo" width={150} height={36} priority /></header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
