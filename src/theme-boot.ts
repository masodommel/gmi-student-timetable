type Theme = 'light' | 'dark';

const match = document.cookie.match(/(?:^|; )gmi-theme=(dark|light)/);
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme: Theme = match ? (match[1] as Theme) : prefersDark ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1f1f1f' : '#ffffff');
