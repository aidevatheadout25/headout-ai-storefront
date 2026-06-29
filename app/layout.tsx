import type { Metadata } from "next";
import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Headout AI Storefront",
  description:
    "Internal registry and discovery layer for tools, apps, skills, docs, plugins, and MCPs built at Headout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/design-system/colors_and_type.css" />
      </head>
      <body>
        <Providers>
          <div className="app-shell">
            <Suspense fallback={null}>
              <Sidebar />
            </Suspense>
            <div className="app-content">
              <main className="app-main">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
