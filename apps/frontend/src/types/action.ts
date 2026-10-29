/** Standard result shape returned by server actions. */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
