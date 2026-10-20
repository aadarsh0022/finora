import { budgetRoute } from './budget-router';
import { goalsRoute } from './goals-router';
export async function advancedRoute(request: Request, requestId: string): Promise<Response | null> {
  return (await budgetRoute(request, requestId)) ?? (await goalsRoute(request, requestId));
}
