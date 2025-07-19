import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import type { Todo, TodoListWithTodos } from './types';
import { GlobalPocketBaseProvider } from '@/services/yjsPocketBase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper function to convert a base64 string to a Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    console.error("Failed to decode base64 string:", error);
    return new Uint8Array();
  }
}

/**
 * Decodes a Yjs document from a base64 yjsUpdate string and extracts list metadata and todos.
 * Returns an object with name, color, pinned, archived, deleted, and todos fields.
 */
export function decodeYjsListDoc(
  yjsUpdate?: string
): {
  name?: string;
  color?: string;
  pinned?: boolean;
  archived?: boolean;
  deleted?: boolean;
  todos?: Todo[];
} {
  if (!yjsUpdate) {
    console.debug('No update');
    return{};
  }
  try {
    const doc = new Y.Doc();
    const update = base64ToUint8Array(yjsUpdate);
    if (update.length === 0) return {};
    Y.applyUpdate(doc, update);
    const ylist = doc.getMap("list");
    const name =
      ylist.get("name") instanceof Y.Text
        ? (ylist.get("name") as Y.Text).toString()
        : "";
    const color =
      ylist.get("color") instanceof Y.Text
        ? (ylist.get("color") as Y.Text).toString()
        : "";
    const pinnedRaw = ylist.get("pinned");
    const archivedRaw = ylist.get("archived");
    const deletedRaw = ylist.get("deleted");
    const pinned = typeof pinnedRaw === "boolean" ? pinnedRaw : false;
    const archived = typeof archivedRaw === "boolean" ? archivedRaw : false;
    const deleted = typeof deletedRaw === "boolean" ? deletedRaw : false;
    const ytodos = ylist.get("todos") as Y.Array<Y.Map<any>>;
    const todos = ytodos ? ytodos.toArray().map((t) => t.toJSON() as Todo) : [];
    const meta = { name, color, pinned, archived, deleted, todos };
    // Debugging output
    console.debug('[decodeYjsListDoc] Decoded Yjs doc:', {
      yjsUpdate: yjsUpdate?.slice(0, 32) + '...',
      meta,
      ylist: ylist.toJSON(),
      todosCount: todos.length
    });

    return meta;
  } catch (e) {
    console.error(
      "[decodeYjsListDoc] Error decoding yjsUpdate:",
      e,
      yjsUpdate?.slice(0, 32) + "..."
    );
    return {};
  }
}

// Helper function to get todos from a yjsUpdate
export function getTodosFromYjsUpdate(yjsUpdate: string): Todo[] {
  if (!yjsUpdate) return [];
  try {
    const meta = decodeYjsListDoc(yjsUpdate);
    return Array.isArray(meta.todos) ? meta.todos : [];
  } catch (error) {
    console.error("Failed to decode yjsUpdate:", error);
    return [];
  }
}

/**
 * Returns all known local Yjs lists as an array of decoded TodoListWithTodos objects.
 * This uses the GlobalPocketBaseProvider singleton and decodeYjsListDoc.
 */
export function getAllLocalYjsTodoLists(): TodoListWithTodos[] {
  const provider = GlobalPocketBaseProvider.getInstance();
  const lists: TodoListWithTodos[] = [];
  for (const [listId, docInstance] of (provider as any).documents.entries()) {
    // Get the latest Yjs update for this doc
    const yjsUpdate = uint8ArrayToBase64(Y.encodeStateAsUpdate(docInstance.doc));
    const meta = decodeYjsListDoc(yjsUpdate);
    if (meta) {
      lists.push({
        id: listId,
        name: meta.name || '',
        color: meta.color || '',
        createdAt: '', // You may want to store this in Yjs or elsewhere
        pinned: meta.pinned,
        archived: meta.archived,
        deleted: meta.deleted,
        todos: Array.isArray(meta.todos) ? meta.todos : [],
        yjsUpdate,
        user_id: '', // Not available from Yjs, can be filled in if needed
      });
    }
  }
  return lists;
}