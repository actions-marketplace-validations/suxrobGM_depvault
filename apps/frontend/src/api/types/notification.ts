import type { Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type NotificationsEndpoint = typeof client.api.notifications;

type NotificationListResponseDto = Data<NotificationsEndpoint["get"]>;
export type NotificationDto = NotificationListResponseDto["items"][number];

export type NotificationType = NotificationDto["type"];
