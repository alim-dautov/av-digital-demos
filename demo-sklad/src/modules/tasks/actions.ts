"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const id = z.number().int();
const fileRef = z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() });

export const createTaskAction = action(svc.taskInput, (i, { db, p }) => svc.createTask(db, p, i), { revalidate: ["/tasks", "/"] });
export const updateTaskAction = action(z.object({ id, data: svc.taskInput }), (i, { db, p }) => svc.updateTask(db, p, i.id, i.data), { revalidate: ["/tasks"] });
export const moveTaskAction = action(z.object({ id, stageId: id, sort: z.number() }), (i, { db, p }) => svc.moveTask(db, p, i.id, i.stageId, i.sort));
export const deleteTaskAction = action(z.object({ id }), (i, { db, p }) => svc.deleteTask(db, p, i.id), { revalidate: ["/tasks"] });
export const getTaskAction = action(z.object({ id }), (i, { db, p }) => svc.getTask(db, p, i.id));
export const commentTaskAction = action(z.object({ id, body: z.string().max(10000), attachments: z.array(fileRef).default([]) }),
  (i, { db, p }) => svc.addComment(db, p, i.id, i.body, i.attachments));
