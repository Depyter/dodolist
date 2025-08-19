import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchInvites, type PendingInvite } from "@/lib/utils";
import { PermissionsService } from "@/services/permissionsService";
import { GlobalPocketBaseProvider } from "@/services/yjsPocketBase";
import pb from "@/services/pbClient";

type InvitesContextValue = {
  invites: PendingInvite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  accept: (inviteId: string) => Promise<void>;
  decline: (inviteId: string) => Promise<void>;
};

const InvitesContext = createContext<InvitesContextValue | undefined>(undefined);

const CACHE_KEY = "dodolist-pending-invites-cache";

function cacheKeyForUser() {
  const uid = pb.authStore.model?.id || "anon";
  return `${CACHE_KEY}:${uid}`;
}

function loadCache(): PendingInvite[] {
  try {
  const raw = localStorage.getItem(cacheKeyForUser());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as PendingInvite[];
    return [];
  } catch {
    return [];
  }
}

function saveCache(invites: PendingInvite[]) {
  try {
  localStorage.setItem(cacheKeyForUser(), JSON.stringify(invites));
  } catch {}
}

export function InvitesProvider({ children }: { children: React.ReactNode }) {
  const [invites, setInvites] = useState<PendingInvite[]>(() => loadCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<ReturnType<typeof GlobalPocketBaseProvider.getInstance> | null>(null);
  const connectedRef = useRef<boolean>(navigator.onLine);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchInvites();
      // If offline and result is empty, keep existing cache/state.
      if (!connectedRef.current && result.length === 0) {
        // Do nothing; preserve cache
      } else {
        setInvites(result);
        saveCache(result);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }, []);

  const accept = useCallback(async (inviteId: string) => {
    await PermissionsService.acceptInvite(inviteId);
    // Optimistically update local state and cache
    setInvites(prev => {
      const next = prev.filter(i => i.id !== inviteId);
      saveCache(next);
      return next;
    });
    // Best-effort refresh in background (no await)
    refresh().catch(() => {});
  }, [refresh]);

  const decline = useCallback(async (inviteId: string) => {
    await PermissionsService.rejectInvite(inviteId);
    setInvites(prev => {
      const next = prev.filter(i => i.id !== inviteId);
      saveCache(next);
      return next;
    });
    refresh().catch(() => {});
  }, [refresh]);

  // Initial fetch: load cache immediately, then try network if possible.
  useEffect(() => {
    providerRef.current = GlobalPocketBaseProvider.getInstance();
    const unsubscribeConnectivity = providerRef.current.onConnectivityChange((isConnected) => {
  connectedRef.current = isConnected;
      // When we come online, attempt a refresh in background.
      if (isConnected) {
        refresh().catch(() => {});
      }
    });

    // Kick off an eager refresh as soon as the page mounts
    refresh().catch(() => {});

    return () => {
      unsubscribeConnectivity?.();
    };
  }, [refresh]);

  const value = useMemo<InvitesContextValue>(() => ({ invites, loading, error, refresh, accept, decline }), [invites, loading, error, refresh, accept, decline]);

  return <InvitesContext.Provider value={value}>{children}</InvitesContext.Provider>;
}

export function useInvites(): InvitesContextValue {
  const ctx = useContext(InvitesContext);
  if (!ctx) throw new Error("useInvites must be used within InvitesProvider");
  return ctx;
}
