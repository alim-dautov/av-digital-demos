"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

export const saveNoteAction = action(z.object({ id: z.number().int().nullable(), data: svc.noteInput }), (i, { db, p }) => svc.saveNote(db, p, i.id, i.data), { revalidate: ["/notes"] });
export const deleteNoteAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.deleteNote(db, p, i.id), { revalidate: ["/notes"] });
