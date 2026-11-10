import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getData } from "@/lib/db";
import { listClients } from "@/lib/services/clients";
import { listGalleryFolders, listGalleryPhotos } from "@/lib/services/gallery";
import { GalleryView } from "./gallery-view";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) return null;
  if (!can(session, "gallery", "read")) redirect("/");

  const params = await searchParams;
  const companyId = session.companyId;
  const folders = listGalleryFolders(companyId);
  const folderParam = typeof params.folder === "string" ? params.folder : "";
  const clientParam = typeof params.client === "string" ? params.client : "";
  const activeFolderId = folders.some((f) => f.id === folderParam)
    ? folderParam
    : clientParam
      ? ""
      : folders[0]?.id ?? "";

  const photos = listGalleryPhotos(companyId, {
    folderId: activeFolderId || undefined,
    clientId: clientParam || undefined,
  });

  const clients = listClients(companyId).map((c) => ({ id: c.id, fullName: c.fullName, phone: c.phone }));
  const orders = getData()
    .orders.filter((o) => o.companyId === companyId && isActiveOrder(o))
    .map((o) => ({ id: o.id, number: o.number, clientId: o.clientId }));

  return (
    <GalleryView
      folders={folders}
      activeFolderId={activeFolderId}
      clientFilter={clientParam}
      photos={photos}
      clients={clients}
      orders={orders}
      canWrite={can(session, "gallery", "write")}
    />
  );
}
