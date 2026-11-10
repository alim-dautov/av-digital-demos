import { NextResponse } from "next/server";
import { openApiSpec } from "@/modules/api/routes";

export function GET(req: Request) {
  return NextResponse.json(openApiSpec(process.env.APP_URL || new URL(req.url).origin));
}
