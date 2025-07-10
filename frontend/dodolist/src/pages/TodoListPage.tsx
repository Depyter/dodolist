"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import AuthService from "@/services/authService"
import { usePersistentTodoLists } from "@/services/todoService"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, // Import DropdownMenu components
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger, // Keep this
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
} from "lucide-react"

import AppSidebar from "@/components/AppSidebar"
import TexturedBackground from "@/components/TexturedBackground"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Notification } from "@/components/ui/Notification";
import SyncStatusIndicator from "@/components/SyncStatusIndicator";

interface Todo {
  id: string
  text: string
  description?: string
  completed: boolean
  createdAt: Date
  completedAt?: Date
  deadline?: Date
  reminder?: Date
  recurring?: "none" | "daily" | "weekly" | "monthly"
  listId: string
}

interface UserProfile {
  name: string
  email: string
  avatar?: string
}

const colors = [
  {
    name: "Taupe",
    value: "bg-stone-400",
    light: "bg-stone-50",
    border: "border-stone-200",
    text: "text-stone-700",
    dark: "bg-gradient-to-br from-stone-500 to-stone-700",
    darkText: "text-stone-50",
    texture: "bg-stone-400/10",
  },
  {
    name: "Olive",
    value: "bg-emerald-600",
    light: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-800",
    dark: "bg-gradient-to-br from-emerald-700 to-emerald-900",
    darkText: "text-emerald-50",
    texture: "bg-emerald-600/10",
  },
  {
    name: "Sand",
    value: "bg-amber-300",
    light: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dark: "bg-gradient-to-br from-amber-400 to-amber-600",
    darkText: "text-amber-50",
    texture: "bg-amber-300/10",
  },
  {
    name: "Clay",
    value: "bg-orange-300",
    light: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    dark: "bg-gradient-to-br from-orange-400 to-orange-600",
    darkText: "text-orange-50",
    texture: "bg-orange-300/10",
  },
  {
    name: "Stone",
    value: "bg-blue-400",
    light: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    dark: "bg-gradient-to-br from-blue-500 to-blue-700",
    darkText: "text-blue-50",
    texture: "bg-blue-400/10",
  },
  {
    name: "Moss",
    value: "bg-lime-400",
    light: "bg-lime-50",
    border: "border-lime-200",
    text: "text-lime-700",
    dark: "bg-gradient-to-br from-lime-500 to-lime-700",
    darkText: "text-lime-50",
    texture: "bg-lime-400/10",
  },
  {
    name: "Slate",
    value: "bg-slate-500",
    light: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    dark: "bg-gradient-to-br from-slate-600 to-slate-800",
    darkText: "text-slate-50",
    texture: "bg-slate-500/10",
  },
  {
    name: "Terracotta",
    value: "bg-rose-400",
    light: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    dark: "bg-gradient-to-br from-rose-500 to-rose-700",
    darkText: "text-rose-50",
    texture: "bg-rose-400/10",
  },
]

export default function DodoListApp() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const authService = new AuthService()
  
  // Logout function
  const handleLogout = () => {
    authService.logout()
    navigate('/login')
  }
  
  // State for persistence notification
  const [showPersistenceWarning, setShowPersistenceWarning] = useState(false);
  const [persistenceType, setPersistenceType] = useState<'memory' | 'indexeddb' | 'opfs' | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  
  // Persistence detection
  useEffect(() => {
    // Listen for messages from dbService about persistence type
    const handleStorageInfo = (event: any) => {
      if (event.detail?.type === 'persistence-info') {
        setPersistenceType(event.detail.storageType);
        setShowPersistenceWarning(event.detail.storageType === 'memory');
        setPersistenceError(event.detail.error || null);
        
        // Log detailed info for debugging
        console.log('Storage persistence info:', {
          type: event.detail.storageType,
          persistent: event.detail.persistent,
          error: event.detail.error
        });
      }
    };
    
    // Add event listener for custom event
    window.addEventListener('dodolist-storage-info', handleStorageInfo);
    
    // Cleanup
    return () => {
      window.removeEventListener('dodolist-storage-info', handleStorageInfo);
    };
  }, []);
  
  

  // Use the persistence hook, passing the collaborative mode flag
  const {
    todoLists,
    loading,
    error,
    activeListId,
    setActiveListId,
    createNewList,
    updateList,
    deleteList,
    addTodo,
    updateTodo: updateTodoItem,
    toggleTodo,
    deleteTodo,
    batchAddTodos,
    isPocketBaseConnected, // <-- add this
  } = usePersistentTodoLists();
  
  const [inputValue, setInputValue] = useState("")
  const [newListName, setNewListName] = useState("")
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [isAddingList, setIsAddingList] = useState(false)
  const [isAddingTodo, setIsAddingTodo] = useState(false)
  const [editingListName, setEditingListName] = useState<string | null>(null); // New state for editing list name
  const [showTaskOptions, setShowTaskOptions] = useState<string | null>(null)
  const [progressAnimating, setProgressAnimating] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: "John Doe",
    email: "john@example.com",
  })
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [tempProfile, setTempProfile] = useState<UserProfile>(userProfile)
  const [showCompleted, setShowCompleted] = useState(true)

  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [isEditingHeader, setIsEditingHeader] = useState(false);

  const activeList = todoLists.find((list) => list.id === activeListId)
  const activeColor = colors.find((color) => color.value === activeList?.color) || colors[0]

  // --- COLLABORATIVE TODO STATE --- (Removed as Yjs is handled in the hook)
  // const [collabTodos, setCollabTodos] = useState<Todo[]>([])
  // const [yTodos, setYTodos] = useState<Y.Array<any> | null>(null)
  // const [provider, setProvider] = useState<YjsTodoListProvider | null>(null)
  // const [yDoc, setYDoc] = useState<Y.Doc | null>(null)

  

  // --- Collaborative todo handlers --- (Removed as handled in the hook)
  // const handleAddTodoCollab = (text: string) => { ... }
  // const handleToggleTodoCollab = (todoId: string) => { ... }
  // const handleDeleteTodoCollab = (todoId: string) => { ... }
  // const handleUpdateTodoCollab = (todoId: string, updates: Partial<Todo>) => { ... }

  // --- Yjs integration --- (Removed as handled in the hook)
  // useEffect(() => { ... }, [activeListId])

  const todosToUse = activeList?.todos || [];
  const activeTodos = todosToUse.filter((todo) => !todo.completed)
  const completedTodos = todosToUse.filter((todo) => todo.completed)
  const sortedActiveTodos = [...activeTodos].sort((a, b) => {
    if (!isValidDate(a.deadline) && !isValidDate(b.deadline)) return 0
    if (!isValidDate(a.deadline)) return 1
    if (!isValidDate(b.deadline)) return -1
    return a.deadline.getTime() - b.deadline.getTime()
  })

  // --- Debugging ---
  useEffect(() => {
    console.log("Active List ID:", activeListId)
    console.log("Active List Todos:", activeList?.todos)
  }, [activeListId, activeList?.todos]) // Use isCollaborativeMode dependency

  const totalCount = activeList?.todos.length || 0
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
    if (inputValue.trim() && activeListId) {
      setIsAddingTodo(true);
      try {
        await addTodo({ text: inputValue.trim(), listId: activeListId });
        setInputValue("")
      } catch (err) {
        console.error("Error adding todo:", err)
      } finally {
        setIsAddingTodo(false);
      }
    }
  }

  // Create recurring task functionality is now handled in the todoService's toggleTodo method
  // No need to implement it here anymore

  // Handle task toggle (updated to directly use the hook's function)
  const handleToggleTodo = async (todoId: string) => {
    if (activeListId) {
      try {
        await toggleTodo(todoId, activeListId) // Directly call the hook's function
      } catch (err) {
        console.error("Error toggling todo:", err)
      }
    }
  }

  // Handle task deletion (updated to directly use the hook's function)
  const handleDeleteTodo = async (todoId: string) => {
    if (activeListId) {
      try {
        await deleteTodo(todoId, activeListId) // Directly call the hook's function
      } catch (err) {
        console.error("Error deleting todo:", err)
      }
    }
  }

  // In handleUpdateTodo, ensure we pass the correct date values to the service
  const handleUpdateTodo = async (todoId: string, updates: Partial<Todo>) => {
    if (activeListId) {
      // Convert deadline/reminder to ISO string if present and valid
      const updatesToSend: Partial<Todo> = { ...updates };
      if ('deadline' in updates && updates.deadline instanceof Date && !isNaN(updates.deadline.getTime())) {
        updatesToSend.deadline = new Date(updates.deadline); // keep as Date, todoService handles conversion
      }
      if ('reminder' in updates && updates.reminder instanceof Date && !isNaN(updates.reminder.getTime())) {
        updatesToSend.reminder = new Date(updates.reminder); // keep as Date, todoService handles conversion
      }
      try {
        await updateTodoItem(todoId, activeListId, updatesToSend)
      } catch (err) {
        console.error("Error updating todo:", err)
      }
    }
  }

  // Handle creating a new list (updated to use our persistence service)
  const handleCreateNewList = async () => {
    if (newListName.trim()) {
      setIsAddingList(true);
      try {
        const color = colors[Math.floor(Math.random() * colors.length)].value;
        await createNewList(newListName.trim(), color);
        setNewListName("");
        setShowNewListInput(false);
      } catch (err) {
        console.error("Error creating list:", err);
      } finally {
        setIsAddingList(false);
      }
    }
  }

  // Clone a list (updated to use our persistence service)
  const cloneList = async (listId: string) => {
    const listToClone = todoLists.find((list) => list.id === listId)
    if (!listToClone) return

    try {
      // Create a new list with a copy name
      const newListId = await createNewList(`${listToClone.name} (Copy)`, listToClone.color);
      
      // If the new list was created, clone the todos
      if (newListId) {
        const todosToClone = listToClone.todos.map(todo => ({
          listId: newListId,
          text: todo.text,
          description: todo.description,
          completed: false, // Cloned tasks are active by default
          createdAt: new Date(),
          deadline: todo.deadline,
          reminder: todo.reminder,
          recurring: todo.recurring,
        }));
        await batchAddTodos(todosToClone);
        
      }
    } catch (err) {
      console.error("Error cloning list:", err);
    }
  }

  // Handle deleting a list (updated to use our persistence service)
  const handleDeleteList = async (listId: string) => {
    try {
      await deleteList(listId);
    } catch (err) {
      console.error("Error deleting list:", err);
    }
  }

  // Update list name (updated to use our persistence service)
  const handleUpdateListName = useCallback(async (listId: string, newName: string | null) => {
    const trimmedName = newName?.trim();
    if (!trimmedName) {
      addNotification({
        message: "List name cannot be empty.",
        description: "Please enter a valid name for your list.",
        type: "error",
      });
      return;
    }
    try {
      await updateList(listId, { name: trimmedName });
      setEditingListId(null);
      setEditingListName(null);
      (document.activeElement as HTMLElement)?.blur();
    } catch (err) {
      console.error("Error updating list name:", err);
      addNotification({
        message: "Failed to update list name.",
        description: "Please try again.",
        type: "error",
      });
    }
  }, [updateList]);

  // Update list color (updated to use our persistence service)
  const updateListColor = async (listId: string, newColor: string) => {
    try {
      await updateList(listId, { color: newColor });
    } catch (err) {
      console.error("Error updating list color:", err);
    }
  }

  // Toggle pin list (updated to use our persistence service)
  const togglePinList = async (listId: string) => {
    const list = todoLists.find(l => l.id === listId);
    if (list) {
      try {
        await updateList(listId, { pinned: !list.pinned });
      } catch (err) {
        console.error("Error toggling list pin:", err);
      }
    }
  }

  // Toggle archive list (updated to use our persistence service)
  const toggleArchiveList = async (listId: string) => {
    const listToArchive = todoLists.find((list) => list.id === listId)
    if (!listToArchive) return

    try {
      await updateList(listId, { archived: !listToArchive.archived });
      
      // If archiving the active list, switch to another non-archived list
      if (listId === activeListId && !listToArchive.archived) {
        const activeLists = todoLists.filter((list) => !list.archived && list.id !== listId);
        if (activeLists.length > 0) {
          setActiveListId(activeLists[0].id);
        } else {
          // If no non-archived lists remain, create a new one
          await createNewList("New List", colors[0].value);
        }
      }
    } catch (err) {
      console.error("Error toggling list archive:", err);
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddTodo()
    }
  }

  const saveProfile = () => {
    setUserProfile(tempProfile)
    setIsEditingProfile(false)
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
    const isDueTodayTask = todo.deadline && isDueToday(todo.deadline)

    return (
      <Card
        key={todo.id}
        className={`p-3 transition-all duration-300 hover:shadow-md will-change-transform 
          ${isCompleted
            ? `${activeColor.light} ${activeColor.border} border opacity-60`
            : `${activeColor.light} ${activeColor.border} border backdrop-blur-sm`}
          ${isDueTodayTask && !isCompleted ? "border-red-500 border-2" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => handleToggleTodo(todo.id)}
            className="mt-0.5 text-slate-400 hover:text-slate-600 transition-colors min-w-[20px]"
          >
            {todo.completed ? (
              <CheckCircle2 className={`w-4 h-4 ${activeList?.color.replace("bg-", "text-")}`} />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-slate-800 leading-snug ${todo.completed ? "line-through text-slate-400" : ""}`}>
                {todo.text}
              </p>
              {todo.recurring && todo.recurring !== "none" && (
                <span
                  className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full"
                  title={`Repeats ${todo.recurring}`}
                >
                  {todo.recurring}
                </span>
              )}
            </div>

            {(todo.deadline || (todo.reminder && !todo.completed)) && (
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                {todo.deadline && (
                  <span className={`font-medium ${getDeadlineColor(todo.deadline)}`}>
                    Due{" "}
                    {todo.deadline.getHours() === 0 && todo.deadline.getMinutes() === 0
                      ? formatDateTime(todo.deadline, false)
                      : formatDateTime(todo.deadline, true)}
                    {isOverdue(todo.deadline) && " (Overdue)"}
                    {isDueToday(todo.deadline) && " (Today)"}
                  </span>
                )}
                {todo.reminder && !todo.completed && (
                  <span className="text-slate-500">
                    Remind{" "}
                    {todo.reminder.getHours() === 0 && todo.reminder.getMinutes() === 0
                      ? formatDateTime(todo.reminder, false)
                      : formatDateTime(todo.reminder, true)}
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
                onClick={() => setShowTaskOptions(todo.id)}
                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                title="Set deadline and reminder"
              >
                <Clock className="w-3.5 h-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteTodo(todo.id)}
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 p-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  // Only set activeListId from the URL param if it changes
  useEffect(() => {
    if (listId && listId !== activeListId) {
      setActiveListId(listId);
    }
    // Do NOT navigate here
  }, [listId, setActiveListId]);

  // Only redirect to the first available list if there is no listId in the URL (on initial mount)
  useEffect(() => {
    if (!listId && todoLists.length > 0 && activeListId) {
      // Only navigate if not already on the correct path
      if (window.location.pathname !== `/list/${activeListId}`) {
        navigate(`/list/${activeListId}`, { replace: true });
      }
    }
    // Only run on mount or when lists change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, todoLists.length, navigate]);

  // --- Notification System ---
  type NotificationType = "success" | "error" | "info" | "warning";
  interface NotificationState {
    id: number;
    message: string;
    description?: string;
    type?: NotificationType;
  }

  function useNotification() {
    const [notifications, setNotifications] = useState<NotificationState[]>([]);
    const addNotification = (n: Omit<NotificationState, "id">) => {
      setNotifications((prev) => [
        ...prev,
        { ...n, id: Date.now() + Math.random() },
      ]);
    };
    const removeNotification = (id: number) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    };
    return { notifications, addNotification, removeNotification };
  }

  const NotificationPortal: React.FC<{
    notifications: NotificationState[];
    removeNotification: (id: number) => void;
  }> = ({ notifications, removeNotification }) => (
    <div
      className="fixed top-6 right-6 z-[9999] flex flex-col items-end gap-2"
      style={{ pointerEvents: "none" }}
    >
      {notifications.map((n) => (
        <div key={n.id} style={{ pointerEvents: "auto" }}>
          <Notification
            message={n.message}
            description={n.description}
            type={n.type}
            onClose={() => removeNotification(n.id)}
          />
        </div>
      ))}
    </div>
  );

  const notificationApi = useNotification();
  const { notifications, addNotification, removeNotification } = notificationApi;

  // --- Sync Indicator State ---
  // Derive sync status from isPocketBaseConnected and connectionDebug
  const getSyncStatus = () => {
    if (!isPocketBaseConnected) return 'offline';
    return 'synced';
  };
  const syncStatus = getSyncStatus();

  return (
    <div className={`min-h-screen relative overflow-hidden ${activeColor.light}`}>
      <NotificationPortal notifications={notifications} removeNotification={removeNotification} />
      <TexturedBackground className="absolute inset-0" intensity="normal" />
      <SidebarProvider>
        <AppSidebar
          todoLists={todoLists}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
          newListName={newListName}
          setNewListName={setNewListName}
          showNewListInput={showNewListInput}
          setShowNewListInput={setShowNewListInput}
          isAddingList={isAddingList}
          createNewList={handleCreateNewList}
          updateListName={handleUpdateListName}
          togglePinList={togglePinList}
          toggleArchiveList={toggleArchiveList}
          cloneList={cloneList}
          updateListColor={updateListColor}
          deleteList={handleDeleteList}
          colors={colors}
          userProfile={userProfile}
          tempProfile={tempProfile}
          setTempProfile={setTempProfile}
          isEditingProfile={isEditingProfile}
          setIsEditingProfile={setIsEditingProfile}
          saveProfile={saveProfile}
          editingListId={editingListId}
          setEditingListId={setEditingListId}
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
                {/* List Icon/Color */}
                {activeList.archived ? (
                  <Archive className={`w-3 h-3 ml-2 ${activeColor.text}`} />
                ) : activeList.pinned ? (
                  <Pin className={`w-3 h-3 ml-2 ${activeColor.text}`} />
                ) : (
                  <div className={`w-3 h-3 rounded-full ${activeList.color} ml-2`} />
                )}

                {/* List Name (Editable) */}
                <div className="flex-1 min-w-0 max-w-xs md:max-w-md">
                  {isEditingHeader ? (
                    <Input
                      value={editingListName !== null ? editingListName : activeList.name} // Use editingListName
                      onChange={(e) => setEditingListName(e.target.value)} // Update editingListName
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleUpdateListName(activeList.id, editingListName);
                          setIsEditingHeader(false); // Exit edit mode
                        } else if (e.key === 'Escape') {
                          setEditingListName(null); // Reset temp name
                          setIsEditingHeader(false); // Exit edit mode
                          (document.activeElement as HTMLElement)?.blur();
                        }
                      }}
                      onBlur={() => {
                        handleUpdateListName(activeList.id, editingListName);
                        setIsEditingHeader(false); // Exit edit mode
                      }}
                      autoFocus
                      className="text-lg font-semibold text-slate-800 border-none focus:ring-0 focus:outline-none bg-transparent w-full p-0 !h-auto !text-lg"
                    />
                  ) : (
                    <h2
                      className="text-lg font-semibold text-slate-800 cursor-pointer truncate"
                      onClick={() => {
                        setEditingListName(activeList.name); // Set initial name for editing
                        setIsEditingHeader(true);
                      }}
                    >
                      {activeList.name}
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

                {/* List Options Menu */}
                <div className="ml-auto flex items-center gap-1">
                  

                  {/* Clone List Button */}
                  <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clone List"
                      className="h-8 w-8 p-0 text-slate-600 hover:text-slate-800"
                      onClick={() => cloneList(activeList.id)}
                      title="Clone List"
                  >
                      <Copy className="w-4 h-4" />
                  </Button>

                  <SyncStatusIndicator status={syncStatus} activeColor={activeColor} />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="More list options"
                        className="h-8 w-8 p-0 text-slate-600 hover:text-slate-800"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm">
                      {!activeList.archived && (
                        <DropdownMenuItem onClick={() => togglePinList(activeList.id)}>
                          {activeList.pinned ? <PinOff className="w-4 h-4 mr-2" /> : <Pin className="w-4 h-4 mr-2" />}
                          {activeList.pinned ? "Unpin" : "Pin"} List
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => toggleArchiveList(activeList.id)}>
                        {activeList.archived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
                        {activeList.archived ? "Unarchive" : "Archive"} List
                      </DropdownMenuItem>
                      <DropdownMenu> {/* Nested Dropdown for Change Color */}
                        <DropdownMenuTrigger asChild>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}> {/* Prevent closing parent */}
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
                                onClick={() => updateListColor(activeList.id, color.value)}
                              />
                            ))}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {todoLists.length > 1 && ( // Only allow deleting if more than one list exists
                        <DropdownMenuItem onClick={() => deleteList(activeList.id)} className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      )}
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
                        <Archive className="w-5 h-5 text-amber-600" />
                        <div>
                          <h3 className="font-medium text-amber-800">This list is archived</h3>
                          <p className="text-sm text-amber-700">
                            You can still view and manage tasks, but this list is hidden from your main workspace.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleArchiveList(activeList.id)}
                          className="ml-auto text-amber-700 border-amber-300 hover:bg-amber-100"
                        >
                          <ArchiveRestore className="w-4 h-4 mr-2" />
                          Unarchive
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

// Utility function to check for valid Date
function isValidDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}