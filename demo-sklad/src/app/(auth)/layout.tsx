import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full border-[60px] border-white/[0.04]" />
        <div className="pointer-events-none absolute -bottom-52 -left-24 size-[560px] rounded-full bg-yellow/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white p-2"><Image src="/brand/logo-mark.svg" alt="" width={32} height={32} /></span>
          <span className="text-lg font-extrabold tracking-tight">Electro Demo</span>
        </div>
        <div className="relative max-w-lg">
          <p className="mb-4 inline-flex rounded-full bg-yellow px-3 py-1 text-xs font-bold uppercase tracking-wider text-navy">CRM · Склад · Продажи</p>
          <h1 className="text-[44px] font-extrabold leading-[1.05] tracking-tight">Заявки, склад и деньги — в одном окне.</h1>
          <p className="mt-5 text-[17px] leading-relaxed text-white/70">Электротовары и кабель: опт, базар, магазины и монтаж. Остатки, долги, прайсы и зарплата считаются сами.</p>
        </div>
        <div className="relative grid grid-cols-3 gap-6 text-sm text-white/60">
          <div><div className="text-2xl font-extrabold text-yellow">₸</div>все суммы в тенге</div>
          <div><div className="text-2xl font-extrabold text-white">PWA</div>работает с телефона</div>
          <div><div className="text-2xl font-extrabold text-white">24/7</div>Asia/Almaty</div>
        </div>
      </section>
      <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <Image src="/brand/logo-full.svg" alt="Electro Demo" width={220} height={60} priority className="mb-10 h-auto w-[200px] dark:hidden lg:hidden" />
          <Image src="/brand/logo-full-white.svg" alt="Electro Demo" width={220} height={60} priority className="mb-10 hidden h-auto w-[200px] dark:block lg:hidden dark:lg:hidden" />
          {children}
        </div>
      </section>
    </main>
  );
}
