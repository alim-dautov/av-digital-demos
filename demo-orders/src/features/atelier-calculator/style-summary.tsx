import { curtainStylesByIds } from "@/lib/domain/curtain-styles";

export function StyleSummary({ ids }: { ids?: string[] }) {
  const styles = curtainStylesByIds(ids);
  if (!styles.length) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">Тип шторы</p>
      <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {styles.map((style) => (
          <li key={style.id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <img src={style.src} alt={style.label} className="aspect-[4/3] w-full object-contain" />
            <p className="px-2 py-1.5 text-xs font-medium">{style.label}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
