"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NAV_ITEMS, ASSISTANT_NAV } from "@/lib/nav";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCompanyLogo } from "@/lib/company-apps";
import type { Company } from "@/types";

export function CompanyAdmin({ company }: { company: Company }) {
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [disabled, setDisabled] = useState<string[]>(company.disabledModules ?? []);
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentLogo = company.logoUrl === undefined ? getCompanyLogo(company.id)?.full.src : company.logoUrl;
  const modules = [...NAV_ITEMS, ...(company.vertical === "furniture" ? [ASSISTANT_NAV] : [])].filter((item) => item.resource !== "settings" && (!item.vertical || item.vertical === "both" || item.vertical === company.vertical));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData();
      form.set("name", name); form.set("disabledModules", JSON.stringify(disabled));
      if (logo) form.set("logo", logo);
      if (removeLogo) form.set("removeLogo", "true");
      const res = await fetch("/api/settings/company", { method: "PATCH", body: form });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Не удалось сохранить");
      setLogo(null); setRemoveLogo(false); toast.success("Настройки компании сохранены"); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось сохранить"); }
    finally { setSaving(false); }
  }
  return <form onSubmit={save} className="space-y-5 rounded-lg border border-border bg-panel p-5">
    <div><h2 className="text-lg font-semibold">Название, логотип и модули</h2><p className="text-sm text-muted-foreground">Настройки действуют для всех сотрудников этой компании.</p></div>
    <label className="block max-w-md space-y-2 text-sm">Название компании<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
    <div className="space-y-2"><label className="block text-sm" htmlFor="company-logo">Логотип · PNG, JPEG или WebP, до 1 МБ</label><Input id="company-logo" type="file" accept="image/png,image/jpeg,image/webp" className="max-w-md" onChange={(e) => { setLogo(e.target.files?.[0] ?? null); setRemoveLogo(false); }} />{currentLogo && !removeLogo && <div className="flex items-center gap-3"><img src={currentLogo} alt="Текущий логотип" className="max-h-16 max-w-32 object-contain" /><Button type="button" variant="outline" onClick={() => { setLogo(null); setRemoveLogo(true); }}>Удалить логотип</Button></div>}</div>
    <fieldset className="space-y-3"><legend className="mb-3 font-medium">Модули компании</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{modules.map((item) => <label key={item.resource} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"><span>{item.label}</span><Switch checked={!disabled.includes(item.resource)} onCheckedChange={(checked) => setDisabled((prev) => checked ? prev.filter((v) => v !== item.resource) : [...prev, item.resource])} aria-label={item.label} /></label>)}</div></fieldset>
    <Button type="submit" disabled={saving}>{saving ? "Сохранение…" : "Сохранить изменения"}</Button>
  </form>;
}
