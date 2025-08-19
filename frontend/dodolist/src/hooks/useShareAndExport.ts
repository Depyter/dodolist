import { useState, useCallback, useEffect } from "react";
import { GlobalPocketBaseProvider } from "@/services/yjsPocketBase";
import type { PocketBasePermissionsRecord, TodoListWithTodos } from "@/lib/types";
import * as Y from 'yjs';
import { PermissionsService } from '@/services/permissionsService';
import AuthService from "@/services/authService";

// The shape of a collaborator in the Share Dialog
export type SharePerson = {
  id: string; // The ID of the permission record
  userId: string;
  email: string;
  permission: "edit" | "view";
};

export function useShareOptions(
  listId: string | null,
  addNotification?: (n: { message: string; type: "error" | "success" | "info" | "warning"; duration?: number }) => void
) {
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"edit" | "view">("edit");
  const [isLoading, setIsLoading] = useState(false);

  const [authService] = useState(() => new AuthService());

  // Fetches the current collaborators for the list from the backend
  const fetchCollaborators = useCallback(async () => {
    if (!listId) return;
    setIsLoading(true);
    try {
      const perms = await PermissionsService.getAllPermissionsForList(listId);
      const ownerId = authService.getUserId();

      const collaborators = perms
        .filter(p => p.user_id !== ownerId) // Don't show the owner in the collaborators list
        .map((p: PocketBasePermissionsRecord) => ({
          id: p.id!,
          userId: p.user_id,
          email: p.expand?.user_id?.email || 'Unknown User',
          permission: p.permission as 'edit' | 'view',
        }));
      setPeople(collaborators);
    } catch (e) {
      console.error("Failed to fetch collaborators", e);
      if (addNotification) {
        addNotification({ message: "Could not load collaborators.", type: "error" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [listId, addNotification, authService]);

  // Fetch collaborators when the dialog is opened (listId changes)
  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  // Invite a new person to the list
  const addPerson = useCallback(async (email: string, permission: "edit" | "view") => {
    if (!email || people.some((p) => p.email === email)) {
      setInviteEmail("");
      return;
    }
    if (!listId) return;

    try {
      const userId = await PermissionsService.getUserIdByEmail(email);
      if (!userId) throw new Error('User not found with that email.');

      const invitedBy = authService.getUserId();
      const inviterEmail = authService.getUserEmail();
      if (!invitedBy || !inviterEmail) throw new Error('Could not identify inviter.');

      await PermissionsService.inviteUserToList({
        listId,
        userId,
        invitedBy,
        inviterEmail,
        permission,
      });

      if (addNotification) {
        addNotification({ message: `Invitation sent to ${email}.`, type: "success" });
      }
      // Refresh the list of collaborators to show the new invite (if your rules allow it)
      // Or you can add them to local state optimistically if your rules show pending invites.
      fetchCollaborators();

    } catch (err) {
      console.error("Failed to invite user:", err);
      if (addNotification) {
        addNotification({ message: (err as Error).message, type: 'error' });
      }
    }
    setInviteEmail("");
    setInvitePermission("edit");
  }, [people, listId, addNotification, authService, fetchCollaborators]);

  // Remove a person from the list
  const removePerson = useCallback(async (permissionId: string) => {
    try {
      await PermissionsService.removeCollaborator(permissionId);
      setPeople(prevPeople => prevPeople.filter(p => p.id !== permissionId));
      if (addNotification) {
        addNotification({ message: "Collaborator removed.", type: "info" });
      }
    } catch (e) {
      console.error("Failed to remove collaborator", e);
      if (addNotification) {
        addNotification({ message: "Failed to remove collaborator.", type: "error" });
      }
    }
  }, [addNotification]);

  // Change an existing person's permission
  const changePermission = useCallback(async (permissionId: string, newPermission: "edit" | "view") => {
    try {
      await PermissionsService.changePermission(permissionId, newPermission);
      setPeople(prevPeople =>
        prevPeople.map(p => (p.id === permissionId ? { ...p, permission: newPermission } : p))
      );
      if (addNotification) {
        addNotification({ message: "Permission updated.", type: "success", duration: 2000 });
      }
    } catch (e) {
      console.error("Failed to change permission", e);
      if (addNotification) {
        addNotification({ message: "Failed to update permission.", type: "error" });
      }
    }
  }, [addNotification]);

  return {
    people,
    isLoading,
    inviteEmail,
    setInviteEmail,
    invitePermission,
    setInvitePermission,
    addPerson,
    removePerson,
    changePermission,
    refresh: fetchCollaborators,
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
    if (!data || typeof data !== 'object' || !data.name || !data.tata.color) {
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