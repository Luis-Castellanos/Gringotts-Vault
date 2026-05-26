/**
 * Route protection. Every request must carry a valid owner session cookie except:
 *   - /login (the passkey UI)
 *   - /api/auth/* (status, register, login, logout)
 *   - Next internals + static assets (handled by the matcher below)
 *
 * Edge-safe: only imports lib/auth/{config,session} (jose, no Node/DB). On a
 * missing/invalid session, page requests redirect to /login and API requests
 * get a 401.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/config';
import { isValidSession } from '@/lib/auth/session';
import { DEMO_MODE } from '@/lib/demo/mode';

function isPublic(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/api/auth/');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Demo deployment: no passkey. Everyone's let straight in (the DB is a
  // throwaway demo DB, never the owner's real data). The login UI is pointless
  // here, so bounce it to the app.
  if (DEMO_MODE) {
    if (pathname === '/login') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and files with an extension
  // (static assets, images, etc.). The fallthrough still lets /login through
  // via isPublic, but excluding assets here avoids needless edge invocations.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
