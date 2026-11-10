import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canHostAttendanceQr } from "@/lib/rbac";
import { AttendanceQrDisplay } from "./qr-display";

export default async function AttendanceQrPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!canHostAttendanceQr(session)) {
    redirect("/attendance");
  }

  return <AttendanceQrDisplay />;
}
