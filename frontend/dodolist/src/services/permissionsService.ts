import pb from './pbClient';
import type { PocketBasePermissionsRecord } from '../lib/types';

/**
 * Utility class for accessing and mutating the 'permissions' collection.
 */
export class PermissionsService {
  static collection = 'permissions';

  /**
   * Get all permissions for a given list.
   */
  static async getPermissionsForList(listId: string): Promise<PocketBasePermissionsRecord[]> {
    const result = await pb.collection(PermissionsService.collection).getFullList({
      filter: `task_list = '${listId}' && status = 'active'`,
      expand: 'user_id,invited_by'
    });
    console.log('[PermissionsService.getPermissionsForList] Raw result:', result);

    // getFullList returns a direct array of records
    if (!Array.isArray(result)) {
      console.error('[PermissionsService.getPermissionsForList] Expected array, got:', typeof result);
      return [];
    }

    // Convert to PocketBasePermissionsRecord[] by mapping fields
    return result.map((r: any) => ({
      id: r.id,
      task_list: r.task_list,
      user_id: r.user_id,
      invited_by: r.invited_by,
      status: r.status,
      permission: r.permission,
      inviter_email: r.inviter_email,
      expand: r.expand
    }));
  }

  /**
   * Get all permission records for a given list (any status), with expanded user fields.
   */
  static async getAllPermissionsForList(listId: string): Promise<PocketBasePermissionsRecord[]> {
    const result = await pb.collection(PermissionsService.collection).getFullList({
      filter: `task_list = '${listId}'`,
      expand: 'user_id,invited_by'
    });

    if (!Array.isArray(result)) {
      console.error('[PermissionsService.getAllPermissionsForList] Expected array, got:', typeof result);
      return [];
    }

    return result.map((r: any) => ({
      id: r.id,
      task_list: r.task_list,
      user_id: r.user_id,
      invited_by: r.invited_by,
      status: r.status,
      permission: r.permission,
      inviter_email: r.inviter_email,
      expand: r.expand
    }));
  }

  /**
   * Get all permissions (invites) for the current user using PocketBase web API.
   */
  static async getPermissionsForCurrentUser(): Promise<PocketBasePermissionsRecord[]> {
    // Uses pb.authStore.model.id for current user
    const userId = pb.authStore.model?.id;
    if (!userId) throw new Error('No authenticated user');
    
    console.log('[PermissionsService.getPermissionsForCurrentUser] Fetching invites for user:', userId);
    
    // Get all invites (status = 'invited') for the current user
    // Removed expand since we're using inviter_email field directly
    const filter = `user_id = '${userId}' && status = 'invited'`;
    console.log('[PermissionsService.getPermissionsForCurrentUser] Using filter:', filter);
    
    const result = await pb.collection(PermissionsService.collection).getFullList({
      filter: filter
    });
    console.log('[PermissionsService.getPermissionsForCurrentUser] Raw result:', result);
    console.log('[PermissionsService.getPermissionsForCurrentUser] Raw result length:', result.length);

    // getFullList returns a direct array of records
    if (!Array.isArray(result)) {
      console.error('[PermissionsService.getPermissionsForCurrentUser] Expected array, got:', typeof result);
      return [];
    }

    // Convert to PocketBasePermissionsRecord[] by mapping fields
    const mappedResult = result.map((r: any) => {
      console.log('[PermissionsService.getPermissionsForCurrentUser] Processing record:', {
        id: r.id,
        invited_by: r.invited_by,
        inviter_email: r.inviter_email,
        status: r.status,
        user_id: r.user_id
      });
      
      return {
        id: r.id,
        task_list: r.task_list,
        user_id: r.user_id,
        invited_by: r.invited_by,
        status: r.status,
        permission: r.permission,
        inviter_email: r.inviter_email
      };
    });
    
    console.log('[PermissionsService.getPermissionsForCurrentUser] Final mapped result:', mappedResult);
    console.log('[PermissionsService.getPermissionsForCurrentUser] Final mapped result length:', mappedResult.length);
    
    return mappedResult;
  }

  /**
   * Get all active permissions for the current user (i.e., lists shared with them).
   */
  static async getActivePermissionsForCurrentUser(): Promise<PocketBasePermissionsRecord[]> {
    const userId = pb.authStore.model?.id;
    if (!userId) return [];

    const result = await pb.collection(PermissionsService.collection).getFullList({
      filter: `user_id = '${userId}' && status = 'active'`,
    });

    // getFullList returns a direct array of records
    if (!Array.isArray(result)) {
      console.error('[PermissionsService.getActivePermissionsForCurrentUser] Expected array, got:', typeof result);
      return [];
    }
    
    return result.map((r: any) => ({
      id: r.id,
      task_list: r.task_list,
      user_id: r.user_id,
      invited_by: r.invited_by,
      status: r.status,
      permission: r.permission,
      inviter_email: r.inviter_email
    }));
  }

  /**
   * Get all active permission records visible to the current user.
   * This includes:
   * - Collaborations where the current user is the invited user (shared with me)
   * - All collaborators on lists the current user owns (shared by me)
   * Relies on PocketBase collection rules to scope visibility.
   */
  static async getAllActiveVisiblePermissions(): Promise<PocketBasePermissionsRecord[]> {
    const result = await pb.collection(PermissionsService.collection).getFullList({
      filter: `status = 'active'`,
    });

    if (!Array.isArray(result)) {
      console.error('[PermissionsService.getAllActiveVisiblePermissions] Expected array, got:', typeof result);
      return [];
    }

    return result.map((r: any) => ({
      id: r.id,
      task_list: r.task_list,
      user_id: r.user_id,
      invited_by: r.invited_by,
      status: r.status,
      permission: r.permission,
      inviter_email: r.inviter_email,
    }));
  }

  /**
   * Invite a user to a list (creates a permission record with status 'invited').
   */
  static async inviteUserToList({
    listId,
    userId,
    invitedBy,
    inviterEmail,
    permission
  }: { listId: string; userId: string; invitedBy: string; inviterEmail: string; permission: 'edit' | 'view' }) {
    const record = await pb.collection(PermissionsService.collection).create({
      task_list: listId,
      user_id: userId,
      invited_by: invitedBy,
      inviter_email: inviterEmail,
      status: 'invited',
      permission
    });
    return record;
  }

  /**
   * Accept an invite (sets status to 'active').
   */
  static async acceptInvite(permissionId: string) {
    return await pb.collection(PermissionsService.collection).update(permissionId, { status: 'active' });
  }

  /**
   * Reject an invite (sets status to 'rejected').
   */
  static async rejectInvite(permissionId: string) {
    return await pb.collection(PermissionsService.collection).update(permissionId, { status: 'rejected' });
  }

  /**
   * Remove a collaborator (delete the permission record).
   */
  static async removeCollaborator(permissionId: string) {
    return await pb.collection(PermissionsService.collection).delete(permissionId);
  }

  /**
   * Change a collaborator's permission (edit/view).
   */
  static async changePermission(permissionId: string, permission: 'edit' | 'view') {
    return await pb.collection(PermissionsService.collection).update(permissionId, { permission });
  }

  /**
   * Lookup a user by email using the custom backend endpoint.
   */
  static async getUserIdByEmail(email: string): Promise<string | null> {
    try {
      const res = await fetch('/api/lookup-user-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return null;
      const user = await res.json();
      return user?.id || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Lookup a user by id via secure backend endpoint (returns basic public info).
   */
  static async getUserById(userId: string, listId?: string): Promise<{ id: string; email?: string; username?: string; name?: string } | null> {
    try {
      // Use PocketBase client so auth token is attached automatically
      const user = await pb.send('/api/lookup-user-by-id', {
        method: 'POST',
        body: { id: userId, listId },
      });
      return (user as any) || null;
    } catch {
      return null;
    }
  }
}
