'use client'

import { Card } from "@/components/ui/card"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Pin,
  Send,
  UserPlus,
  Users,
  Loader2,
} from "lucide-react"
import { useTodoLists } from "@/hooks/useTodoLists"
import { useYjsTodoList } from "@/hooks/useYjsTodoList"
import AuthService from "@/services/authService"
import { type Todo, type UserProfile } from "@/lib/types"
import { colors } from "@/lib/colors"
import AppSidebar from "@/components/AppSidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SidebarInset } from "@/components/ui/sidebar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import SyncStatusIndicator from "@/components/SyncStatusIndicator"
import { ShareDialog } from "@/components/ShareDialog"
import { ListOptionsDropdown } from "@/components/ListOptionsDropdown"
import { TaskScheduleOverlay } from "@/components/TaskScheduleOverlay"
import { useNotification } from "@/hooks/useNotification";
import { Notification } from "@/components/ui/Notification";
import { TaskCard } from "@/components/TaskCard"
import { ErrorMessage } from "@/components/ErrorMessage";
import { PersistenceWarning } from "@/components/PersistenceWarning";
import { StorageTypeIndicator } from "@/components/StorageTypeIndicator";

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
    syncStatus, // Add this
    readOnly, // <-- add this
  } = useYjsTodoList(activeListId)

  const [inputValue, setInputValue] = useState("")
  const [newListName, setNewListName] = useState("")
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [isAddingList, setIsAddingList] = useState(false)
  const [isAddingTodo, setIsAddingTodo] = useState(false)
  const [editingListName, setEditingListName] = useState<string | null>(null); // New state for editing list name
  const [showTaskOptions, setShowTaskOptions] = useState<string | null>(null)
  const [progressAnimating, setProgressAnimating] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUserProfile(currentUser);
    }
  }, []);
  const [showCompleted, setShowCompleted] = useState(true)

  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

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
    // Find the list snapshot from the main list state
    const listSnapshot = todoLists.find(l => l.id === activeListId);
    if (!listSnapshot || listSnapshot.deleted) return null; // Don't show deleted lists

    // Always use the readOnly value from the provider/hook
    return {
      ...listSnapshot,    // Start with snapshot data (like name, color, etc.)
      ...activeListData,    // Override with live data from Yjs (todos, and latest metadata)
      id: activeListId,
      readOnly, // <-- ensure this is always the provider's value
    };
  }, [activeListId, activeListData, todoLists, readOnly]);

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
    } catch (error) {
      console.error("Failed to add todo:", error)
    } finally {
      setIsAddingTodo(false)
    }
  }

  // Handle task toggle (updated to directly use the hook's function)
  const handleToggleTodo = async (todoId: string) => {
    try {
      await toggleTodo(todoId);
    } catch (error) {
      console.error("Failed to toggle todo:", error);
    }
  };

  // Handle task deletion (updated to directly use the hook's function)
  const handleDeleteTodo = async (todoId: string) => {
    try {
      await deleteTodo(todoId);
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  };

  // In handleUpdateTodo, ensure we pass the correct date values to the service
  const handleUpdateTodo = async (todoId: string, updates: Partial<Todo>) => {
    try {
      await updateTodoItem(todoId, updates);
    } catch (error) {
      console.error("Failed to update todo:", error);
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
  const handleUpdateListName = useCallback(async (newName: string | null) => {
    if (newName && newName.trim() !== "") {
      try {
        updateListMetadata({ name: newName });
      } catch (error) {
        console.error("Failed to update list name:", error);
      }
    }
    setIsEditingHeader(false);
  }, [updateListMetadata, addNotification]);

  // Toggle pin list (now uses Yjs metadata)
  const togglePinList = () => {
    try {
      updateListMetadata({ pinned: !activeListData.pinned });
    } catch (error) {
      console.error("Failed to toggle pin:", error);
    }
  };

  // Toggle archive list (now uses Yjs metadata)
  const toggleArchiveList = () => {
    try {
      updateListMetadata({ archived: !activeListData.archived });
    } catch (error) {
      console.error("Failed to toggle archive:", error);
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

  const CircularProgress = ({
    percentage,
    size = 6, 
    strokeWidth = 10,
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
        className={`flex items-center gap-1 transition-all duration-700 ${
          progressAnimating ? "animate-pulse scale-110" : ""
        }`}
        style={{ minWidth: size, minHeight: size }}
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
                transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </svg>
        </div>
        <span className={`text-xs font-medium ${color.replace("bg-", "text-")}`}>{activeCount} left</span>
      </div>
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

  const handleColorSelect = (colorValue: string) => {
    if (activeList) {
      updateListMetadata({ color: colorValue });
    }
    setShowShareDialog(false);
  };

  // Generate share URL (example: can be improved to use your backend logic)
  const shareUrl = `${window.location.origin}/list/${activeListId}?shared=1`;

  return (
    <div className={`min-h-screen relative overflow-hidden ${activeColor.light}`}>
      {/* Render notifications at the top right of the app */}
      {!showShareDialog && (
        <div className="fixed top-4 right-4 z-50">
          {notifications.map(n => (
            <Notification
              key={n.id}
              message={n.message}
              type={n.type}
              duration={n.duration}
              onClose={() => removeNotification(n.id)}
            />
          ))}
        </div>
      )}
      {/* Share Dialog */}
      <ShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        shareUrl={shareUrl}
        readOnly={activeList?.readOnly}
        listId={activeListId}
        activeColor={activeColor}
        listData={activeListData}
      />
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
          userProfile={userProfile!}
          isEditingProfile={isEditingProfile}
          setIsEditingProfile={setIsEditingProfile}
          setUserProfile={setUserProfile}
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
          <ErrorMessage error={error} onReload={() => window.location.reload()} />

          {/* Persistence Warning */}
          <PersistenceWarning
            show={showPersistenceWarning}
            persistenceType={persistenceType}
            persistenceError={persistenceError}
            onClose={() => setShowPersistenceWarning(false)}
          />

          {/* Storage Type Indicator */}
          <StorageTypeIndicator
            persistenceType={persistenceType}
            showPersistenceWarning={showPersistenceWarning}
          />

          {/* Task Schedule Overlay */}
          {showTaskOptions && (
            <TaskScheduleOverlay
              todo={
                activeTodos.find((t) => t.id === showTaskOptions) ||
                completedTodos.find((t) => t.id === showTaskOptions)!
              }
              readOnly={activeList?.readOnly}
              handleUpdateTodo={handleUpdateTodo}
              setShowTaskOptions={setShowTaskOptions}
              activeList={activeList}
              getDeadlineColor={getDeadlineColor}
              formatDateTime={formatDateTime}
              isValidDate={isValidDate}
              isOverdue={isOverdue}
              isDueToday={isDueToday}
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
                          handleUpdateListName(editingListName);
                          setIsEditingHeader(false);
                        } else if (e.key === 'Escape') {
                          setEditingListName(null);
                          setIsEditingHeader(false);
                          (document.activeElement as HTMLElement)?.blur();
                        }
                      }}
                      onBlur={() => {
                        handleUpdateListName(editingListName);
                        setIsEditingHeader(false);
                      }}
                      autoFocus
                      className="text-lg font-semibold text-slate-800 border-none focus:ring-0 focus:outline-none bg-transparent w-full p-0 !h-auto !text-lg"
                    />
                  ) : (
                    <h2
                      className="text-lg font-semibold text-slate-800 cursor-pointer truncate"
                      onClick={() => {
                        if (activeList?.readOnly) return;
                        setEditingListName(activeList.name);
                        setIsEditingHeader(true);
                      }}
                    >
                      {activeList.name || "Untitled List"}
                    </h2>
                  )}
                </div>

                {activeList.archived && <span className="text-sm text-slate-500 ml-2">(Archived)</span>}
                {/* Right-aligned controls */}
                <div className="flex items-center gap-2 ml-auto">
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
                    onClick={() => setShowShareDialog(true)}
                    className="flex items-center gap-2 px-2 py-1 rounded-md border bg-slate-100 border-slate-200"
                    disabled={activeList?.readOnly}
                  >
                    {activeList?.readOnly ? (
                      <Users className="w-4 h-4 text-slate-500" />
                    ) : (
                      <UserPlus className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="text-xs font-medium text-slate-700 hidden sm:inline">
                      {activeList?.readOnly ? "Shared" : "Share"}
                    </span>
                  </button>
                  {/* List Settings Dropdown */}
                  <div className="flex items-center gap-1">
                    <ListOptionsDropdown
                      readOnly={activeList?.readOnly}
                      pinned={activeList.pinned}
                      archived={activeList.archived}
                      onPinToggle={togglePinList}
                      onArchiveToggle={toggleArchiveList}
                      onClone={() => handleCloneList(activeList.id)}
                      onDelete={() => handleDeleteList(activeList.id)}
                      onColorSelect={handleColorSelect}
                      colors={colors}
                      currentColor={activeList.color}
                    />
                  </div>
                </div>
              </>
            )}
          </header>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto relative bg-slate-50" key={activeListId}>
            <div className="absolute inset-0 noise-texture-subtle opacity-10"></div>
            <div className="flex-1 items-center flex flex-col">
              <div className="transition-opacity duration-300 ease-out w-full relative z-10 sm:max-w-8/10 lg:max-w-5/10" style={{ transitionDelay: "150ms" }}>
              {activeList && (
                <>
                  {/* Readonly Notice */}
                  {activeList.readOnly && (
                    <div className="mb-6 animate-in fade-in-0 slide-in-from-top-4 duration-500">
                      <Card className="p-4 bg-blue-50 border-blue-200 border">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-blue-800">This is a read-only list.</h3>
                            <p className="text-sm text-blue-700 truncate">
                              You can view the tasks, but you cannot edit them.
                            </p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}
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
                            onClick={() => toggleArchiveList()}
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
                    {sortedActiveTodos.map((todo) => (
                      <TaskCard
                        key={todo.id}
                        todo={todo}
                        isCompleted={todo.completed}
                        readOnly={activeList?.readOnly}
                        activeList={activeList}
                        activeColor={activeColor}
                        setShowTaskOptions={setShowTaskOptions}
                        handleToggleTodo={handleToggleTodo}
                        handleDeleteTodo={handleDeleteTodo}
                        getDeadlineColor={getDeadlineColor}
                        formatDateTime={formatDateTime}
                        isOverdue={isOverdue}
                        isDueToday={isDueToday}
                      />
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
                              <TaskCard
                                todo={todo}
                                isCompleted={true}
                                readOnly={activeList?.readOnly}
                                activeList={activeList}
                                activeColor={activeColor}
                                setShowTaskOptions={setShowTaskOptions}
                                handleToggleTodo={handleToggleTodo}
                                handleDeleteTodo={handleDeleteTodo}
                                getDeadlineColor={getDeadlineColor}
                                formatDateTime={formatDateTime}
                                isOverdue={isOverdue}
                                isDueToday={isDueToday}
                              />
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
                          placeholder={activeList?.readOnly ? "This list is read-only" : `Add a task to ${activeList?.name}...`}
                          disabled={activeList?.archived || loading || activeList?.readOnly}
                          className="w-full h-12 pl-4 pr-14 text-base bg-transparent border-0 focus:ring-2 focus:ring-blue-100 outline-none transition-all duration-200 placeholder-slate-400"
                          style={{ boxShadow: 'none' }}
                        />
                        <Button
                          onClick={handleAddTodo}
                          disabled={!inputValue.trim() || activeList?.archived || isAddingTodo || activeList?.readOnly}
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
          </div>

          {/* Floating Input Section */}
          
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
