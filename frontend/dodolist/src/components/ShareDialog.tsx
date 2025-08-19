import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Globe, UserPlus, Users, ChevronDown, QrCode } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useShareOptions } from "@/hooks/useShareAndExport";
import { useNotification } from "@/hooks/useNotification";
import { Notification } from "@/components/ui/Notification";
import QRCodeStyling from "qr-code-styling";
import { colors, type Color } from "@/lib/colors";
import { exportListToLink } from '@/lib/utils';
import pb from '@/services/pbClient';
import { PermissionsService } from '@/services/permissionsService';
import type { PocketBasePermissionsRecord } from '@/lib/types';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  readOnly?: boolean;
}

function LinkShareRow({
  label,
  value,
  onCopy,
  copied,
  onShowQr,
  showQr,
  onQrDownload,
  qrRef,
  placeholder
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  onShowQr: () => void;
  showQr: boolean;
  onQrDownload: () => void;
  qrRef: (node: HTMLDivElement | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="mb-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input value={value} readOnly className="flex-1" placeholder={placeholder} />
        <Button variant="outline" size="icon" onClick={onCopy} aria-label="Copy link" disabled={!value}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Show QR code" onClick={onShowQr} disabled={!value}>
          <QrCode className="w-4 h-4" />
        </Button>
      </div>
      {copied && <div className="text-xs text-green-600 mt-2">Link copied!</div>}
      {/* QR Code Dialog */}
      {showQr && (
        <Dialog open={showQr} onOpenChange={onShowQr}>
          <DialogContent className="w-auto max-w-fit flex flex-col items-center p-5" style={{ minWidth: 0, gap: 0 }}>
            <div ref={qrRef} className="flex justify-center pb-0" />
            <Button onClick={onQrDownload}>Download</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function ShareDialog({ open, onOpenChange, shareUrl, readOnly, listId, activeColor, listData }: ShareDialogProps & { listId: string | null, activeColor?: Color, listData?: { name: string, color: string, todos: any[] } }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [showExportQr, setShowExportQr] = useState(false);
  const [showExport, setShowExport] = useState(false); // Toggle between share/export
  const qrCode = useRef<any>(null);
  const exportQrCode = useRef<any>(null);
  const { notifications, addNotification, removeNotification } = useNotification();
  const {
    inviteEmail,
    setInviteEmail,
    invitePermission,
    setInvitePermission,
    addPerson,
  } = useShareOptions(listId, addNotification);

  // --- List-specific permissions & owner ---
  const [ownerInfo, setOwnerInfo] = useState<{ id: string; email: string; name?: string; username?: string } | null>(null);
  const [allPerms, setAllPerms] = useState<PocketBasePermissionsRecord[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [permsError, setPermsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchListPermissions() {
      if (!open || !listId) return;
      setLoadingPerms(true);
      setPermsError(null);
      try {
        // Fetch the list record to get the owner
        const listRecord = await pb.collection('task_lists').getOne(listId);
        const ownerId = listRecord.user_id;
        let owner = null;
        try {
          owner = await pb.collection('users').getOne(ownerId);
        } catch {}
        // Fetch all permissions for this list
  const perms = await PermissionsService.getAllPermissionsForList(listId);
        if (cancelled) return;
        setOwnerInfo(owner ? { id: owner.id, email: owner.email, name: owner.name, username: owner.username } : { id: ownerId, email: '(unknown)' });
  // Store all permissions (invited + active) for thin UI display
  setAllPerms(perms);
      } catch (e: any) {
        if (!cancelled) setPermsError(e?.message || 'Failed to load permissions');
      } finally {
        if (!cancelled) setLoadingPerms(false);
      }
    }
    fetchListPermissions();
    return () => { cancelled = true; };
  }, [open, listId]);

  // Use activeColor from props, fallback to colors[1] if not provided
  const resolvedActiveColor = activeColor || colors[1];

  function getQrOptions(data: string, color: Color) {
    return {
      type: "canvas" as const,
      width: 280,
      height: 280,
      margin: 0,
      data,
      qrOptions: {
        typeNumber: 0 as const,
        mode: "Byte" as const,
        errorCorrectionLevel: "Q" as const
      },
      imageOptions: {
        saveAsBlob: true,
        hideBackgroundDots: true,
        imageSize: 0.5,
        crossOrigin: undefined,
        margin: 8,
      },
      dotsOptions: {
        type: "rounded" as const,
        color: (color && color.hex) ? color.hex : '#3b82f6',
        roundSize: true
      },
      cornersSquareOptions: {
        type: "extra-rounded" as const,
        color: (color && color.hex) ? color.hex : '#3b82f6'
      },
      cornersDotOptions: {
        type: "dot" as const,
        color: (color && color.hex) ? color.hex : '#3b82f6'
      },
      backgroundOptions: {
        round: 0,
        color: "#ffffff"
      },
      image: "/dodobird.svg"
    };
  }

  // Share link QR
  const handleQrRef = useCallback((node: HTMLDivElement | null) => {
    if (node && showQr) {
      node.innerHTML = "";
      const qr = new QRCodeStyling(getQrOptions(shareUrl, resolvedActiveColor));
      qr.append(node);
      qrCode.current = qr;
    }
  }, [showQr, shareUrl, resolvedActiveColor]);

  const handleQrDownload = () => {
    if (qrCode.current) {
      qrCode.current.download({ extension: "png" });
    }
  };

  // Export link logic
  let exportLink = '';
  if (listData && listData.name && listData.color && Array.isArray(listData.todos)) {
    exportLink = exportListToLink(listData);
  }

  // Export link QR
  const handleExportQrRef = useCallback((node: HTMLDivElement | null) => {
    if (node && showExportQr) {
      node.innerHTML = "";
      const qr = new QRCodeStyling(getQrOptions(exportLink, resolvedActiveColor));
      qr.append(node);
      exportQrCode.current = qr;
    }
  }, [showExportQr, exportLink, resolvedActiveColor]);

  const handleExportQrDownload = () => {
    if (exportQrCode.current) {
      exportQrCode.current.download({ extension: "png" });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleCopyExportLink = async () => {
    if (!exportLink) return;
    try {
      await navigator.clipboard.writeText(exportLink);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 1500);
    } catch {
      setExportCopied(false);
    }
  };

  // Unified rows for display (reuse the invite list UI for existing records too)
  type DisplayRow = {
    key: string;
    email: string;
    permission: 'edit' | 'view';
    status: 'invited' | 'active' | 'local';
    recordId?: string;
    isMe?: boolean;
  };
  const meId = pb.authStore.model?.id as string | undefined;
  const meEmail = pb.authStore.model?.email as string | undefined;
  const [emailCache, setEmailCache] = useState<Record<string, string>>({});
  const backendRows: DisplayRow[] = (allPerms || [])
    .filter(p => p.status === 'invited' || p.status === 'active')
    .map(p => ({
      key: p.id || `${p.user_id}-${p.status}`,
      email: (p.expand?.user_id?.email as string) || emailCache[p.user_id] || '(unknown user)',
      permission: p.permission === 'edit' ? 'edit' : 'view',
      status: p.status === 'active' ? 'active' : 'invited',
      recordId: p.id,
      isMe: !!(meId && p.user_id === meId),
    }));
  // Only show backend-scoped permissions for the current list to avoid cross-list bleedthrough
  const displayRows: DisplayRow[] = backendRows;

  // Resolve missing emails via backend lookup by id
  useEffect(() => {
    const missing = (allPerms || [])
      .filter(p => (p.status === 'invited' || p.status === 'active') && !p.expand?.user_id?.email && !emailCache[p.user_id])
      .map(p => p.user_id);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(missing.map(async (id) => {
        const info = await PermissionsService.getUserById(id, listId || undefined);
        if (info?.email) updates[id] = info.email;
      }));
      if (!cancelled && Object.keys(updates).length > 0) {
        setEmailCache(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [allPerms, emailCache]);

  const handleRowPermissionChange = useCallback(async (row: DisplayRow, newPerm: 'edit' | 'view') => {
    try {
      if (row.recordId) {
        await PermissionsService.changePermission(row.recordId, newPerm);
        setAllPerms(prev => prev.map(p => (p.id === row.recordId ? { ...p, permission: newPerm } as any : p)));
      }
    } catch (e: any) {
      if (addNotification) addNotification({ message: `Failed to change permission: ${e?.message || e}`, type: 'error', duration: 2500 });
    }
  }, [setAllPerms, addNotification]);

  const handleRowRemove = useCallback(async (row: DisplayRow) => {
    try {
      if (row.recordId) {
        await PermissionsService.removeCollaborator(row.recordId);
        setAllPerms(prev => prev.filter(p => p.id !== row.recordId));
      }
    } catch (e: any) {
      if (addNotification) addNotification({ message: `Failed to remove: ${e?.message || e}`, type: 'error', duration: 2500 });
    }
  }, [setAllPerms, addNotification]);

  // Helper to refresh permissions for the current list
  const refreshPermissions = useCallback(async () => {
    if (!listId) return;
    try {
      const perms = await PermissionsService.getAllPermissionsForList(listId);
      setAllPerms(perms);
    } catch (e) {
      // ignore; errors already surfaced elsewhere
    }
  }, [listId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        {/* Render notifications directly above dialog content when open */}
        {open && (
          <div className="absolute bottom-full left-0 right-0 flex flex-col items-center pointer-events-none">
              <div className="pointer-events-auto">
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
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Share this list</DialogTitle>
          <div className="flex gap-2 mt-2">
            <Button
              variant={!showExport ? "default" : "outline"}
              size="sm"
              onClick={() => setShowExport(false)}
              className="flex-1"
            >
              Share
            </Button>
            <Button
              variant={showExport ? "default" : "outline"}
              size="sm"
              onClick={() => setShowExport(true)}
              className="flex-1"
            >
              Export
            </Button>
          </div>
        </DialogHeader>
        {showExport ? (
          <>
            <LinkShareRow
              label="Export as importable link"
              value={exportLink}
              onCopy={handleCopyExportLink}
              copied={exportCopied}
              onShowQr={() => setShowExportQr(v => !v)}
              showQr={showExportQr}
              onQrDownload={handleExportQrDownload}
              qrRef={handleExportQrRef}
              placeholder="Export link will appear here"
            />
            <div className="text-xs text-slate-500 mt-2 mb-4">Anyone with the export link or QR can import a copy of this list into their own account.</div>
          </>
        ) : (
          <>
            <DialogDescription>
              {readOnly
                ? "This list is already shared as read-only."
                : "Invite others to view or collaborate on this list."}
            </DialogDescription>
            
            <LinkShareRow
              label="Share link"
              value={shareUrl}
              onCopy={handleCopy}
              copied={copied}
              onShowQr={() => setShowQr(v => !v)}
              showQr={showQr}
              onQrDownload={handleQrDownload}
              qrRef={handleQrRef}
            />
            <div className="mt-0">
              <div className="flex items-center gap-2 mt-4 mb-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">People with access</span>
              </div>
              
              {/* Compact owner line */}
              <div className="mb-2 text-xs text-slate-600">
                Owner: {ownerInfo?.email || 'Unknown'}{ownerInfo?.email && meEmail && ownerInfo.email === meEmail ? ' (you)' : ''}
              </div>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Invite by email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="flex-1"
                  type="email"
                  autoComplete="off"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-32 min-w-[110px] justify-between">
                      {invitePermission === 'edit' ? 'Can edit' : 'View only'}
                      <ChevronDown className="ml-2 w-4 h-4 text-slate-500" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setInvitePermission('edit')}>Can edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setInvitePermission('view')}>View only</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="default"
                  onClick={async () => { await addPerson(inviteEmail, invitePermission); await refreshPermissions(); }}
                  disabled={!inviteEmail.trim()}
                >
                  <UserPlus className="w-4 h-4 mr-1" /> Invite
                </Button>
              </div>
              <ul className="mb-2">
                {loadingPerms ? (
                  <li className="text-xs text-slate-500">Loading permissions…</li>
                ) : permsError ? (
                  <li className="text-xs text-red-500">{permsError}</li>
                ) : displayRows.length > 0 ? (
                  displayRows.map(row => (
                    <li key={row.key} className="flex items-center gap-2 text-sm py-1 bg-slate-50 rounded-md px-2 mb-1" style={{ minHeight: 40 }}>
                      <span className="flex-1 truncate">{row.email}{row.isMe ? ' (you)' : ''}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-32 min-w-[110px] justify-between px-2 py-1 text-xs">
                            {row.permission === 'edit' ? 'Can edit' : 'View only'}
                            <ChevronDown className="ml-2 w-4 h-4 text-slate-500" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRowPermissionChange(row, 'edit')}>Can edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRowPermissionChange(row, 'view')}>View only</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRowRemove(row)}
                        className="text-red-500"
                      >
                        Remove
                      </Button>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-slate-400">No people invited yet.</li>
                )}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
