'use client'

import { Card } from "@/components/ui/card"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  DropdownMenu, // Import DropdownMenu components
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger, // Keep this
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu" // Correct path for DropdownMenu components
import {
  Archive,
  ArchiveRestore,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Pin,
  Repeat,
  Send,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Database,
  AlertTriangle,
  MoreVertical, // Import MoreVertical icon
  PinOff, // Import PinOff icon
  Copy, // Import Copy icon
  Palette, // Import Palette icon
  UserPlus,
  Users,
} from "lucide-react"
import { useTodoLists } from "@/hooks/useTodoLists"
import { useYjsTodoList } from "@/hooks/useYjsTodoList"
import AuthService from "@/services/authService"
import { type Todo, type UserProfile, type TodoListWithTodos } from "@/lib/types"
import { colors } from "@/lib/colors"
import AppSidebar from "@/components/AppSidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SidebarInset } from "@/components/ui/sidebar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Notification } from "@/components/ui/Notification"
import SyncStatusIndicator from "@/components/SyncStatusIndicator"
import { GlobalPocketBaseProvider } from '@/services/yjsPocketBase';
import * as Y from 'yjs';
import { uint8ArrayToBase64, getAllLocalYjsTodoLists } from '@/lib/utils';

export default function DodoListApp() {
  const { listId } = useParams()
  const navigate = useNavigate()
  const authService = useMemo(() => new AuthService(), []);

  // Logout function
  const handleLogout = () => {
    authService.logout();
    // The effect below will handle the redirect.
  };

  // Listen for auth changes and redirect if logged out
  useEffect(() => {
    const unsubscribe = authService.onAuthChange(() => {
      if (!authService.isAuthenticated()) {
        console.log('[TodoListPage] Auth state changed to unauthenticated, redirecting to login.');
        navigate('/login', { replace: true });
      }
    });

    // Initial check in case the page loads with an invalid token
    if (!authService.isAuthenticated()) {
      navigate('/login', { replace: true });
    }

    return () => {
      unsubscribe();
      // The authService instance has a BroadcastChannel that should be closed
      // when the component unmounts to prevent memory leaks.
      if (authService.destroy) {
        authService.destroy();
      }
    };
  }, [navigate, authService]);

  // State for persistence notification
  const [showPersistenceWarning, setShowPersistenceWarning] = useState(false)
  const [persistenceType, setPersistenceType] = useState<'memory' | 'indexeddb' | 'opfs' | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  // Persistence detection
  useEffect(() => {
    // Listen for messages from dbService about persistence type
    const handleStorageInfo = (event: any) => {
      if (event.detail?.type === 'persistence-info') {
        setPersistenceType(event.detail.storageType)
        setShowPersistenceWarning(event.detail.storageType === 'memory')
        setPersistenceError(event.detail.error || null)

        // Log detailed info for debugging
        console.log('Storage persistence info:', {
          type: event.detail.storageType,
          persistent: event.detail.persistent,
          error: event.detail.error
        })
      }
    }

    // Add event listener for custom event
    window.addEventListener('dodolist-storage-info', handleStorageInfo)

    // Cleanup
    return () => {
      window.removeEventListener('dodolist-storage-info', handleStorageInfo)
    }
  }, [])

  // Use the persistence hook, passing the collaborative mode flag
  const {
    todoLists,
    loading,
    error,
    activeListId,
    setActiveListId,
    createNewList,
    deleteList,
    cloneList,
  } = useTodoLists()

  // Use the Yjs hook for the active list
  const {
    listData: activeListData,
    addTodo,
    toggleTodo,
    deleteTodo,
    updateTodo: updateTodoItem,
    updateListMetadata, // <-- import the new method
    isConnected: isPocketBaseConnected,
    syncStatus, // Add this
  } = useYjsTodoList(activeListId)

  const [inputValue, setInputValue] = useState("")
  const [newListName, setNewListName] = useState("")
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [isAddingList, setIsAddingList] = useState(false)
  const [isAddingTodo, setIsAddingTodo] = useState(false)
  const [editingListName, setEditingListName] = useState<string | null>(null); // New state for editing list name
  const [showTaskOptions, setShowTaskOptions] = useState<string | null>(null)
  const [progressAnimating, setProgressAnimating] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: "Harley Van",
    email: "john@example.com",
  })
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [tempProfile, setTempProfile] = useState<UserProfile>(userProfile)
  const [showCompleted, setShowCompleted] = useState(true)

  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isShared, setIsShared] = useState(false);

  // --- Notification System ---
  type NotificationType = "success" | "error" | "info" | "warning";
  interface NotificationState {
    id: number;
    message: string;
    type: NotificationType;
    duration?: number;
  }

  function useNotification() {
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

  const { notifications, addNotification, removeNotification } = useNotification();

  // When the activeListId from the URL changes, update the hook's state
  useEffect(() => {
    if (listId && listId !== activeListId) {
      setActiveListId(listId);
    }
  }, [listId, activeListId, setActiveListId]);

  // The active list's data comes directly from the useYjsTodoList hook for reactivity.
  const activeList = useMemo(() => {
    if (!activeListId) return null;
    // Find the active list from our state, which is kept in sync with the provider
    const list = todoLists.find(l => l.id === activeListId);
    if (!list || list.deleted) return null; // Don't show deleted lists

    return {
      id: activeListId,
      ...activeListData, // This ensures we still get the live Yjs data for the active list
      name: list.name, // But we take metadata from the snapshot
      color: list.color,
      pinned: list.pinned,
      archived: list.archived,
    };
  }, [activeListId, activeListData, todoLists]);

  const activeColor = colors.find((color) => color.value === activeList?.color) || colors[0];

  // Use the todos from the reactive listData
  const todosToUse = activeListData.todos || [];
  const activeTodos = todosToUse.filter((todo) => !todo.completed);
  const completedTodos = todosToUse.filter((todo) => todo.completed);

  // Utility function to check for valid Date
  function isValidDate(date: any): date is Date {
    return date instanceof Date && !isNaN(date.getTime());
  }

  const sortedActiveTodos = [...activeTodos].sort((a, b) => {
    if (!isValidDate(a.deadline) && !isValidDate(b.deadline)) return 0
    if (!isValidDate(a.deadline)) return 1
    if (!isValidDate(b.deadline)) return -1
    return a.deadline.getTime() - b.deadline.getTime()
  })

  // --- Debugging ---
  useEffect(() => {
    console.log("Active List ID:", activeListId)
    console.log("Active List:", activeList)
    console.log("Active List Todos:", activeList?.todos)
    console.log("Todos to use:", todosToUse)
    console.log("Active todos:", activeTodos)
    console.log("Sorted active todos:", sortedActiveTodos)
  }, [activeListId, activeList, todosToUse, activeTodos, sortedActiveTodos]) // Use isCollaborativeMode dependency

  const totalCount = todosToUse.length || 0
  const activeCount = activeTodos.length

  useEffect(() => {
    if (activeCount === 0 && totalCount > 0) {
      setProgressAnimating(true)
      const timer = setTimeout(() => setProgressAnimating(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [activeCount, totalCount])

  // Handle adding a new todo (updated to directly use the hook's function)
  const handleAddTodo = async () => {
    if (inputValue.trim() === "" || !activeListId) return
    setIsAddingTodo(true)
    try {
      await addTodo(inputValue)
      setInputValue("")
      addNotification({
        message: "Task added successfully!",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to add todo:", error)
      addNotification({
        message: "Failed to add task.",
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsAddingTodo(false)
    }
  }

  // Handle task toggle (updated to directly use the hook's function)
  const handleToggleTodo = async (todoId: string) => {
    try {
      await toggleTodo(todoId);
      const todo = todosToUse.find(t => t.id === todoId);
      if (todo && !todo.completed) {
        addNotification({
          message: "Task marked as complete!",
          type: "success",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Failed to toggle todo:", error);
      addNotification({
        message: "Failed to update task.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Handle task deletion (updated to directly use the hook's function)
  const handleDeleteTodo = async (todoId: string) => {
    try {
      await deleteTodo(todoId);
      addNotification({
        message: "Task deleted.",
        type: "info",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to delete todo:", error);
      addNotification({
        message: "Failed to delete task.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // In handleUpdateTodo, ensure we pass the correct date values to the service
  const handleUpdateTodo = async (todoId: string, updates: Partial<Todo>) => {
    try {
      await updateTodoItem(todoId, updates);
      addNotification({
        message: "Task updated.",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to update todo:", error);
      addNotification({
        message: "Failed to update task.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Handle creating a new list (updated to use our persistence service)
  const handleCreateNewList = async () => {
    if (newListName.trim() === "") return;
    setIsAddingList(true);
    try {
      // Pick a random color from the colors array
      const randomColor = colors[Math.floor(Math.random() * colors.length)].value;
      const newId = createNewList(newListName, randomColor);
      setNewListName("");
      setShowNewListInput(false);
      navigate(`/list/${newId}`);
      addNotification({
        message: `List "${newListName}" created.`,
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to create list:", error);
      addNotification({
        message: "Failed to create list.",
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsAddingList(false);
    }
  };

  // Clone a list (updated to use our persistence service)
  const handleCloneList = (listId: string) => {
    try {
      const newId = cloneList(listId);
      navigate(`/list/${newId}`);
      addNotification({
        message: "List cloned successfully.",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to clone list:", error);
      addNotification({
        message: "Failed to clone list.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Handle deleting a list (updated to use our persistence service)
  const handleDeleteList = (listId: string) => {
    try {
      deleteList(listId);
      addNotification({
        message: "List deleted.",
        type: "info",
        duration: 3000,
      });
      // The hook now handles navigating to the next available list
    } catch (error) {
      console.error("Failed to delete list:", error);
      addNotification({
        message: "Failed to delete list.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Update list name (now uses Yjs metadata)
  const handleUpdateListName = useCallback(async (listId: string, newName: string | null) => {
    if (newName && newName.trim() !== "") {
      try {
        updateListMetadata({ name: newName });
        addNotification({
          message: "List name updated.",
          type: "success",
          duration: 3000,
        });
      } catch (error) {
        console.error("Failed to update list name:", error);
        addNotification({
          message: "Failed to update list name.",
          type: "error",
          duration: 3000,
        });
      }
    }
    setIsEditingHeader(false);
  }, [updateListMetadata, addNotification]);

  // Update list color (now uses Yjs metadata)
  const updateListColor = async (listId: string, newColor: string) => {
    try {
      updateListMetadata({ color: newColor });
      addNotification({
        message: "List color updated.",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to update list color:", error);
      addNotification({
        message: "Failed to update list color.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Toggle pin list (now uses Yjs metadata)
  const togglePinList = (listId: string) => {
    try {
      updateListMetadata({ pinned: !activeListData.pinned });
      addNotification({
        message: activeListData.pinned ? "List unpinned." : "List pinned.",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to toggle pin:", error);
      addNotification({
        message: "Failed to update pin status.",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Toggle archive list (now uses Yjs metadata)
  const toggleArchiveList = (listId: string) => {
    try {
      updateListMetadata({ archived: !activeListData.archived });
      addNotification({
        message: activeListData.archived ? "List unarchived." : "List archived.",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to toggle archive:", error);
      addNotification({
        message: "Failed to update archive status.",
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isAddingTodo) {
      handleAddTodo()
    }
  }

  const formatDateTime = (date: Date, includeTime = true) => {
    if (!isValidDate(date)) return "";
    if (includeTime) {
      const options: Intl.DateTimeFormatOptions = {
        weekday: "short",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }
      return date.toLocaleDateString("en-US", options).replace(" at ", ", ")
    } else {
      const options: Intl.DateTimeFormatOptions = {
        weekday: "short",
        month: "long",
        day: "numeric",
      }
      return date.toLocaleDateString("en-US", options)
    }
  }

  const isOverdue = (deadline: Date) => {
    if (!isValidDate(deadline)) return false;
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate())
    return deadlineDate < today
  }

  const isDueToday = (deadline: Date) => {
    if (!isValidDate(deadline)) return false;
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate())
    return deadlineDate.getTime() === today.getTime()
  }

  const isDueSoon = (deadline: Date) => {
    if (!isValidDate(deadline)) return false;
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    return deadline > now && deadline <= tomorrow
  }

  const getDeadlineColor = (deadline: Date) => {
    if (!isValidDate(deadline)) return "text-slate-600"
    if (isOverdue(deadline)) return "text-red-600"
    if (isDueToday(deadline)) return "text-red-600"
    if (isDueSoon(deadline)) return "text-orange-600"
    return "text-slate-600"
  }

  const TaskScheduleOverlay = ({ todo }: { todo: Todo }) => {
    const [deadlineHasTime, setDeadlineHasTime] = useState(!!todo.deadline)
    const [reminderHasTime, setReminderHasTime] = useState(!!todo.reminder)

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 font-sans-serif antialiased">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Schedule Task
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTaskOptions(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-6">
              {/* Task Preview */}
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-700 font-medium">{todo.text}</p>
              </div>

              {/* Recurring Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-slate-600" />
                  <h4 className="font-medium text-slate-800">Repeat</h4>
                </div>

                <select
                  value={todo.recurring || "none"}
                  onChange={(e) => handleUpdateTodo(todo.id, { recurring: e.target.value as Todo["recurring"] })}
                  className="w-full p-2 border border-slate-200 rounded-md text-sm"
                >
                  <option value="none">Don't repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>

                {todo.recurring && todo.recurring !== "none" && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">This task will repeat {todo.recurring}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Deadline Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-600" />
                  <h4 className="font-medium text-slate-800">Deadline</h4>
                </div>

                <div className="space-y-3">
                  <Input
                    type="date"
                    value={isValidDate(todo.deadline) && todo.deadline.toISOString() !== 'Invalid Date' ? todo.deadline.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        const newDate = new Date(e.target.value)
                        if (deadlineHasTime && isValidDate(todo.deadline)) {
                          newDate.setHours(todo.deadline.getHours(), todo.deadline.getMinutes())
                        } else {
                          newDate.setHours(9, 0) // Default to 9 AM if time is enabled
                        }
                        handleUpdateTodo(todo.id, { deadline: newDate })
                      } else {
                        handleUpdateTodo(todo.id, { deadline: undefined })
                        setDeadlineHasTime(false)
                      }
                    }}
                    className="w-full"
                  />

                  {todo.deadline && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="deadline-time"
                          checked={deadlineHasTime}
                          onChange={(e) => {
                            setDeadlineHasTime(e.target.checked)
                            if (e.target.checked && todo.deadline) {
                              const newDeadline = new Date(todo.deadline)
                              newDeadline.setHours(9, 0) // Default to 9 AM
                              handleUpdateTodo(todo.id, { deadline: newDeadline })
                            }
                          }}
                          className="rounded"
                        />
                        <label htmlFor="deadline-time" className="text-sm text-slate-600">
                          Set specific time
                        </label>
                      </div>

                      {deadlineHasTime && (
                        <div className="space-y-2">
                          <Input
                            type="time"
                            value={todo.deadline ? todo.deadline.toTimeString().slice(0, 5) : "09:00"}
                            onChange={(e) => {
                              if (todo.deadline && e.target.value) {
                                const newDeadline = new Date(todo.deadline)
                                const [hours, minutes] = e.target.value.split(":")
                                newDeadline.setHours(Number.parseInt(hours), Number.parseInt(minutes))
                                handleUpdateTodo(todo.id, { deadline: newDeadline })
                              }
                            }}
                            className="w-full"
                          />

                          {/* Quick time presets */}
                          <div className="flex flex-wrap gap-1">
                            {["09:00", "12:00", "17:00", "20:00"].map((time) => (
                              <Button
                                key={time}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (todo.deadline) {
                                    const newDeadline = new Date(todo.deadline)
                                    const [hours, minutes] = time.split(":")
                                    newDeadline.setHours(Number.parseInt(hours), Number.parseInt(minutes))
                                    handleUpdateTodo(todo.id, { deadline: newDeadline })
                                  }
                                }}
                                className="text-xs h-6 px-2"
                              >
                                {time}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {todo.deadline && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className={`text-sm font-medium ${getDeadlineColor(todo.deadline)}`}>
                          Due{" "}
                          {deadlineHasTime
                            ? formatDateTime(todo.deadline)
                            : todo.deadline.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "long",
                                day: "numeric",
                              })}
                          {isOverdue(todo.deadline) && " (Overdue)"}
                          {isDueToday(todo.deadline) && " (Today)"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reminder Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-600" />
                  <h4 className="font-medium text-slate-800">Reminder</h4>
                </div>

                <div className="space-y-3">
                  <Input
                    type="date"
                    value={isValidDate(todo.reminder) && todo.reminder.toISOString() !== 'Invalid Date' ? todo.reminder.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        const newDate = new Date(e.target.value)
                        if (reminderHasTime && isValidDate(todo.reminder)) {
                          newDate.setHours(todo.reminder.getHours(), todo.reminder.getMinutes())
                        } else {
                          newDate.setHours(8, 0) // Default to 8 AM if time is enabled
                        }
                        handleUpdateTodo(todo.id, { reminder: newDate })
                      } else {
                        handleUpdateTodo(todo.id, { reminder: undefined })
                        setReminderHasTime(false)
                      }
                    }}
                    className="w-full"
                  />

                  {todo.reminder && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="reminder-time"
                          checked={reminderHasTime}
                          onChange={(e) => {
                            setReminderHasTime(e.target.checked)
                            if (e.target.checked && todo.reminder) {
                              const newReminder = new Date(todo.reminder)
                              newReminder.setHours(8, 0) // Default to 8 AM
                              handleUpdateTodo(todo.id, { reminder: newReminder })
                            }
                          }}
                          className="rounded"
                        />
                        <label htmlFor="reminder-time" className="text-sm text-slate-600">
                          Set specific time
                        </label>
                      </div>

                      {reminderHasTime && (
                        <div className="space-y-2">
                          <Input
                            type="time"
                            value={todo.reminder ? todo.reminder.toTimeString().slice(0, 5) : "08:00"}
                            onChange={(e) => {
                              if (todo.reminder && e.target.value) {
                                const newReminder = new Date(todo.reminder)
                                const [hours, minutes] = e.target.value.split(":")
                                newReminder.setHours(Number.parseInt(hours), Number.parseInt(minutes))
                                handleUpdateTodo(todo.id, { reminder: newReminder })
                              }
                            }}
                            className="w-full"
                          />

                          {/* Quick time presets */}
                          <div className="flex flex-wrap gap-1">
                            {["08:00", "09:00", "12:00", "18:00"].map((time) => (
                              <Button
                                key={time}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (todo.reminder) {
                                    const newReminder = new Date(todo.reminder)
                                    const [hours, minutes] = time.split(":")
                                    newReminder.setHours(Number.parseInt(hours), Number.parseInt(minutes))
                                    handleUpdateTodo(todo.id, { reminder: newReminder })
                                  }
                                }}
                                className="text-xs h-6 px-2"
                              >
                                {time}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {todo.reminder && (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-700">
                          Remind{" "}
                          {reminderHasTime
                            ? formatDateTime(todo.reminder)
                            : todo.reminder.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "long",
                                day: "numeric",
                              })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleUpdateTodo(todo.id, { deadline: undefined, reminder: undefined, recurring: "none" })
                    setDeadlineHasTime(false)
                    setReminderHasTime(false)
                  }}
                  className="flex-1"
                >
                  Clear All
                </Button>
                <Button onClick={() => setShowTaskOptions(null)} className={`flex-1 ${activeList?.color} text-white`}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const CircularProgress = ({
    percentage,
    size = 40,
    strokeWidth = 5,
    color = "text-blue-500",
  }: {
    percentage: number
    size?: number
    strokeWidth?: number
    color?: string
  }) => {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const strokeDasharray = circumference
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    return (
      <div
        className={`flex items-center gap-2 transition-all duration-1000 ${
          progressAnimating ? "animate-pulse scale-110" : ""
        }`}
      >
        <div className="relative inline-flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              className="text-slate-200"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className={color.replace("bg-", "text-")}
              style={{
                transition: "stroke-dashoffset 0.3s ease-in-out",
              }}
            />
          </svg>
        </div>
        <span className={`text-xs font-medium ${color.replace("bg-", "text-")}`}>{activeCount} left</span>
      </div>
    )
  }

  const TaskCard = ({ todo, isCompleted = false }: { todo: Todo; isCompleted?: boolean }) => {
    // Defensive: fallback to a default color if activeList or color is missing
    const colorClass = (activeList && typeof activeList.color === 'string')
      ? activeList.color.replace("bg-", "text-")
      : "text-blue-500";
    const borderClass = (activeColor && typeof activeColor.border === 'string') ? activeColor.border : "border-slate-200";
    const lightClass = (activeColor && typeof activeColor.light === 'string') ? activeColor.light : "bg-slate-50";

    // Defensive: ensure todo fields are present and of correct type
    const todoText = typeof todo.text === 'string' ? todo.text : '';
    const recurring = typeof todo.recurring === 'string' ? todo.recurring : undefined;
    const completed = Boolean(todo.completed);
    const deadline = todo.deadline instanceof Date && !isNaN(todo.deadline.getTime()) ? todo.deadline : undefined;
    const reminder = todo.reminder instanceof Date && !isNaN(todo.reminder.getTime()) ? todo.reminder : undefined;
    const isDueTodayTask = !!deadline && isDueToday(deadline);

    return (
      <Card
        key={todo.id}
        className={`p-3 transition-all duration-300 hover:shadow-md will-change-transform 
          ${isCompleted
            ? `${lightClass} ${borderClass} border opacity-60`
            : `${lightClass} ${borderClass} border backdrop-blur-sm`}
          ${isDueTodayTask && !isCompleted ? "border-red-500 border-2" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => todo.id && handleToggleTodo(todo.id)}
            className="mt-0.5 text-slate-400 hover:text-slate-600 transition-colors min-w-[20px]"
          >
            {completed ? (
              <CheckCircle2 className={`w-4 h-4 ${colorClass}`} />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-slate-800 leading-snug ${completed ? "line-through text-slate-400" : ""}`}>
                {todoText}
              </p>
              {recurring && recurring !== "none" && (
                <span
                  className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full"
                  title={`Repeats ${recurring}`}
                >
                  {recurring}
                </span>
              )}
            </div>

            {(deadline || (reminder && !completed)) && (
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                {deadline && (
                  <span className={`font-medium ${getDeadlineColor(deadline)}`}>
                    Due{" "}
                    {deadline.getHours && deadline.getMinutes && deadline.getHours() === 0 && deadline.getMinutes() === 0
                      ? formatDateTime(deadline, false)
                      : formatDateTime(deadline, true)}
                    {isOverdue(deadline) && " (Overdue)"}
                    {isDueToday(deadline) && " (Today)"}
                  </span>
                )}
                {reminder && !completed && (
                  <span className="text-slate-500">
                    Remind{" "}
                    {reminder.getHours && reminder.getMinutes && reminder.getHours() === 0 && reminder.getMinutes() === 0
                      ? formatDateTime(reminder, false)
                      : formatDateTime(reminder, true)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!isCompleted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => todo.id && setShowTaskOptions(todo.id)}
                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                title="Set deadline and reminder"
              >
                <Clock className="w-3.5 h-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => todo.id && handleDeleteTodo(todo.id)}
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 p-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  

  // Only redirect to the first available list if there is no listId in the URL (on initial mount)
  useEffect(() => {
    if (!listId && todoLists.length > 0 && activeListId) {
      // Only navigate if not already on the correct path
      if (window.location.pathname !== `/list/${activeListId}`) {
        navigate(`/list/${activeListId}`, { replace: true });
      }
    }
  }, [listId, todoLists.length, navigate, activeListId]);

  // --- Notification System ---
  const NotificationPortal: React.FC<{
    notifications: NotificationState[];
    removeNotification: (id: number) => void;
  }> = ({ notifications, removeNotification }) => (
    <div className="fixed top-4 right-4 z-[100] w-80 space-y-2">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          {...notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );

  // Remove legacy PocketBase state/props and use Yjs-centric state for sidebar
  // Build yjsListDataMap from all local Yjs docs (not just those in todoLists), so the sidebar shows all known local lists, even those not yet synced to PocketBase. Pass this map to AppSidebar.
  const yjsListDataMap = useMemo(() => {
    // Get all known Yjs docs from the provider
    const provider = GlobalPocketBaseProvider.getInstance();
    const map: Record<string, { yjsUpdate: string }> = {};
    for (const [listId, docInstance] of (provider as any).documents.entries()) {
      const yjsUpdate = uint8ArrayToBase64(Y.encodeStateAsUpdate(docInstance.doc));
      map[listId] = { yjsUpdate };
    }
    return map;
  }, [/* optionally, dependencies that would change the set of local docs */]);

  const handleColorSelect = (colorValue: string) => {
    if (activeList) {
      updateListMetadata({ color: colorValue });
    }
    setDropdownOpen(false);
  };

  return (
    <div className={`min-h-screen relative overflow-hidden ${activeColor.light}`}>
      {/* <NotificationPortal notifications={notifications} removeNotification={removeNotification} /> */}
      
      <SidebarProvider>
        <AppSidebar
          allYjsLists={todoLists}
          activeListId={activeListId}
          newListName={newListName}
          setNewListName={setNewListName}
          showNewListInput={showNewListInput}
          setShowNewListInput={setShowNewListInput}
          isAddingList={isAddingList}
          createNewList={handleCreateNewList}
          colors={colors}
          userProfile={userProfile}
          isEditingProfile={isEditingProfile}
          setIsEditingProfile={setIsEditingProfile}
          onLogout={handleLogout}
        />
        <SidebarInset className="h-svh flex flex-col">
          {/* Loading indicator */}
          {loading && (
            <div className="fixed inset-0 flex items-center justify-center bg-white/50 z-50">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-2" />
                <p className="text-slate-600">Loading your tasks...</p>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="fixed inset-0 flex items-center justify-center bg-white/50 z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
                <div className="flex items-center gap-3 text-red-500 mb-4">
                  <AlertCircle className="w-6 h-6" />
                  <h3 className="text-lg font-semibold">Error Loading Data</h3>
                </div>
                <p className="text-slate-600 mb-4">{error.message || "Failed to load your tasks. Please try refreshing the page."}</p>
                <Button
                  onClick={() => window.location.reload()}
                  className="w-full"
                >
                  Refresh Page
                </Button>
              </div>
            </div>
          )}

          {/* Persistence Warning */}
          {showPersistenceWarning && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">Your data is not being saved permanently</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {persistenceError ?
                      `Database error: ${persistenceError}` :
                      "Your browser doesn't support persistent storage. Your tasks will be lost when you close this tab or refresh the page."}
                  </p>
                  {persistenceType === 'memory' && !persistenceError && (
                    <div className="mt-1 text-xs text-amber-700">
                      <p>For persistent storage, try:</p>
                      <ul className="list-disc list-inside mt-0.5">
                        <li>Using a modern browser like Chrome or Firefox</li>
                        <li>Enable third-party cookies in your browser settings</li>
                        <li>Try using a private/incognito window if storage is restricted</li>
                      </ul>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPersistenceWarning(false)}
                  className="h-6 w-6 p-0 text-amber-600"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Storage Type Indicator */}
          {persistenceType && !showPersistenceWarning && (
            <div className="px-4 py-1 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-600">
                {persistenceType === 'opfs' ? 'Using Origin Private File System for storage' :
                 persistenceType === 'indexeddb' ? 'Using IndexedDB for storage' :
                 'Using in-memory storage (data will be lost when page is closed)'}
              </span>
            </div>
          )}

          {/* Task Schedule Overlay */}
          {showTaskOptions && (
            <TaskScheduleOverlay
              todo={
                activeTodos.find((t) => t.id === showTaskOptions) ||
                completedTodos.find((t) => t.id === showTaskOptions)!
              }
            />
          )}

          {/* Header */}
          <header className="z-10 relative flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
            {activeList && (
              <>
                {/* List Icon/Color - use Yjs metadata */}
                {activeList.archived ? (
                  <Archive className={`w-4 h-4 ml-2 ${activeColor.text}`} />
                ) : activeList.pinned ? (
                  <Pin className={`w-4 h-4 ml-2 ${activeColor.text}`} />
                ) : (
                  <div className={`w-3 h-3 rounded-full ${activeList.color} ml-2`} />
                )}

                {/* List Name (Editable) - use Yjs metadata only */}
                <div className="flex-1 min-w-0 max-w-xs md:max-w-md flex items-center gap-2">
                  {isEditingHeader ? (
                    <Input
                      value={editingListName !== null ? editingListName : activeList.name}
                      onChange={(e) => setEditingListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleUpdateListName(activeList.id, editingListName);
                          setIsEditingHeader(false);
                        } else if (e.key === 'Escape') {
                          setEditingListName(null);
                          setIsEditingHeader(false);
                          (document.activeElement as HTMLElement)?.blur();
                        }
                      }}
                      onBlur={() => {
                        handleUpdateListName(activeList.id, editingListName);
                        setIsEditingHeader(false);
                      }}
                      autoFocus
                      className="text-lg font-semibold text-slate-800 border-none focus:ring-0 focus:outline-none bg-transparent w-full p-0 !h-auto !text-lg"
                    />
                  ) : (
                    <h2
                      className="text-lg font-semibold text-slate-800 cursor-pointer truncate"
                      onClick={() => {
                        setEditingListName(activeList.name);
                        setIsEditingHeader(true);
                      }}
                    >
                      {activeList.name || "Untitled List"}
                    </h2>
                  )}
                </div>

                {activeList.archived && <span className="text-sm text-slate-500 ml-2">(Archived)</span>}
                {activeCount > 0 && (
                  <CircularProgress
                  percentage={totalCount > 0 ? ((totalCount - activeCount) / totalCount) * 100 : 0}
                  size={32}
                  strokeWidth={4}
                  color={activeList.color}
                  />
                )}

                <SyncStatusIndicator syncStatus={syncStatus} activeColor={activeColor} />
                <button
                  onClick={() => setIsShared(!isShared)}
                  className="flex items-center gap-2 px-2 py-1 rounded-md border bg-slate-100 border-slate-200"
                >
                  {isShared ? (
                    <Users className="w-4 h-4 text-slate-500" />
                  ) : (
                    <UserPlus className="w-4 h-4 text-slate-500" />
                  )}
                  <span className="text-xs font-medium text-slate-700 hidden sm:inline">
                    {isShared ? "Shared" : "Share"}
                  </span>
                </button>
                
                {/* List Settings Dropdown */}
                <div className="ml-auto flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="List settings"
                        className="h-8 w-8 p-0 text-slate-600 hover:text-slate-800"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm">
                      {/* Pin/Unpin */}
                      <DropdownMenuItem onClick={() => togglePinList(activeList.id)}>
                        {activeList.pinned ? (
                          <>
                            <PinOff className="w-4 h-4 mr-2" />
                            <span>Unpin List</span>
                          </>
                        ) : (
                          <>
                            <Pin className="w-4 h-4 mr-2" />
                            <span>Pin List</span>
                          </>
                        )}
                      </DropdownMenuItem>
                      {/* Color Palette */}
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <DropdownMenuItem>
                              <Palette className="w-4 h-4 mr-2" />
                              Change Color
                            </DropdownMenuItem>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right">
                            <div className="grid grid-cols-4 gap-2 p-2">
                              {colors.map((color) => (
                                <button
                                  key={color.value}
                                  className={`w-6 h-6 rounded-full ${color.value} hover:scale-110 transition-transform`}
                                  onClick={() => handleColorSelect(color.value)}
                                />
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      <DropdownMenuSeparator />
                      {/* Archive/Unarchive */}
                      <DropdownMenuItem onClick={() => toggleArchiveList(activeList.id)}>
                        {activeList.archived ? (
                          <>
                            <ArchiveRestore className="w-4 h-4 mr-2" />
                            <span>Unarchive List</span>
                          </>
                        ) : (
                          <>
                            <Archive className="w-4 h-4 mr-2" />
                            <span>Archive List</span>
                          </>
                        )}
                      </DropdownMenuItem>
                      {/* Clone */}
                      <DropdownMenuItem onClick={() => handleCloneList(activeList.id)}>
                        <Copy className="w-4 h-4 mr-2" />
                        <span>Clone List</span>
                      </DropdownMenuItem>
                      {/* Delete */}
                      <DropdownMenuItem
                        onClick={() => handleDeleteList(activeList.id)}
                        className="text-red-500 hover:!text-red-600 focus:!bg-red-50 focus:!text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        <span>Delete List</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </header>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto relative bg-slate-50" key={activeListId}>
            <div className="absolute inset-0 noise-texture-subtle opacity-10"></div>
            <div className="transition-opacity duration-300 ease-out w-full relative z-10" style={{ transitionDelay: "150ms" }}>
            {activeList && (
              <>
                {/* Archived Notice */}
                {activeList.archived && (
                  <div className="mb-6 animate-in fade-in-0 slide-in-from-top-4 duration-500">
                    <Card className="p-4 bg-amber-50 border-amber-200 border">
                      <div className="flex items-center gap-3">
                        <Archive className="w-5 h-5 text-amber-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-amber-800">This list is archived</h3>
                          <p className="text-sm text-amber-700 truncate">
                            It's hidden from your main workspace.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleArchiveList(activeList.id)}
                          className="ml-auto text-amber-700 border-amber-300 hover:bg-amber-100 flex-shrink-0"
                        >
                          <ArchiveRestore className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Unarchive</span>
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}

                {/* Active Todo List */}
                <div className="space-y-2 mb-6">
                  {sortedActiveTodos.map((todo, index) => (
                    <div
                      key={todo.id}
                      className="animate-in fade-in-0 slide-in-from-top-2 duration-300 fill-mode-both"
                      style={{ animationDelay: `${index * 50}ms`, willChange: "transform, opacity" }}
                    >
                      <TaskCard todo={todo} />
                    </div>
                  ))}
                </div>

                {/* Empty State for Active Tasks */}
                {activeTodos.length === 0 && (
                  <div className="flex items-center justify-center mb-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
                    <Card
                      className={`p-8 text-center ${activeColor.light} ${activeColor.border} border max-w-md w-full`}
                    >
                      <div className="text-slate-400 mb-4">
                        <CheckCircle2 className="w-12 h-12 mx-auto" />
                      </div>
                      <h3 className={`text-lg font-medium ${activeColor.text} mb-2`}>
                        No active tasks in {activeList.name}
                      </h3>
                      <p className="text-slate-500 text-sm">
                        {activeList.archived
                          ? "This archived list has no active tasks"
                          : "Add your first task to get started"}
                      </p>
                    </Card>
                  </div>
                )}

                {/* Completed Tasks Section */}
                {completedTodos.length > 0 && (
                  <div className="mb-6">
                    <Button
                      variant="ghost"
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4"
                    >
                      {showCompleted ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      Completed ({completedTodos.length})
                    </Button>

                    {showCompleted && (
                      <div className="space-y-2">
                        {completedTodos.map((todo, index) => (
                          <div
                            key={todo.id}
                            className="animate-in fade-in-0 slide-in-from-top-2 duration-300 fill-mode-both"
                            style={{ animationDelay: `${index * 50}ms`, willChange: "transform, opacity" }}
                          >
                            <TaskCard todo={todo} isCompleted={true} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Input Section - Always at the bottom, above all main content */}
                <div className="w-full max-w-2xl mx-auto z-20 sticky bottom-0 left-0 right-0 bg-transparent pointer-events-none">
                  <Card className="border-0 shadow-none bg-transparent pointer-events-auto">
                    <div className="flex gap-0 items-center rounded-2xl overflow-hidden bg-white/90 border border-slate-200 shadow-sm">
                      <input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={`Add a task to ${activeList?.name}...`}
                        disabled={activeList?.archived || loading}
                        className="w-full h-12 pl-4 pr-14 text-base bg-transparent border-0 focus:ring-2 focus:ring-blue-100 outline-none transition-all duration-200 placeholder-slate-400"
                        style={{ boxShadow: 'none' }}
                      />
                      <Button
                        onClick={handleAddTodo}
                        disabled={!inputValue.trim() || activeList?.archived || isAddingTodo}
                        className={`h-12 min-w-[48px] rounded-none rounded-r-2xl ${activeList?.color} hover:opacity-90 text-white flex items-center justify-center shadow-none border-0`}
                        loading={isAddingTodo}
                        tabIndex={-1}
                        type="button"
                        style={{ boxShadow: 'none' }}
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    </div>
                    {activeList?.archived && (
                      <div className="mt-2 text-xs text-amber-600">Cannot add tasks to archived lists</div>
                    )}
                  </Card>
                </div>
              </>
            )}
            </div>
          </div>

          {/* Floating Input Section */}
          
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
