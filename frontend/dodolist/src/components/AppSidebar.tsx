import { memo, useEffect, useRef, useState, useCallback } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import {
  MoreHorizontal,
  Plus,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Edit3,
  Copy,
  Palette,
  Trash2,
  Settings,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useNavigate } from 'react-router-dom'
import AuthService from '@/services/authService'

interface Color {
  name: string;
  value: string;
  light: string;
  border: string;
  text: string;
  dark: string;
  darkText: string;
  texture: string;
}

interface TodoList {
  id: string;
  name: string;
  color: string;
  todos: any[];
  createdAt: Date;
  pinned?: boolean;
  archived?: boolean;
}

interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
}

interface ListMenuItemProps {
  list: TodoList;
  isActive: boolean;
  isArchived?: boolean;
  activeColor: Color;
  editingListId: string | null;
  setEditingListId: (id: string | null) => void;
  updateListName: (listId: string, newName: string) => void;
  togglePinList: (listId: string) => void;
  toggleArchiveList: (listId: string) => void;
  cloneList: (listId: string) => void;
  updateListColor: (listId: string, newColor: string) => void;
  deleteList: (listId: string) => void;
  todoLists: TodoList[];
  onListClick: (listId: string) => void;
  colors: Color[];
}

const ListMenuItem = memo(
  ({
    list,
    isActive,
    isArchived = false,
    activeColor,
    editingListId,
    setEditingListId,
    updateListName,
    togglePinList,
    toggleArchiveList,
    cloneList,
    updateListColor,
    deleteList,
    todoLists,
    onListClick,
    colors,
  }: ListMenuItemProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [currentName, setCurrentName] = useState(list.name);
    const [renameIntent, setRenameIntent] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { isMobile, setOpenMobile } = useSidebar(); // Use the hook
    const navigate = useNavigate();
    const lastNavRef = useRef<number>(0);

    // Sync local state if the prop changes from parent
    useEffect(() => {
      setCurrentName(list.name);
    }, [list.name]);

    // Focus input when editing starts
    useEffect(() => {
      if (editingListId === list.id && inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }, [editingListId, list.id]);

    const listColor = colors.find((color) => color.value === list.color) || colors[0];
    const activeTaskCount = list.todos.filter((todo) => !todo.completed).length;

    // Memoized navigation handler with guards
    const handleListClick = useCallback(() => {
      if (editingListId === list.id) return;
      // Prevent rapid successive navigations (e.g., double click)
      const now = Date.now();
      if (now - lastNavRef.current < 400) return;
      lastNavRef.current = now;
      // Only navigate if not already on this list
      if (window.location.pathname !== `/list/${list.id}`) {
        navigate(`/list/${list.id}`, { replace: true });
      }
      onListClick(list.id);
      if (isMobile) setOpenMobile(false);
    }, [editingListId, list.id, navigate, onListClick, isMobile, setOpenMobile]);

    const handleRename = () => {
      setRenameIntent(true);
      setEditingListId(list.id);
    };

    const handleUpdateName = () => {
      if (currentName.trim()) {
        updateListName(list.id, currentName.trim());
      } else {
        setCurrentName(list.name); // Revert if the name is empty
      }
    };

    const handleColorSelect = (colorValue: string) => {
      updateListColor(list.id, colorValue);
      setDropdownOpen(false);
    };

    return (
      <SidebarMenuItem key={list.id}>
        <SidebarMenuButton
          isActive={isActive}
          onClick={editingListId === list.id ? (e) => e.preventDefault() : handleListClick}
          data-list-id={list.id}
          className={`pr-12 transition-all duration-300 will-change-transform ${
            isActive ? "bg-white/30 text-white font-medium shadow-sm" : `${activeColor.darkText} hover:bg-white/15`
          } ${isArchived ? "opacity-70" : ""}`}
        >
          {isArchived ? (
            <Archive className={`w-3 h-3 ${isActive ? "text-white" : `${activeColor.darkText}`}`} />
          ) : list.pinned ? (
            <Pin className={`w-3 h-3 ${isActive ? "text-white" : `${activeColor.darkText}`}`} />
          ) : (
            <div className={`w-3 h-3 rounded-full ${list.color} transition-all duration-300 ${isActive ? "ring-1 ring-white" : ""}`} />
          )}
          {editingListId === list.id ? (
            <Input
              ref={inputRef}
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              onBlur={handleUpdateName}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleUpdateName();
                }
              }}
              className="flex-1 h-6 text-sm border-none p-0 focus:ring-0 focus:outline-none bg-transparent selection:bg-white/30"
            />
          ) : (
            <span
              className="flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleRename();
              }}
            >
              {list.name}
            </span>
          )}
          <span className={`text-xs ml-auto font-medium ${isActive ? listColor.text : `${activeColor.darkText} opacity-60`}`}>
            {activeTaskCount}
          </span>
        </SidebarMenuButton>

        {/* Hide menu actions on mobile */}
        <SidebarMenuAction showOnHover>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="More list options"
                  className={`h-6 w-6 p-0 ${activeColor.darkText} hover:bg-white/20 focus:bg-white/20 focus:ring-2 focus:ring-white/30`}
                >
                  <MoreHorizontal className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-white/95 backdrop-blur-sm"
                onCloseAutoFocus={(e) => {
                  if (renameIntent) {
                    e.preventDefault();
                    if (inputRef.current) {
                      const len = inputRef.current.value.length;
                      inputRef.current.focus();
                      inputRef.current.setSelectionRange(len, len);
                    }
                    setRenameIntent(false);
                  }
                }}
              >
                {!isArchived && (
                  <DropdownMenuItem onClick={() => togglePinList(list.id)}>
                    {list.pinned ? <PinOff className="w-4 h-4 mr-2" /> : <Pin className="w-4 h-4 mr-2" />}
                    {list.pinned ? "Unpin" : "Pin"} List
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => toggleArchiveList(list.id)}>
                  {list.archived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
                  {list.archived ? "Unarchive" : "Archive"} List
                </DropdownMenuItem>
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
                {todoLists.length > 1 && (
                  <DropdownMenuItem onClick={() => deleteList(list.id)} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuAction>
      </SidebarMenuItem>
    );
  }
);

ListMenuItem.displayName = "ListMenuItem";

interface AppSidebarProps {
  todoLists: TodoList[];
  activeListId: string;
  setActiveListId: (id: string) => void;
  newListName: string;
  setNewListName: (name: string) => void;
  showNewListInput: boolean;
  setShowNewListInput: (show: boolean) => void;
  isAddingList: boolean;
  createNewList: () => void;
  updateListName: (listId: string, newName: string) => void;
  togglePinList: (listId: string) => void;
  toggleArchiveList: (listId: string) => void;
  cloneList: (listId: string) => void;
  updateListColor: (listId: string, newColor: string) => void;
  deleteList: (listId: string) => void;
  colors: Color[];
  userProfile: UserProfile;
  tempProfile: UserProfile;
  setTempProfile: (profile: UserProfile) => void;
  isEditingProfile: boolean;
  setIsEditingProfile: (editing: boolean) => void;
  saveProfile: () => void;
  editingListId: string | null;
  setEditingListId: (id: string | null) => void;
  onLogout?: () => void;
}

const AppSidebar = memo(({
  todoLists,
  activeListId,
  setActiveListId,
  newListName,
  setNewListName,
  showNewListInput,
  setShowNewListInput,
  isAddingList,
  createNewList,
  updateListName,
  togglePinList,
  toggleArchiveList,
  cloneList,
  updateListColor,
  deleteList,
  colors,
  userProfile,
  tempProfile,
  setTempProfile,
  isEditingProfile,
  setIsEditingProfile,
  saveProfile,
  editingListId,
  setEditingListId,
  onLogout,
}: AppSidebarProps) => {
  const navigate = useNavigate()
  const [authService] = useState(() => new AuthService())
  const [currentUser, setCurrentUser] = useState(authService.getCurrentUser())
  
  // Get authenticated user on component mount
  useEffect(() => {
    const user = authService.getCurrentUser()
    if (user) {
      setCurrentUser(user)
    }
  }, [authService])
  
  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      authService.logout()
      navigate('/login')
    }
  }

  const activeList = todoLists.find((list) => list.id === activeListId);
  const activeColor = colors.find((color) => color.value === activeList?.color) || colors[0];

  // Separate lists by status
  const activeLists = todoLists.filter((list) => !list.archived);
  const archivedLists = todoLists.filter((list) => list.archived);
  const pinnedLists = activeLists.filter((list) => list.pinned);
  const unpinnedLists = activeLists.filter((list) => !list.pinned);

  // Memoized sidebar navigation handler with guards
  const handleSidebarListClick = useCallback((listId: string) => {
    // Prevent rapid navigation and unnecessary state updates
    if (activeListId === listId) return;
    setActiveListId(listId);
  }, [activeListId, setActiveListId]);

  // Track the previous list ids to detect when a new list is added
  const prevListIdsRef = useRef<string[]>(todoLists.map(list => list.id));
  
  // Focus on the newly created list when it's added
  useEffect(() => {
    // Get current list ids
    const currentListIds = todoLists.map(list => list.id);
    
    // If we have more lists than before, find the newly added list id
    if (currentListIds.length > prevListIdsRef.current.length) {
      // Find the id that is in the current list but not in the previous list
      const newListId = currentListIds.find(id => !prevListIdsRef.current.includes(id));
      
      if (newListId) {
        navigate(`/list/${newListId}`);
        // Use a small timeout to ensure the DOM has updated
        setTimeout(() => {
          // Find the button for the newly created list and focus it
          const newListButton = document.querySelector(`[data-list-id="${newListId}"]`) as HTMLButtonElement;
          if (newListButton) {
            newListButton.focus();
          }
        }, 50);
      }
    }
    
    // Update the previous list ids
    prevListIdsRef.current = currentListIds;
  }, [todoLists, navigate]);

  return (
    <Sidebar className="border-r-0 overflow-hidden">
      {/* Base solid color background for the sidebar */}
      <div className={`absolute inset-0 ${activeColor.dark}`} />
      
      {/* Direct noise texture instead of using the component */}
      <div className="absolute inset-0 noise-texture-subtle" style={{ opacity: 0.13, mixBlendMode: 'screen' }} />
      
      {/* Add a slight overlay for better contrast */}
      <div className="absolute inset-0 bg-black/5" />
      
      <SidebarHeader className="relative z-10">
        <div className="px-2 py-4">
          <h1 className={`text-xl font-semibold ${activeColor.darkText}`}>DodoList</h1>
          <p className={`text-sm mb-4 ${activeColor.darkText} opacity-80`}>No Dodos were hurt.</p>

          {/* New List Creation */}
          {showNewListInput ? (
            <div className="flex gap-2">
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createNewList();
                  if (e.key === "Escape") setShowNewListInput(false);
                }}
                placeholder="List name"
                className="flex-1 h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/60"
                autoFocus
              />
              <Button
                size="sm"
                onClick={createNewList}
                className={`h-8 ${activeList?.color} text-white hover:opacity-90`}
                loading={isAddingList}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setShowNewListInput(true)}
              className={`w-full justify-start ${activeColor.darkText} hover:bg-white/10 border border-white/20`}
            >
              <Plus className="w-4 h-4 mr-2" />
              New List
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="relative z-10">
        {/* Pinned Lists Section */}
        {pinnedLists.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={`${activeColor.darkText} opacity-80`}>Pinned Lists</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pinnedLists.map((list) => (
                  <ListMenuItem
                    key={list.id}
                    list={list}
                    isActive={list.id === activeListId}
                    activeColor={activeColor}
                    editingListId={editingListId}
                    setEditingListId={setEditingListId}
                    updateListName={updateListName}
                    togglePinList={togglePinList}
                    toggleArchiveList={toggleArchiveList}
                    cloneList={cloneList}
                    updateListColor={updateListColor}
                    deleteList={deleteList}
                    todoLists={todoLists}
                    onListClick={handleSidebarListClick}
                    colors={colors}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Active Lists Section */}
        {unpinnedLists.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={`${activeColor.darkText} opacity-80`}>
              {pinnedLists.length > 0 ? "All Lists" : "Task Lists"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {unpinnedLists.map((list) => (
                  <ListMenuItem
                    key={list.id}
                    list={list}
                    isActive={list.id === activeListId}
                    activeColor={activeColor}
                    editingListId={editingListId}
                    setEditingListId={setEditingListId}
                    updateListName={updateListName}
                    togglePinList={togglePinList}
                    toggleArchiveList={toggleArchiveList}
                    cloneList={cloneList}
                    updateListColor={updateListColor}
                    deleteList={deleteList}
                    todoLists={todoLists}
                    onListClick={handleSidebarListClick}
                    colors={colors}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Archived Lists Section */}
        {archivedLists.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={`${activeColor.darkText} opacity-80`}>Archived</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {archivedLists.map((list) => (
                  <ListMenuItem
                    key={list.id}
                    list={list}
                    isActive={list.id === activeListId}
                    isArchived={true}
                    activeColor={activeColor}
                    editingListId={editingListId}
                    setEditingListId={setEditingListId}
                    updateListName={updateListName}
                    togglePinList={togglePinList}
                    toggleArchiveList={toggleArchiveList}
                    cloneList={cloneList}
                    updateListColor={updateListColor}
                    deleteList={deleteList}
                    todoLists={todoLists}
                    onListClick={handleSidebarListClick}
                    colors={colors}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="relative z-10 border-t border-white/20">
        <SidebarMenu>
          <SidebarMenuItem>
            <Dialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
              <DialogTrigger asChild>
                <SidebarMenuButton
                  onClick={() => {
                    // If we have a current user, use their data for the temp profile
                    if (currentUser) {
                      setTempProfile({
                        name: currentUser.username,
                        email: currentUser.email,
                        avatar: currentUser.avatar
                      })
                    } else {
                      setTempProfile(userProfile)
                    }
                  }}
                  className={`${activeColor.darkText} bg-white/10 hover:bg-white/20 focus:bg-white/20 focus:ring-2 focus:ring-white/30`}
                >
                  {currentUser && currentUser.avatar ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20 flex-shrink-0">
                      <img src={currentUser.avatar} alt={currentUser.username} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-8 h-8 rounded-full ${activeColor.value} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-medium">
                        {currentUser ? currentUser.username.charAt(0).toUpperCase() : 'U'}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex flex-col items-start ml-2">
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {currentUser ? currentUser.username : userProfile.name}
                    </span>
                  </div>
                  <Settings className="w-4 h-4 ml-auto" />
                </SidebarMenuButton>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>User Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Username</Label>
                    <Input
                      id="name"
                      value={tempProfile.name}
                      onChange={(e) => setTempProfile({ ...tempProfile, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={tempProfile.email}
                      onChange={(e) => setTempProfile({ ...tempProfile, email: e.target.value })}
                      disabled={!!currentUser} // Disable email editing if using real auth
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsEditingProfile(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={saveProfile} className="flex-1">
                      Save Changes
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout}
              className={`${activeColor.darkText} bg-white/10 hover:bg-white/20 hover:text-red-500`}
            >
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </div>
              <span className="ml-2">Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
});

AppSidebar.displayName = "AppSidebar";

export default AppSidebar;
