import { useState, useCallback } from "react";

export type NotificationType = "success" | "error" | "info" | "warning";
export interface NotificationState {
  id: number;
  message: string;
  type: NotificationType;
  duration?: number;
}

export function useNotification() {
  const [notifications, setNotifications] = useState<NotificationState[]>([]);

  const addNotification = useCallback((notification: Omit<NotificationState, 'id'>) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { ...notification, id }]);
  }, []);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return { notifications, addNotification, removeNotification };
}
