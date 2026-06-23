import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Headout AI Storefront",
  description:
    "Internal registry and discovery layer for tools, apps, skills, plugins, and MCPs built at Headout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/design-system/colors_and_type.css" />
        <link rel="stylesheet" href="/design-system/dark-mode.css" />
      </head>
      <body>
        <Providers>
          <div className="app-shell">
            <Header />
            <main className="app-main">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
