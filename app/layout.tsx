import type { ReactNode } from "react";

export const metadata = {
  title: "お金の健康診断",
  description: "必要保障の過不足を、根拠つきで返す診断",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
