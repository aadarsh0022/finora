// Public help pages stay hosted even when the development API runs locally.
const publicSite = 'https://finora-api-olive.vercel.app';
export function publicPageUrl(page: 'privacy' | 'terms' | 'support') {
  return `${publicSite}/${page}`;
}
