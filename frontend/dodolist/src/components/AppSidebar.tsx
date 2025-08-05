import { memo, useEffect, useRef, useState, useCallback } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Pin,
  Archive,
} from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useNavigate } from 'react-router-dom'
import AuthService from '@/services/authService'
import { PermissionsService } from '@/services/permissionsService';
import type { TodoListWithTodos, UserProfile } from '@/lib/types'
import DodoBirdIcon from "./DodoBirdIcon";
import type { Color } from "@/lib/colors";
import { PendingInvitesSection } from "@/components/PendingInvitesSection";
import { CollapsibleSection } from "@/components/CollapsibleSection";

interface ListMenuItemProps {
  list: TodoListWithTodos;
  isActive: boolean;
  isArchived?: boolean;
  activeColor: Color;
  onListClick: (listId: string) => void;
}

const ListMenuItem = memo(
  ({
    list,
    isActive,
    isArchived = false,
    activeColor,
    onListClick
  }: Pick<ListMenuItemProps, 'list' | 'isActive' | 'isArchived' | 'activeColor' | 'onListClick'>) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const { isMobile, setOpenMobile } = useSidebar(); // Use the hook
    const navigate = useNavigate();
    const lastNavRef = useRef<number>(0);

    // Focus input when editing starts
    useEffect(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }, []);

    // Remove all settings controls: rename, color, pin, archive, delete, dropdown, etc.
    // Only allow navigation and display list name and color indicator.

    // Memoized navigation handler with guards
    const handleListClick = useCallback(() => {
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
    }, [list.id, navigate, onListClick, isMobile, setOpenMobile]);

    return (
      <SidebarMenuItem key={list.id}>
        <SidebarMenuButton
          isActive={isActive}
          onClick={handleListClick}
          data-list-id={list.id}
          className={`flex items-center w-full transition-all duration-300 will-change-transform ${
            isActive ? "bg-white/30 text-white font-medium shadow-sm" : `${activeColor.darkText} hover:bg-white/15`
          } ${isArchived ? "opacity-70" : ""}`}
        >
          {isArchived ? (
            <Archive className={`w-4 h-4 ${isActive ? "text-white" : `${activeColor.darkText}`}`} />
          ) : list.pinned ? (
            <Pin className={`w-4 h-4 ${isActive ? "text-white" : `${activeColor.darkText}`}`} />
          ) : (
            <div className={`w-3 h-3 rounded-full ${list.color} transition-all duration-300 ${isActive ? "ring-1 ring-white" : ""}`} />
          )}
          <span className="ml-2 truncate text-sm font-medium">{list.name}</span>
          {list.todos && list.todos.filter(todo => !todo.completed).length > 0 && (
            <span
              className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full \
                ${isActive ? `${activeColor.value} text-white` : 'bg-white/20 text-white/80'}`}
            >
              {list.todos.filter(todo => !todo.completed).length}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
);

ListMenuItem.displayName = "ListMenuItem";

interface AppSidebarProps {
  allYjsLists: TodoListWithTodos[];
  activeListId: string | null;
  newListName: string;
  setNewListName: (name: string) => void;
  showNewListInput: boolean;
  setShowNewListInput: (show: boolean) => void;
  isAddingList: boolean;
  createNewList: () => void;
  colors: Color[];
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  isEditingProfile: boolean;
  setIsEditingProfile: (editing: boolean) => void;
  onLogout?: () => void;
}

const AppSidebar = memo(({
  allYjsLists,
  activeListId,
  newListName,
  setNewListName,
  showNewListInput,
  setShowNewListInput,
  isAddingList,
  createNewList,
  colors,
  userProfile,
  setUserProfile,
  isEditingProfile,
  setIsEditingProfile,
  onLogout
}: AppSidebarProps) => {
  const navigate = useNavigate()
  const [authService] = useState(() => new AuthService())
  const [tempProfile, setTempProfile] = useState<UserProfile | null>(userProfile);
  const [invitesKey, setInvitesKey] = useState(0);

  const [sharedListIds, setSharedListIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchSharedLists = async () => {
      try {
        const permissions = await PermissionsService.getActivePermissionsForCurrentUser();
        const listIds = new Set(permissions.map(p => p.task_list));
        setSharedListIds(listIds);
      } catch (error) {
        console.error("Failed to fetch shared lists:", error);
      }
    };

    fetchSharedLists();
  }, [invitesKey]); // Refreshes when an invite is accepted

  useEffect(() => {
    setTempProfile(userProfile);
  }, [userProfile]);

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      authService.logout()
      navigate('/login')
    }
  }

  const handleProfileSave = async () => {
    if (userProfile && tempProfile) {
      try {
        // Update username/name
        if (tempProfile.username !== userProfile.username || tempProfile.name !== userProfile.name) {
          await authService.updateProfile(userProfile.id, {
            username: tempProfile.username,
            name: tempProfile.name,
          });
        }
        // Request email change if email is different
        if (tempProfile.email !== userProfile.email) {
          await authService.requestEmailChange(tempProfile.email);
          // Optionally, inform the user to check their email to confirm the change.
        }
        setUserProfile(tempProfile);
        setIsEditingProfile(false);
      } catch (error) {
        console.error("Failed to update profile:", error);
        // Handle error (e.g., show a notification to the user)
      }
    }
  };

  const listsWithYjs = allYjsLists;

  const activeList = listsWithYjs.find((list) => list.id === activeListId);
  const activeColor = colors.find((color) => color.value === activeList?.color) || colors[0];
  
  const ownedLists = listsWithYjs.filter(list => !sharedListIds.has(list.id));
  const sharedLists = listsWithYjs.filter(list => sharedListIds.has(list.id));

  const activeOwnedLists = ownedLists.filter((list) => !list.archived);
  const archivedOwnedLists = ownedLists.filter((list) => list.archived);

  const pinnedOwnedLists = activeOwnedLists.filter((list) => list.pinned);
  const unpinnedOwnedLists = activeOwnedLists.filter((list) => !list.pinned);

  // Memoized sidebar navigation handler with guards
  const handleSidebarListClick = useCallback((listId: string) => {
    // Prevent rapid navigation and unnecessary state updates
    if (activeListId === listId) return;
    navigate(`/list/${listId}`); // Only update the URL, do not call setActiveListId
  }, [activeListId, navigate]);

  // Add custom scrollbar styles for SidebarContent
  const customScrollbarStyle = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.12);
      border-radius: 6px;
      transition: background 0.2s;
    }
    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.22);
    }
    .custom-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: rgba(0,0,0,0.12) transparent;
    }
  `;

  if (typeof window !== 'undefined' && !document.getElementById('custom-scrollbar-style')) {
    const style = document.createElement('style');
    style.id = 'custom-scrollbar-style';
    style.innerHTML = customScrollbarStyle;
    document.head.appendChild(style);
  }

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      await PermissionsService.acceptInvite(inviteId);
      setInvitesKey(k => k + 1); // force PendingInvitesSection to reload
    } catch (e) {
      // Optionally show notification
      // console.error(e);
    }
  };
  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await PermissionsService.rejectInvite(inviteId);
      setInvitesKey(k => k + 1);
    } catch (e) {
      // Optionally show notification
      // console.error(e);
    }
  };

  return (
    <Sidebar className="border-r-0 overflow-hidden min-h-screen flex flex-col relative bg-white/90">
      {/* Sidebar background and subtle texture */}
      <div className={`absolute inset-0 ${activeColor.dark} z-0`} />
      <div className="absolute inset-0 noise-texture-subtle z-0" style={{ opacity: 0.10, mixBlendMode: 'screen' }} />
      <div className="absolute inset-0 bg-black/5 z-0" />

      {/* Header */}
      <SidebarHeader className="relative z-10 px-4 pt-6 pb-4 border-b border-white/15" style={{ background: 'rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2 mb-4">
          <DodoBirdIcon className="w-8 h-8" color={activeColor.hex} />
          <div>
            <h1 className={`text-xl font-bold tracking-tight ${activeColor.darkText}`}>DodoList</h1>
            <p className={`text-xs mt-0.5 ${activeColor.darkText} opacity-70`}>No Dodos were hurt.</p>
          </div>
        </div>
        {/* New List Creation */}
        {showNewListInput ? (
          <div className="flex gap-2 mt-2">
            <Input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createNewList(); if (e.key === 'Escape') setShowNewListInput(false); }}
              placeholder="List name"
              className="flex-1 h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/60 rounded"
              autoFocus
            />
            <Button size="sm" onClick={createNewList} className={`h-8 ${activeList?.color} text-white hover:opacity-90`} loading={isAddingList}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setShowNewListInput(true)}
            className={`w-full justify-start mt-2 ${activeColor.darkText} hover:bg-white/10 border border-white/20 rounded`}
          >
            <Plus className="w-4 h-4 mr-2" />
            New List
          </Button>
        )}
      </SidebarHeader>

      {/* Lists */}
      <SidebarContent className="custom-scrollbar relative z-10 flex-1 overflow-y-auto px-2 py-4">
        {pinnedOwnedLists.length > 0 && (
          <CollapsibleSection title="Pinned" activeColor={activeColor}>
            <SidebarMenu>
              {pinnedOwnedLists.map(list => (
                <ListMenuItem
                  key={list.id}
                  list={list}
                  isActive={activeListId === list.id}
                  isArchived={false}
                  activeColor={activeColor}
                  onListClick={handleSidebarListClick}
                />
              ))}
            </SidebarMenu>
          </CollapsibleSection>
        )}
        <CollapsibleSection title="Task Lists" activeColor={activeColor}>
          <SidebarMenu>
            {unpinnedOwnedLists.map(list => (
              <ListMenuItem
                key={list.id}
                list={list}
                isActive={activeListId === list.id}
                isArchived={false}
                activeColor={activeColor}
                onListClick={handleSidebarListClick}
              />
            ))}
          </SidebarMenu>
        </CollapsibleSection>

        {sharedLists.length > 0 && (
          <CollapsibleSection title="Shared Lists" activeColor={activeColor}>
            <SidebarMenu>
              {sharedLists.map(list => (
                <ListMenuItem
                  key={list.id}
                  list={list}
                  isActive={activeListId === list.id}
                  isArchived={list.archived}
                  activeColor={activeColor}
                  onListClick={handleSidebarListClick}
                />
              ))}
            </SidebarMenu>
          </CollapsibleSection>
        )}

        {archivedOwnedLists.length > 0 && (
          <CollapsibleSection title="Archived" activeColor={activeColor}>
            <SidebarMenu>
              {archivedOwnedLists.map(list => (
                <ListMenuItem
                  key={list.id}
                  list={list}
                  isActive={activeListId === list.id}
                  isArchived={true}
                  activeColor={activeColor}
                  onListClick={handleSidebarListClick}
                />
              ))}
            </SidebarMenu>
          </CollapsibleSection>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="relative z-10 px-4 py-4 border-t border-white/15" style={{ background: 'rgba(0,0,0,0.05)' }}>
        {/* Pending Invites Section */}
        <PendingInvitesSection
          key={invitesKey}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
        <SidebarMenu>
          <SidebarMenuItem>
            <Dialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
              <DialogTrigger asChild>
                <SidebarMenuButton className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    {/* Avatar or initials */}
                    <span className="text-sm font-semibold text-white">{userProfile?.name?.[0] || "U"}</span>
                  </div>
                  <span className={`text-sm ${activeColor.darkText}`}>{userProfile?.name || "User"}</span>
                </SidebarMenuButton>
              </DialogTrigger>
              <DialogContent className="bg-white rounded-lg shadow-xl">
                <DialogHeader>
                  <DialogTitle>Edit Profile</DialogTitle>
                  <DialogDescription>
                    Manage your account settings.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Name
                    </Label>
                    <Input
                      id="name"
                      value={tempProfile?.name || ''}
                      onChange={(e) => setTempProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="username" className="text-right">
                      Username
                    </Label>
                    <Input
                      id="username"
                      value={tempProfile?.username || ''}
                      onChange={(e) => setTempProfile(prev => prev ? { ...prev, username: e.target.value } : null)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={tempProfile?.email || ''}
                      onChange={(e) => setTempProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
                      className="col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setIsEditingProfile(false)} variant="outline">Cancel</Button>
                  <Button onClick={handleProfileSave}>
                    Save changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className={`flex items-center gap-2 px-2 py-1 rounded ${activeColor.darkText} hover:bg-white/10`}>
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                {/* Logout icon */}
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" /></svg>
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
