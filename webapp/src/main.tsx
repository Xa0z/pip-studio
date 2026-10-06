import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';

const tg = (window as unknown as {Telegram?: {WebApp?: TelegramWebApp}}).Telegram?.WebApp;
tg?.ready();
tg?.expand();

/** Follow Telegram's light/dark setting (or the system one outside Telegram) and paint Telegram's own header to match. */
function applyTheme() {
  const dark = tg?.colorScheme ? tg.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg && tg?.isVersionAtLeast?.('6.1')) {
    try {
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
    } catch {
      /* older clients */
    }
  }
}
applyTheme();
tg?.onEvent?.('themeChanged', applyTheme);
if (!tg?.colorScheme) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

export type TelegramWebApp = {
  initData: string;
  colorScheme?: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  openLink?: (url: string) => void;
  isVersionAtLeast?: (v: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, cb: () => void) => void;
  HapticFeedback?: {selectionChanged: () => void};
};

createRoot(document.getElementById('root')!).render(<App tg={tg} />);
