"use client";

import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { type EdenResult, expectOk } from "@/api/request";
import { useToast } from "@/hooks/use-toast";

type QueryFn<T> = () => Promise<EdenResult<T>>;

interface UseApiQueryOptions<T> extends Omit<UseQueryOptions<T>, "queryKey" | "queryFn"> {
  errorMessage?: string | ((error: Error) => string);
}

/** `useQuery` with Eden Treaty response unwrapping and an optional `errorMessage` toast. */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  queryFn: QueryFn<T>,
  options?: UseApiQueryOptions<T>,
) {
  const { errorMessage, ...queryOptions } = options ?? {};
  const notification = useToast();

  const result = useQuery<T>({
    queryKey,
    queryFn: () => expectOk(queryFn()),
    ...queryOptions,
  });

  useEffect(() => {
    if (result.error && errorMessage) {
      const msg = typeof errorMessage === "function" ? errorMessage(result.error) : errorMessage;
      notification.error(msg);
    }
  }, [result.error, errorMessage, notification]);

  return result;
}
