"use client";

import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { NotificationType } from "@/api/types/notification";

interface NotificationFilters {
  type?: NotificationType;
  read?: boolean;
  page?: number;
  limit?: number;
}

/** Paginated notifications, optionally filtered by type and read status. */
export function useNotifications(filters?: NotificationFilters) {
  return useApiQuery(queryKeys.notifications.list(filters), () =>
    client.api.notifications.get({
      query: {
        page: filters?.page ?? 1,
        limit: filters?.limit ?? 20,
        ...(filters?.type && { type: filters.type as NotificationType }),
        ...(filters?.read !== undefined && { read: filters.read }),
      },
    }),
  );
}

/** Unread notification count, polled every 45s. */
export function useUnreadCount() {
  return useApiQuery(
    queryKeys.notifications.unreadCount(),
    () => client.api.notifications["unread-count"].get(),
    { refetchInterval: 45_000, staleTime: 30_000 },
  );
}

/** Marks a notification as read. */
export function useMarkRead() {
  return useApiMutation(
    (notificationId: string) => client.api.notifications({ notificationId }).read.patch(),
    { invalidateKeys: [queryKeys.notifications.all] },
  );
}

/** Marks all notifications as read. */
export function useMarkAllRead() {
  return useApiMutation(() => client.api.notifications["read-all"].patch(), {
    invalidateKeys: [queryKeys.notifications.all],
  });
}

/** Deletes a notification. */
export function useDeleteNotification() {
  return useApiMutation(
    (notificationId: string) => client.api.notifications({ notificationId }).delete(),
    { invalidateKeys: [queryKeys.notifications.all] },
  );
}
