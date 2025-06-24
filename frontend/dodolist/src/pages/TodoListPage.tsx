"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import AuthService from "@/services/authService"
import { usePersistentTodoLists } from "@/services/todoService"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
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
  AlertTriangle
} from "lucide-react"

import AppSidebar from "@/components/AppSidebar"
import TexturedBackground from "@/components/TexturedBackground"

// We're using the Todo and TodoList interfaces from todoService.ts,
// but we'll still define them here to maintain type safety without refactoring the whole file
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
    name: "Ocean",
    value: "bg-blue-500",
    light: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    dark: "bg-gradient-to-br from-blue-600 to-blue-800",
    darkText: "text-blue-50",
    texture: "bg-blue-500/10",
  },
  {
    name: "Forest",
    value: "bg-emerald-500",
    light: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dark: "bg-gradient-to-br from-emerald-600 to-emerald-800",
    darkText: "text-emerald-50",
    texture: "bg-emerald-500/10",
  },
  {
    name: "Sunset",
    value: "bg-orange-500",
    light: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    dark: "bg-gradient-to-br from-orange-600 to-orange-800",
    darkText: "text-orange-50",
    texture: "bg-orange-500/10",
  },
  {
    name: "Lavender",
    value: "bg-purple-500",
    light: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    dark: "bg-gradient-to-br from-purple-600 to-purple-800",
    darkText: "text-purple-50",
    texture: "bg-purple-500/10",
  },
  {
    name: "Rose",
    value: "bg-rose-500",
    light: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    dark: "bg-gradient-to-br from-rose-600 to-rose-800",
    darkText: "text-rose-50",
    texture: "bg-rose-500/10",
  },
  {
    name: "Sky",
    value: "bg-cyan-500",
    light: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-700",
    dark: "bg-gradient-to-br from-cyan-600 to-cyan-800",
    darkText: "text-cyan-50",
    texture: "bg-cyan-500/10",
  },
  {
    name: "Amber",
    value: "bg-amber-500",
    light: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dark: "bg-gradient-to-br from-amber-600 to-amber-800",
    darkText: "text-amber-50",
    texture: "bg-amber-500/10",
  },
  {
    name: "Indigo",
    value: "bg-indigo-500",
    light: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-700",
    dark: "bg-gradient-to-br from-indigo-600 to-indigo-800",
    darkText: "text-indigo-50",
    texture: "bg-indigo-500/10",
  },
]

export default function DodoListApp() {
  const navigate = useNavigate()
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
  
  // Use the SQLite persistence hook
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
    deleteTodo
  } = usePersistentTodoLists();
  
  const [inputValue, setInputValue] = useState("")
  const [newListName, setNewListName] = useState("")
  const [isCreatingList, setIsCreatingList] = useState(false)
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

  const activeList = todoLists.find((list) => list.id === activeListId)
  const activeColor = colors.find((color) => color.value === activeList?.color) || colors[0]

  const activeTodos = activeList?.todos.filter((todo) => !todo.completed) || []
  const completedTodos = activeList?.todos.filter((todo) => todo.completed) || []

  // Sort active todos by due date priority
  const sortedActiveTodos = [...activeTodos].sort((a, b) => {
    // If neither has deadline, maintain original order
    if (!a.deadline && !b.deadline) return 0
    // Tasks with deadlines come before tasks without
    if (!a.deadline) return 1
    if (!b.deadline) return -1

    // Both have deadlines, sort by date
    return a.deadline.getTime() - b.deadline.getTime()
  })

  // Check for reminders
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date()
      todoLists.forEach((list) => {
        list.todos.forEach((todo) => {
          if (todo.reminder && !todo.completed && todo.reminder <= now) {
            // In a real app, you'd show a notification here
            console.log(`Reminder: ${todo.text}`)
          }
        })
      })
    }

    const interval = setInterval(checkReminders, 60000)
    return () => clearInterval(interval)
  }, [todoLists])

  // Animate progress bar when tasks are completed
  const totalCount = activeList?.todos.length || 0
  const activeCount = activeTodos.length

  useEffect(() => {
    if (activeCount === 0 && totalCount > 0) {
      setProgressAnimating(true)
      const timer = setTimeout(() => setProgressAnimating(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [activeCount, totalCount])

  // Handle adding a new todo (updated to use our persistence service)
  const handleAddTodo = async () => {
    if (inputValue.trim() && activeListId) {
      try {
        await addTodo(inputValue.trim(), activeListId);
        setInputValue("");
      } catch (err) {
        console.error("Error adding todo:", err);
      }
    }
  }

  // Create recurring task functionality is now handled in the todoService's toggleTodo method
  // No need to implement it here anymore

  // Handle task toggle (updated to use our persistence service)
  const handleToggleTodo = async (todoId: string) => {
    if (activeListId) {
      try {
        await toggleTodo(todoId, activeListId);
      } catch (err) {
        console.error("Error toggling todo:", err);
      }
    }
  }

  // Handle task deletion (updated to use our persistence service)
  const handleDeleteTodo = async (todoId: string) => {
    if (activeListId) {
      try {
        await deleteTodo(todoId, activeListId);
      } catch (err) {
        console.error("Error deleting todo:", err);
      }
    }
  }

  // Handle task update (updated to use our persistence service)
  const handleUpdateTodo = async (todoId: string, updates: Partial<Todo>) => {
    if (activeListId) {
      try {
        await updateTodoItem(todoId, activeListId, updates);
      } catch (err) {
        console.error("Error updating todo:", err);
      }
    }
  }

  // Handle creating a new list (updated to use our persistence service)
  const handleCreateNewList = async () => {
    if (newListName.trim()) {
      try {
        const color = colors[Math.floor(Math.random() * colors.length)].value;
        await createNewList(newListName.trim(), color);
        setNewListName("");
        setIsCreatingList(false);
      } catch (err) {
        console.error("Error creating list:", err);
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
      
      // Add all the todos from the original list to the new list
      if (newListId) {
        for (const todo of listToClone.todos) {
          await addTodo(todo.text, newListId);
          // If we want to copy more properties, we would need to update the new todo
        }
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
  const updateListName = useCallback(async (listId: string, newName: string) => {
    // Only update if the new name is not empty
    if (newName.trim()) {
      try {
        await updateList(listId, { name: newName.trim() });
      } catch (err) {
        console.error("Error updating list name:", err);
      }
    }
    setEditingListId(null)
  }, [updateList])

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
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate())
    return deadlineDate < today
  }

  const isDueToday = (deadline: Date) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate())
    return deadlineDate.getTime() === today.getTime()
  }

  const isDueSoon = (deadline: Date) => {
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    return deadline > now && deadline <= tomorrow
  }

  const getDeadlineColor = (deadline: Date) => {
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
                    value={todo.deadline ? todo.deadline.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        const newDate = new Date(e.target.value)
                        if (deadlineHasTime && todo.deadline) {
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
                    value={todo.reminder ? todo.reminder.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        const newDate = new Date(e.target.value)
                        if (reminderHasTime && todo.reminder) {
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

  return (
    <div className={`min-h-screen relative overflow-hidden ${activeColor.light}`}>
      <TexturedBackground className="absolute inset-0" intensity="normal" />
      <SidebarProvider>
        <AppSidebar
          todoLists={todoLists}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
          newListName={newListName}
          setNewListName={setNewListName}
          isCreatingList={isCreatingList}
          setIsCreatingList={setIsCreatingList}
          createNewList={handleCreateNewList}
          updateListName={updateListName}
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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-blue-200 px-4 relative z-10 bg-white/60 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
            {activeList && (
              <>
                {activeList.archived ? (
                  <Archive className={`w-3 h-3 ml-2 ${activeColor.text}`} />
                ) : activeList.pinned ? (
                  <Pin className={`w-3 h-3 ml-2 ${activeColor.text}`} />
                ) : (
                  <div className={`w-3 h-3 rounded-full ${activeList.color} ml-2`} />
                )}
                <h2 className="text-lg font-semibold text-slate-800 flex-1">
                  {activeList.name}
                  {activeList.archived && <span className="text-sm text-slate-500 ml-2">(Archived)</span>}
                </h2>
                {activeCount > 0 && (
                  <CircularProgress
                    percentage={totalCount > 0 ? ((totalCount - activeCount) / totalCount) * 100 : 0}
                    size={32}
                    strokeWidth={4}
                    color={activeList.color}
                  />
                )}
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
              </>
            )}
            </div>
          </div>

          {/* Input Section - Limited width on desktop */}
          <div className="p-6 pt-0">
            <div className="max-w-2xl mx-auto">
              <Card className={`p-4 ${activeColor.light} ${activeColor.border} border backdrop-blur-sm`}>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={`Add a task to ${activeList?.name}...`}
                      className="border-slate-200 focus:border-slate-300 focus:ring-slate-200 bg-white/80"
                      disabled={activeList?.archived || loading}
                    />
                  </div>
                  <Button
                    onClick={handleAddTodo}
                    disabled={!inputValue.trim() || activeList?.archived || loading}
                    className={`${activeList?.color} hover:opacity-90 text-white px-4`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>

                {inputValue.trim() && !activeList?.archived && (
                  <div className="mt-2 text-xs text-slate-500">Press Enter or click send to add this task</div>
                )}
                {activeList?.archived && (
                  <div className="mt-2 text-xs text-amber-600">Cannot add tasks to archived lists</div>
                )}
              </Card>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}