import UserPayslip from "../[userId]/page";

export const metadata = { title: "Мой заработок" };

export default async function MyPayslip({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  return UserPayslip({ params: Promise.resolve({ userId: "me" }), searchParams });
}
