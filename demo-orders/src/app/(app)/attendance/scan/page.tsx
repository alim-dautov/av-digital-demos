import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AttendanceScanClient } from "./scan-client";

export default async function AttendanceScanPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!can(session, "attendance", "write")) {
    redirect("/attendance");
  }

  if (!session.employeeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Нет привязки к сотруднику</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Обратитесь к администратору, чтобы привязать аккаунт к карточке
          сотрудника.
        </p>
      </div>
    );
  }

  return <AttendanceScanClient employeeName={session.fullName} />;
}
