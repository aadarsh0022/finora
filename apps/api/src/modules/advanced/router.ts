import { budgetRoute } from './budget-router';
export async function advancedRoute(request: Request, requestId: string): Promise<Response | null> {
  return budgetRoute(request, requestId);
}
