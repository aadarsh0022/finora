import { vi } from 'vitest';

// Route handlers run without Next's request lifecycle in integration tests.
// Await after-response work so assertions and disposable database cleanup are deterministic.
vi.mock('next/server', () => ({ after: (task: () => Promise<void>) => task() }));
