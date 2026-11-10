import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ChangePasswordForm } from "../auth-forms";

export const metadata = { title: "Смена пароля" };

export default async function ChangePasswordPage() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return (
    <>
      <h2 className="text-[28px] font-extrabold tracking-tight">{u.mustChangePassword ? `${u.name}, придумайте пароль` : "Смена пароля"}</h2>
      <p className="mb-8 mt-1.5 text-sm text-ink-3">{u.mustChangePassword ? "Временный пароль нужно заменить при первом входе." : "Введите текущий и новый пароль."}</p>
      <ChangePasswordForm needCurrent={!u.mustChangePassword} />
    </>
  );
}
