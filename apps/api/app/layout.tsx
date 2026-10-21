import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './style.css';

export const metadata: Metadata = {
  title: 'Finora',
  description: 'Thoughtful personal finance tracking.',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <a className="brand" href="/">
            finora<span> / personal finance</span>
          </a>
          {children}
          <footer>
            Built for a clearer picture of your money.
            <nav>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/support">Support & deletion</a>
              <a href="/delete-account">Delete account</a>
            </nav>
          </footer>
        </main>
      </body>
    </html>
  );
}
