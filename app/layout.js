import './globals.css';

export const metadata = {
  title: 'Chat',
  description: 'A Next.js chat app with direct messages and group chats.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7c5cff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
