"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  ImagePlus,
  Images,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDateRu } from "@/lib/utils";
import type { GalleryFolder, GalleryPhoto } from "@/types";

type FolderRow = GalleryFolder & { count: number };
type ClientOpt = { id: string; fullName: string; phone: string };
type OrderOpt = { id: string; number: string; clientId: string };

const NONE = "none";

export function GalleryView({
  folders,
  activeFolderId,
  clientFilter,
  photos,
  clients,
  orders,
  canWrite,
}: {
  folders: FolderRow[];
  activeFolderId: string;
  clientFilter: string;
  photos: GalleryPhoto[];
  clients: ClientOpt[];
  orders: OrderOpt[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [newFolder, setNewFolder] = React.useState("");
  const [uploadClient, setUploadClient] = React.useState(clientFilter || NONE);
  const [uploadOrder, setUploadOrder] = React.useState(NONE);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [viewer, setViewer] = React.useState<number | null>(null);

  const clientMap = React.useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const orderMap = React.useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const uploadOrders = orders.filter((o) => uploadClient !== NONE && o.clientId === uploadClient);

  function go(params: { folder?: string; client?: string }) {
    const q = new URLSearchParams();
    if (params.folder) q.set("folder", params.folder);
    if (params.client) q.set("client", params.client);
    router.push(`/gallery${q.size ? `?${q}` : ""}`);
  }

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolder.trim()) return;
    const res = await fetch("/api/gallery/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolder }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Ошибка");
      return;
    }
    setNewFolder("");
    toast.success("Папка создана");
    go({ folder: data.folder.id });
    router.refresh();
  }

  async function removeFolder(f: FolderRow) {
    const msg = f.count
      ? `Удалить папку «${f.name}» и ${f.count} фото в ней?`
      : `Удалить папку «${f.name}»?`;
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/gallery/folders?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Не удалось удалить папку");
      return;
    }
    toast.success("Папка удалена");
    go({});
    router.refresh();
  }

  async function upload(files: File[]) {
    if (!activeFolderId) {
      toast.error("Сначала выберите папку");
      return;
    }
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setProgress({ done: 0, total: images.length });
    let failed = 0;
    for (const [i, file] of images.entries()) {
      const form = new FormData();
      form.set("folderId", activeFolderId);
      form.append("files", file);
      if (uploadClient !== NONE) form.set("clientId", uploadClient);
      if (uploadOrder !== NONE) form.set("orderId", uploadOrder);
      const res = await fetch("/api/gallery/photos", { method: "POST", body: form });
      if (!res.ok) {
        failed += 1;
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Не удалось загрузить «${file.name}»`);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
    if (failed < images.length) toast.success(`Загружено фото: ${images.length - failed}`);
    router.refresh();
  }

  async function removePhoto(p: GalleryPhoto) {
    if (!window.confirm("Удалить фото?")) return;
    const res = await fetch(`/api/gallery/photos?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Не удалось удалить");
      return;
    }
    setViewer(null);
    router.refresh();
  }

  async function linkPhoto(p: GalleryPhoto, patch: { clientId?: string | null; orderId?: string | null }) {
    const res = await fetch("/api/gallery/photos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, ...patch }),
    });
    if (!res.ok) {
      toast.error("Не удалось сохранить привязку");
      return;
    }
    toast.success("Привязка сохранена");
    router.refresh();
  }

  React.useEffect(() => {
    if (viewer === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewer((v) => (v === null ? v : (v + 1) % photos.length));
      if (e.key === "ArrowLeft") setViewer((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, photos.length]);

  const current = viewer !== null ? photos[viewer] : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Галерея</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clientFilter
              ? `Фото клиента: ${clientMap.get(clientFilter)?.fullName ?? ""}`
              : activeFolder
                ? `${activeFolder.name} · ${activeFolder.count} фото`
                : "Фотографии работ по папкам"}
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={clientFilter || NONE} onValueChange={(v) => go({ folder: activeFolderId || undefined, client: v === NONE ? undefined : v })}>
            <SelectTrigger aria-label="Фильтр по клиенту">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Все клиенты</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-3">
          <nav aria-label="Папки" className="space-y-1">
            {clientFilter && (
              <button
                type="button"
                onClick={() => go({ client: clientFilter })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                  !activeFolderId ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Images className="size-4" /> Все папки
              </button>
            )}
            {folders.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "group flex items-center rounded-md",
                  f.id === activeFolderId ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => go({ folder: f.id, client: clientFilter || undefined })}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Folder className="size-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-xs tabular-nums opacity-70">{f.count}</span>
                </button>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`Удалить папку ${f.name}`}
                    onClick={() => void removeFolder(f)}
                    className="mr-1 rounded p-1 opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </nav>
          {canWrite && (
            <form onSubmit={createFolder} className="flex gap-1">
              <Input
                placeholder="Новая папка"
                value={newFolder}
                maxLength={60}
                onChange={(e) => setNewFolder(e.target.value)}
              />
              <Button type="submit" size="icon" variant="outline" aria-label="Создать папку">
                <FolderPlus className="size-4" />
              </Button>
            </form>
          )}
        </aside>

        <section className="space-y-4">
          {canWrite && activeFolderId && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void upload(Array.from(e.dataTransfer.files));
              }}
              className={cn(
                "grid gap-3 rounded-lg border border-dashed p-4 transition-colors sm:grid-cols-[1fr_1fr_auto] sm:items-end",
                dragging ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div>
                <Label>Привязать к клиенту</Label>
                <Select
                  value={uploadClient}
                  onValueChange={(v) => {
                    setUploadClient(v);
                    setUploadOrder(NONE);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Без клиента</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Заказ</Label>
                <Select value={uploadOrder} onValueChange={setUploadOrder} disabled={uploadClient === NONE}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Без заказа</SelectItem>
                    {uploadOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void upload(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <Button type="button" disabled={progress !== null} onClick={() => fileInput.current?.click()}>
                  {progress ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> {progress.done}/{progress.total}
                    </>
                  ) : (
                    <>
                      <ImagePlus className="size-4" /> Загрузить фото
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Можно выбрать несколько файлов или перетащить их сюда. JPG, PNG, WEBP до 15 МБ.
              </p>
            </div>
          )}

          {photos.length === 0 ? (
            <div className="rounded-lg border border-border bg-panel">
              <EmptyState icon={Images} title="Фотографий пока нет" description={activeFolderId ? "Загрузите первые фото в эту папку" : undefined} />
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {photos.map((p, i) => {
                const client = p.clientId ? clientMap.get(p.clientId) : null;
                return (
                  <li key={p.id} className="overflow-hidden rounded-lg border border-border bg-panel">
                    <button type="button" className="block aspect-square w-full" onClick={() => setViewer(i)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
                    </button>
                    <div className="px-2 py-1.5 text-xs">
                      <p className="truncate">{client?.fullName ?? p.name}</p>
                      <p className="truncate text-muted-foreground">
                        {p.orderId ? orderMap.get(p.orderId)?.number ?? "" : formatDateRu(p.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.name}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
          onClick={() => setViewer(null)}
        >
          <div className="flex items-center justify-between gap-3 p-3" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm">
              {current.name} · {(viewer ?? 0) + 1}/{photos.length}
            </p>
            <div className="flex items-center gap-2">
              {canWrite && (
                <>
                  <Select
                    value={current.clientId ?? NONE}
                    onValueChange={(v) => void linkPhoto(current, { clientId: v === NONE ? null : v, orderId: null })}
                  >
                    <SelectTrigger className="h-8 w-44 border-white/20 bg-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Без клиента</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {current.clientId && (
                    <Select
                      value={current.orderId ?? NONE}
                      onValueChange={(v) => void linkPhoto(current, { orderId: v === NONE ? null : v })}
                    >
                      <SelectTrigger className="h-8 w-36 border-white/20 bg-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Без заказа</SelectItem>
                        {orders
                          .filter((o) => o.clientId === current.clientId)
                          .map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.number}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" aria-label="Удалить фото" onClick={() => void removePhoto(current)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" aria-label="Закрыть" onClick={() => setViewer(null)}>
                <X className="size-5" />
              </Button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Предыдущее фото"
                className="absolute left-3 rounded-full bg-white/10 p-2 hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewer((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
                }}
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={current.name}
              className="max-h-full max-w-full rounded object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Следующее фото"
                className="absolute right-3 rounded-full bg-white/10 p-2 hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewer((v) => (v === null ? v : (v + 1) % photos.length));
                }}
              >
                <ChevronRight className="size-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
