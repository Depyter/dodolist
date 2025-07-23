import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Globe, UserPlus, Users, ChevronDown, QrCode } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useShareOptions } from "@/hooks/useShareAndExport";
import QRCodeStyling from "qr-code-styling";
import { colors, type Color } from "@/lib/colors";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  readOnly?: boolean;
}

export function ShareDialog({ open, onOpenChange, shareUrl, readOnly, listId }: ShareDialogProps & { listId: string | null, activeColor?: Color }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrCode = useRef<any>(null);
  const {
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
  } = useShareOptions(listId);

  // Get the active color from the list color (if available)
  let activeColor: Color = colors[1];
  if (typeof window !== 'undefined') {
    // Try to extract the color from the URL/listId if possible
    // (This fallback is for when ShareDialog is used outside TodoListPage)
    const urlParams = new URLSearchParams(window.location.search);
    const colorParam = urlParams.get('color');
    if (colorParam) {
      const found = colors.find(c => c.value === colorParam);
      if (found) activeColor = found;
    }
  }
  // If passed as prop (from TodoListPage), use that
  if (arguments.length > 0 && typeof arguments[0] === 'object' && arguments[0].activeColor) {
    activeColor = arguments[0].activeColor;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleQrRef = useCallback((node: HTMLDivElement | null) => {
    if (node && showQr) {
      node.innerHTML = "";
      const styledOptions = {
        type: "canvas" as const,
        width: 280,
        height: 280,
        margin: 0,
        data: "https://tinyurl.com/5apxy622",
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
          color: activeColor.hex,
          roundSize: true
        },
        cornersSquareOptions: {
          type: "extra-rounded" as const,
          color: activeColor.hex
        },
        cornersDotOptions: {
          type: "dot" as const,
          color: activeColor.hex
        },
        backgroundOptions: {
          round: 0,
          color: "#ffffff"
        },
        image: "/dodobird.svg"
      };
      const qr = new QRCodeStyling(styledOptions);
      qr.append(node);
      qrCode.current = qr;
    }
  }, [showQr, shareUrl, activeColor]);

  const handleQrDownload = () => {
    if (qrCode.current) {
      qrCode.current.download({ extension: "png" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this list</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "This list is already shared as read-only."
              : "Invite others to view or collaborate on this list."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mt-4">
          <Input value={shareUrl} readOnly className="flex-1" />
          <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy link">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Show QR code" onClick={() => setShowQr(true)}>
            <QrCode className="w-4 h-4" />
          </Button>
        </div>
        {copied && <div className="text-xs text-green-600 mt-2">Link copied!</div>}
        {/* QR Code Dialog */}
        {showQr && (
          <Dialog open={showQr} onOpenChange={setShowQr}>
            <DialogContent className="w-auto max-w-fit flex flex-col items-center p-5" style={{ minWidth: 0, gap: 0}}>
              <div ref={handleQrRef} className="flex justify-center pb-0" />
              <Button onClick={handleQrDownload}>Download</Button>
            </DialogContent>
          </Dialog>
        )}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Public sharing</span>
            <Button
              size="sm"
              variant={isPublic ? "default" : "outline"}
              className="ml-auto transition-none"
              onClick={togglePublic}
            >
              {isPublic ? "Public " : "Private"}
            </Button>
          </div>
          <div className="text-xs text-slate-500 mb-2">
            {isPublic
              ? "Anyone with the link can view this list."
              : "Only invited people can access this list."}
          </div>
          <div className="flex items-center gap-2 mt-4 mb-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">People with access</span>
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
              onClick={() => addPerson(inviteEmail, invitePermission)}
              disabled={!inviteEmail.trim()}
            >
              <UserPlus className="w-4 h-4 mr-1" /> Invite
            </Button>
          </div>
          <ul className="mb-2">
            {people.map(person => (
              <li key={person.email} className="flex items-center gap-2 text-sm py-1 bg-slate-50 rounded-md px-2 mb-1" style={{ minHeight: 40 }}>
                <span className="flex-1 truncate">{person.email}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-32 min-w-[110px] justify-between px-2 py-1 text-xs">
                      {person.permission === 'edit' ? 'Can edit' : 'View only'}
                      <ChevronDown className="ml-2 w-4 h-4 text-slate-500" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => changePermission(person.email, 'edit')}>Can edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changePermission(person.email, 'view')}>View only</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removePerson(person.email)}
                  className="text-red-500"
                >
                  Remove
                </Button>
              </li>
            ))}
            {people.length === 0 && (
              <li className="text-xs text-slate-400">No people invited yet.</li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
