import { redirect } from "next/navigation";
import { getAppSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await getAppSession()) ? "/dashboard" : "/login");
}
