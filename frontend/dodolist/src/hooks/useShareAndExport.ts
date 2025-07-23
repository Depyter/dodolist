import { useState, useCallback } from "react";
import { GlobalPocketBaseProvider } from "@/services/yjsPocketBase";
import type { TodoListWithTodos } from "@/lib/types";

export type SharePerson = { email: string; permission: "edit" | "view" };

export function useShareOptions(listId: string | null) {
  // In a real app, fetch these from backend or Yjs doc metadata
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"edit" | "view">("edit");
  const [isPublic, setIsPublic] = useState(false);

  // TODO: Integrate with Yjs doc or backend for real sharing logic
  const addPerson = useCallback((email: string, permission: "edit" | "view") => {
    if (email && !people.some((p) => p.email === email)) {
      setPeople([...people, { email, permission }]);
    }
    setInviteEmail("");
    setInvitePermission("edit");
  }, [people]);

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
    // TODO: Optionally, allow exporting as .json, .csv, etc.
    const dataStr = JSON.stringify(list, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    return url;
  }, []);

  // Import a list from JSON
  const importList = useCallback(async (file: File) => {
    // TODO: Validate and parse the file, then add to Yjs/DB
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      // TODO: Integrate with provider to add the imported list
      // e.g., GlobalPocketBaseProvider.getInstance().importList(data)
      return data;
    } catch (e) {
      throw new Error("Invalid file format");
    }
  }, []);

  return { exportList, importList };
}
