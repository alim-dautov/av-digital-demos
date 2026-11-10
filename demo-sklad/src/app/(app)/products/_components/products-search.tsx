"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { PRODUCT_ROW_H, ProductRow, SearchCombo } from "@/components/pickers";

/** Поле поиска раздела «Товары»: мгновенные подсказки из индекса, Enter по подсказке — карточка товара,
 *  кнопка «Найти» — серверный фильтр таблицы (q уходит скрытым полем). */
export function ProductsSearch({ q }: { q?: string }) {
  const router = useRouter();
  const [v, setV] = useState(q ?? "");
  return (
    <>
      <SearchCombo kind="products" rowHeight={PRODUCT_ROW_H} initialQ={q ?? ""} placeholder="Название, артикул или штрихкод" icon={<Search />} opts={{ limit: 200 }}
        onQueryChange={setV} onPick={(p) => router.push(`/products/${p.id}`)}
        render={(p, qq) => <ProductRow p={p} q={qq} />} />
      <input type="hidden" name="q" value={v} />
    </>
  );
}
