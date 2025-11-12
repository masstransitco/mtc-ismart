import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { ViewProvider } from "@/contexts/view-context";
import { SpeedUnitProvider } from "@/contexts/speed-unit-context";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SAIC MQTT API - Vehicle Management",
  description: "Monitor and control your MG4 Electric vehicles via SAIC MQTT Gateway",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ViewProvider>
            <SpeedUnitProvider>
              <AppHeader />
              <main className="pt-[72px] pb-[72px]">
                {children}
              </main>
              <BottomNavigation />
              <Toaster />
            </SpeedUnitProvider>
          </ViewProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
