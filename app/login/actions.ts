"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  expectedToken,
  safeEqual,
} from "@/lib/auth";
import { getCompanyByPin } from "@/lib/clients";
import {
  CLIENT_COOKIE,
  CLIENT_MAX_AGE,
  createClientToken,
} from "@/lib/clientsession";
import { igQueueConfigured } from "@/lib/env";

export async function login(formData: FormData) {
  const input = String(formData.get("password") || "").trim();
  const teamPassword = process.env.APP_PASSWORD || "";

  // ── Team login ──
  if (teamPassword && safeEqual(input, teamPassword)) {
    (await cookies()).set(AUTH_COOKIE, await expectedToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_MAX_AGE,
    });
    redirect("/");
  }

  // ── Client PIN (same PIN as the reports app) ──
  if (/^\d{4,10}$/.test(input) && igQueueConfigured()) {
    const company = await getCompanyByPin(input);
    if (company?.fbPageId) {
      const token = await createClientToken(
        company.$id,
        company.fbPageId,
        company.name
      );
      (await cookies()).set(CLIENT_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: CLIENT_MAX_AGE,
      });
      redirect("/client");
    }
  }

  // Small delay to slow brute-force attempts.
  await new Promise((r) => setTimeout(r, 750));
  redirect("/login?error=1");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  jar.delete(CLIENT_COOKIE);
  redirect("/login");
}
