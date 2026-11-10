export function DemoBanner() {
  const url = process.env.DEMO_CONTACT_URL || "https://av-digital.kz/#contact";
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
      Это демо-версия: данные выдуманные и периодически сбрасываются.{" "}
      <a href={url} className="font-semibold underline">Хотите такую же систему под ваш бизнес?</a>
    </div>
  );
}
