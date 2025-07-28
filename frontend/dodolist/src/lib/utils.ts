import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import type { Todo, TodoList, TodoListWithTodos, PocketBasePermissionsRecord } from './types';
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
  const listIds = provider.getAllDocumentIds();
  const lists: TodoListWithTodos[] = [];

  for (const listId of listIds) {
    const list = decodeYjsListDocFromMemory(listId);
    if (list) {
      lists.push(list);
    }
  }
  return lists;
}

export function decodeYjsListDocFromMemory(listId: string): TodoListWithTodos | null {
    const provider = GlobalPocketBaseProvider.getInstance();
    const doc = provider.getDocument(listId);
    if (!doc) return null;

    const ylist = doc.getMap("list");
    const name = (ylist.get("name") as Y.Text)?.toString() || "";
    const color = (ylist.get("color") as Y.Text)?.toString() || "";
    const pinned = ylist.get("pinned") as boolean || false;
    const archived = ylist.get("archived") as boolean || false;
    const deleted = ylist.get("deleted") as boolean || false;
    const ytodos = ylist.get("todos") as Y.Array<Y.Map<any>>;
    const todos = ytodos ? ytodos.toArray().map((t) => t.toJSON() as Todo) : [];
    const readOnly = provider.getReadOnlyStatus(listId);

    return {
        id: listId,
        name,
        color,
        pinned,
        archived,
        deleted,
        todos,
        readOnly,
        createdAt: '', // This info is not in the Y.Doc
        user_id: '', // This info is not in the Y.Doc
    };
}

/**
 * Imports a todo list from a share link. Returns the new listId if successful, or null if failed.
 * The link should contain a ?data=... param with base64-encoded JSON.
 */
export async function importListFromLink(link: string): Promise<string | null> {
  try {
    const url = new URL(link, window.location.origin);
    const dataParam = url.searchParams.get('data');
    if (!dataParam) return null;
    const json = atob(decodeURIComponent(dataParam));
    const imported = JSON.parse(json);
    // Validate imported object (should have name, color, todos)
    if (!imported || typeof imported !== 'object' || !imported.name || !imported.color) return null;
    const provider = GlobalPocketBaseProvider.getInstance();
    // Create a new list (as if user created it)
    const newListId = provider.createNewList(imported.name, imported.color);
    // Add todos to the new list's Yjs doc
    const doc = provider.getDocument(newListId);
    if (doc) {
      const ylist = doc.getMap('list');
      let ytodos = ylist.get('todos');
      if (!(ytodos instanceof Y.Array)) {
        ytodos = new Y.Array();
        ylist.set('todos', ytodos);
      }
      const todosArray = ytodos as Y.Array<Y.Map<any>>;
      // Add each todo (assign new ids, set listId)
      imported.todos?.forEach((todo: any) => {
        const newTodo = new Y.Map();
        newTodo.set('id', crypto.randomUUID());
        newTodo.set('text', todo.text || '');
        newTodo.set('completed', !!todo.completed);
        newTodo.set('createdAt', new Date().toISOString());
        newTodo.set('listId', newListId);
        if (todo.description) newTodo.set('description', todo.description);
        if (todo.deadline) newTodo.set('deadline', todo.deadline);
        if (todo.reminder) newTodo.set('reminder', todo.reminder);
        if (todo.recurring) newTodo.set('recurring', todo.recurring);
        todosArray.push([newTodo]);
      });
    }
    return newListId;
  } catch (e) {
    console.error('[importListFromLink] Failed to import:', e);
    return null;
  }
}

/**
 * Exports a todo list as a shareable link. Only includes name, color, and todos fields.
 * The link can be imported using importListFromLink.
 */
export function exportListToLink(list: { name: string; color: string; todos: any[] }): string {
  const exportObj = {
    name: list.name,
    color: list.color,
    todos: Array.isArray(list.todos) ? list.todos.map(todo => ({
      text: todo.text,
      description: todo.description,
      completed: !!todo.completed,
      deadline: todo.deadline,
      reminder: todo.reminder,
      recurring: todo.recurring,
    })) : [],
  };
  const json = JSON.stringify(exportObj);
  const encoded = encodeURIComponent(btoa(json));
  return `${window.location.origin}/import?data=${encoded}`;
}

/**
 * Returns true if the current user is the owner of the list.
 */
export function isListOwner(list: TodoList | TodoListWithTodos, currentUserId: string): boolean {
  return list.user_id === currentUserId;
}

/**
 * Returns the permissions record for the current user for a given list, or null if not found.
 * Only returns a record if the user is a collaborator (not the owner).
 */
export function getCollaboratorPermission(
  listId: string,
  permissions: PocketBasePermissionsRecord[],
  currentUserId: string
): PocketBasePermissionsRecord | null {
  return permissions.find(
    (perm) => perm.task_list === listId && perm.user_id === currentUserId && perm.status === 'active'
  ) || null;
}

/**
 * Returns the permission level ("owner", "edit", "view", or null) for the current user for a given list.
 * - "owner" if the user is the list owner
 * - "edit"/"view" if the user is a collaborator
 * - null if no access
 */
export function getListPermissionLevel(
  list: TodoList | TodoListWithTodos,
  permissions: PocketBasePermissionsRecord[],
  currentUserId: string
): 'owner' | 'edit' | 'view' | null {
  if (isListOwner(list, currentUserId)) return 'owner';
  const perm = getCollaboratorPermission(list.id, permissions, currentUserId);
  if (perm) return perm.permission === 'edit' ? 'edit' : 'view';
  return null;
}