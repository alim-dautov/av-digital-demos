"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import type { Permissions } from "@/lib/rbac";
import * as svc from "./service";

const id = z.number().int();
const rv = { revalidate: ["/settings", "/team"] };

export const createUserAction = action(svc.userInput, (i, { db, p }) => svc.createUser(db, p, i), rv);
export const updateUserAction = action(z.object({ id, data: svc.userInput }), (i, { db, p }) => svc.updateUser(db, p, i.id, i.data), rv);
export const resetPasswordAction = action(z.object({ id }), (i, { db, p }) => svc.resetPassword(db, p, i.id), rv);
export const deleteUserAction = action(z.object({ id }), (i, { db, p }) => svc.deleteUser(db, p, i.id), rv);

export const createTokenAction = action(
  z.object({ name: z.string().trim().min(1).max(80), permissions: svc.permissionsSchema, expiresInDays: z.number().int().min(1).max(3650).nullable() }),
  (i, { db, p }) => svc.createToken(db, p, { name: i.name, permissions: i.permissions as Permissions, expiresInDays: i.expiresInDays }), rv);
export const revokeTokenAction = action(z.object({ id }), (i, { db, p }) => svc.revokeToken(db, p, i.id), rv);

