"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ApiRequestError, type EdenResult, expectOk } from "@/api/request";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptionPlanLimit } from "@/providers/subscription-provider";

type MutationFn<TData, TVariables> = (variables: TVariables) => Promise<EdenResult<TData>>;

interface UseApiMutationOptions<TData, TVariables> {
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
  successMessage?: string | ((data: TData) => string);
  errorMessage?: string | ((error: ApiRequestError) => string);
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: ApiRequestError) => void;
}

/** Callback options a domain mutation hook forwards to `useApiMutation`. */
export interface MutationCallbacks<TData = unknown> {
  onSuccess?: (data: TData) => void;
}

const PLAN_LIMIT_PATTERN = /limit reached.*upgrade/i;

function isPlanLimitError(message: string): boolean {
  return PLAN_LIMIT_PATTERN.test(message);
}

/**
 * `useMutation` with Eden Treaty response unwrapping, query invalidation, and toasts. Plan-limit
 * 403s open the upgrade dialog instead of an error toast.
 */
export function useApiMutation<TData, TVariables = void>(
  mutationFn: MutationFn<TData, TVariables>,
  options?: UseApiMutationOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient();
  const notification = useToast();
  const { showUpgradePrompt } = useSubscriptionPlanLimit();

  return useMutation<TData, ApiRequestError, TVariables>({
    mutationFn: (variables) => expectOk(mutationFn(variables)),
    onSuccess: (data, variables) => {
      for (const key of options?.invalidateKeys ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }

      if (options?.successMessage) {
        const msg =
          typeof options.successMessage === "function"
            ? options.successMessage(data)
            : options.successMessage;
        notification.success(msg);
      }

      options?.onSuccess?.(data, variables);
    },
    onError: (error) => {
      if (isPlanLimitError(error.message)) {
        showUpgradePrompt(error.message);
        return;
      }

      if (options?.onError) {
        options.onError(error);
      } else if (options?.errorMessage) {
        const msg =
          typeof options.errorMessage === "function"
            ? options.errorMessage(error)
            : options.errorMessage;
        notification.error(msg);
      } else {
        notification.error(error.message ?? "Something went wrong");
      }
    },
  });
}
