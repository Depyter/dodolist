import { useState, useCallback } from "react";
import { GlobalPocketBaseProvider } from "@/services/yjsPocketBase";
import type { TodoListWithTodos } from "@/lib/types";
import * as Y from 'yjs';
import { PermissionsService } from '@/services/permissionsService';
import AuthService from "@/services/authService";

export type SharePerson = { email: string; permission: "edit" | "view" };

export function useShareOptions(listId: string | null, addNotification?: (n: { message: string; type: "error" | "success" | "info" | "warning"; duration?: number }) => void) {
  // In a real app, fetch these from backend or Yjs doc metadata
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"edit" | "view">("edit");
  const [isPublic, setIsPublic] = useState(false);

  // TODO: Integrate with Yjs doc or backend for real sharing logic
  const addPerson = useCallback(async (email: string, permission: "edit" | "view") => {
    if (!email || people.some((p) => p.email === email)) {
      setInviteEmail("");
      setInvitePermission("edit");
      return;
    }
    let userId: string | null = null;
    try {
      userId = await PermissionsService.getUserIdByEmail(email);
      if (!userId) throw new Error('User not found');
    } catch (e) {
      if (addNotification) {
        addNotification({
          message: "No user found with that email.",
          type: "error",
          duration: 2000,
        });
      }
      setInviteEmail("");
      setInvitePermission("edit");
      return;
    }
    const authService = new AuthService();
    const invitedBy = authService.getUserId();
    const inviterEmail = authService.getUserEmail();
    if (!listId || typeof listId !== 'string' || !userId || typeof userId !== 'string' || !invitedBy) {
      setInviteEmail("");
      setInvitePermission("edit");
      return;
    }
    try {
      await PermissionsService.inviteUserToList({
        listId: listId as string,
        userId: userId as string, 
        invitedBy,
        inviterEmail: inviterEmail ?? "",
        permission
      });
      setPeople([...people, { email, permission }]);
    } catch (err) {
      if (addNotification) {
        addNotification({
          message: 'Failed to invite user: ' + (err as Error).message,
          type: 'error',
          duration: 3000,
        });
      }
    }
    setInviteEmail("");
    setInvitePermission("edit");
  }, [people, listId, addNotification]);

  const removePerson = useCallback((email: string) => {
    setPeople(people.filter((p) => p.email !== email));
  }, [people]);

  const changePermission = useCallback((email: string, permission: "edit" | "view") => {
    setPeople(people.map((p) => (p.email === email ? { ...p, permission } : p)));
  }, [people]);

  const togglePublic = useCallback(() => setIsPublic((v) => !v), []);

  // Optionally, sync with Yjs doc or backend here

  return {
    people,
    inviteEmail,
    setInviteEmail,
    invitePermission,
    setInvitePermission,
    addPerson,
    removePerson,
    changePermission,
    isPublic,
    togglePublic,
  };
}

// --- Export/Import Hook Scaffold ---
export function useListExportImport() {
  // Export a list as JSON
  const exportList = useCallback((list: TodoListWithTodos) => {
    // Only export name, color, todos (not id, user_id, createdAt, etc)
    const exportObj = {
      name: list.name,
      color: list.color,
      todos: Array.isArray(list.todos)
        ? list.todos.map(todo => ({
            text: todo.text,
            description: todo.description,
            completed: !!todo.completed,
            deadline: todo.deadline,
            reminder: todo.reminder,
            recurring: todo.recurring,
          }))
        : [],
    };
    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    return url;
  }, []);

  // Import a list from JSON file and add to Yjs backend
  const importList = useCallback(async (file: File) => {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid file format');
    }
    // Validate minimal fields
    if (!data || typeof data !== 'object' || !data.name || !data.color) {
      throw new Error('Missing required fields in imported list');
    }
    // Create a new list in Yjs backend
    const provider = GlobalPocketBaseProvider.getInstance();
    const newListId = provider.createNewList(data.name, data.color);
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
      (data.todos || []).forEach((todo: any) => {
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
  }, []);

  return { exportList, importList };
}
