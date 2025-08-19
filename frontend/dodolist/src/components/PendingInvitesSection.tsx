import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListPreviewCard } from "@/components/ListPreviewCard";
import { type PendingInvite } from "@/lib/utils";
import { useInvites } from "@/state/InvitesContext";

interface PendingInvitesSectionProps {
  onAccept?: (inviteId: string) => void;
  onDecline?: (inviteId: string) => void;
}

export const PendingInvitesSection: React.FC<PendingInvitesSectionProps> = ({ onAccept, onDecline }) => {
  const { invites, refresh, accept, decline, loading } = useInvites();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewInvite, setPreviewInvite] = useState<PendingInvite | null>(null);

  useEffect(() => {
    // Ensure we have the latest on mount (background refresh).
    refresh();
  }, []);

  return (
    <>
      <Button
        variant="outline"
        className="w-full mb-2"
        onClick={() => setDialogOpen(true)}
        disabled={invites.length === 0 && !loading}
      >
        {loading
          ? "Checking invites..."
          : invites.length === 0
            ? "No pending invites"
            : `View ${invites.length} Pending Invite${invites.length > 1 ? "s" : ""}`}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pending Invites</DialogTitle>
          </DialogHeader>
          {invites.length === 0 ? (
            <div className="text-xs text-slate-400 px-2 py-2">No pending invites</div>
          ) : previewInvite ? (
            <>
              <ListPreviewCard
                name={previewInvite.list.name}
                color={previewInvite.color}
                todos={previewInvite.list.todos}
              />
              <div className="text-xs text-slate-500 mt-2 mb-4">
                Invited by: {previewInvite.invitedBy}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewInvite(null)}>Back</Button>
                <Button
                  variant="default"
                  onClick={async () => {
                    if (onAccept) onAccept(previewInvite.id);
                    await accept(previewInvite.id);
                    setDialogOpen(false);
                    setPreviewInvite(null);
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (onDecline) onDecline(previewInvite.id);
                    await decline(previewInvite.id);
                    setDialogOpen(false);
                    setPreviewInvite(null);
                  }}
                >
                  Decline
                </Button>
              </DialogFooter>
            </>
          ) : (
            <ul className="space-y-2">
              {invites.map(invite => (
                <li
                  key={invite.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-slate-100/80"
                  style={{ borderRadius: 8 }}
                >
                  <div className={`w-3 h-3 rounded-full ${invite.color.value} mr-2`} />
                  <span className="flex-1 truncate text-sm font-medium">{invite.list.name}</span>
                  <span className="text-xs text-slate-500 ml-2">by {invite.invitedBy}</span>
                  <Button size="sm" variant="outline" onClick={() => setPreviewInvite(invite)}>
                    Preview
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
