import { budgetRoute } from './budget-router';
import { goalsRoute } from './goals-router';
import { recurringRoute } from './recurring-router';
export async function advancedRoute(request: Request, requestId: string): Promise<Response | null> {
  return (
    (await budgetRoute(request, requestId)) ??
    (await goalsRoute(request, requestId)) ??
    (await recurringRoute(request, requestId))
  );
}
