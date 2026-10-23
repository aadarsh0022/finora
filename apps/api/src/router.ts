import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '@finora/contracts';
import { publicUser } from './database/models';
import * as auth from './modules/auth/service';
import { rateLimit } from './security/rate-limit';
import { financeRoute, onboardingRoute } from './modules/finance/router';
import { advancedRoute } from './modules/advanced/router';
import { exportsRoute } from './modules/exports/router';
import { reportsRoute } from './modules/reports/router';
import { entitlementsRoute } from './modules/entitlements/router';
import { debtsRoute } from './modules/debts/router';
import { outlookRoute } from './modules/outlook/router';
import { ApiError, handle, readBody, success } from './utils/http';

export function dispatch(request: Request) {
  return handle(async (requestId) => {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    const key = `${request.method} ${path}`;
    const financial =
      (await outlookRoute(request, requestId)) ??
      (await debtsRoute(request, requestId)) ??
      (await reportsRoute(request, requestId)) ??
      (await entitlementsRoute(request, requestId)) ??
      (await financeRoute(request, requestId)) ??
      (await onboardingRoute(request, requestId)) ??
      (await advancedRoute(request, requestId)) ??
      (await exportsRoute(request, requestId));
    if (financial) return financial;
    const authNames = [
      'register',
      'login',
      'refresh',
      'forgot-password',
      'reset-password',
      'me',
      'logout',
      'logout-other-sessions',
      'change-password',
      'account',
    ];
    if (authNames.some((name) => path === `/api/v1/auth/${name}`) && request.method !== 'GET')
      await rateLimit(request, path);
    switch (key) {
      case 'POST /api/v1/auth/register': {
        const input = await readBody(request, registerSchema);
        await rateLimit(request, path, input.email);
        return success(await auth.register(input), requestId, 201);
      }
      case 'POST /api/v1/auth/login': {
        const input = await readBody(request, loginSchema);
        await rateLimit(request, path, input.email);
        return success(await auth.login(input), requestId);
      }
      case 'POST /api/v1/auth/refresh': {
        const input = await readBody(request, refreshSchema);
        return success(await auth.refresh(input.refreshToken), requestId);
      }
      case 'POST /api/v1/auth/forgot-password': {
        const input = await readBody(request, forgotPasswordSchema);
        await rateLimit(request, path, input.email);
        const recovery = await auth.forgotPassword(input.email);
        if (recovery === 'delivery-failed')
          console.error(
            JSON.stringify({ level: 'error', requestId, code: 'RECOVERY_DELIVERY_FAILED' }),
          );
        return success(
          { message: 'If an account exists, a recovery email has been sent.' },
          requestId,
        );
      }
      case 'POST /api/v1/auth/reset-password': {
        const input = await readBody(request, resetPasswordSchema);
        await auth.resetPassword(input.token, input.password);
        return success({ message: 'Password reset. Sign in with your new password.' }, requestId);
      }
      case 'GET /api/v1/auth/me':
        return success(publicUser((await auth.authenticate(request)).user), requestId);
      case 'POST /api/v1/auth/logout': {
        await auth.logout(await auth.authenticate(request));
        return success({ message: 'Signed out.' }, requestId);
      }
      case 'POST /api/v1/auth/logout-other-sessions': {
        await auth.logoutOthers(await auth.authenticate(request));
        return success({ message: 'Other sessions signed out.' }, requestId);
      }
      case 'POST /api/v1/auth/change-password': {
        const context = await auth.authenticate(request);
        const input = await readBody(request, changePasswordSchema);
        await auth.changePassword(context, input.currentPassword, input.newPassword);
        return success({ message: 'Password changed. Sign in again on all devices.' }, requestId);
      }
      case 'DELETE /api/v1/auth/account': {
        const context = await auth.authenticate(request);
        const input = await readBody(request, deleteAccountSchema);
        await auth.deleteAccount(context, input.password);
        return success({ message: 'Account and associated application data deleted.' }, requestId);
      }
    }
    if (path.startsWith('/api/v1/auth/')) {
      const known = [
        'register',
        'login',
        'refresh',
        'forgot-password',
        'reset-password',
        'me',
        'logout',
        'logout-other-sessions',
        'change-password',
        'account',
      ];
      if (known.some((name) => path === `/api/v1/auth/${name}`))
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
    }
    throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  });
}
