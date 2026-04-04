import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner"; // Assuming you are using Sonner for toasts based on the page.tsx

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cybthreat",
  description: "Zero-Knowledge Enterprise Password Manager",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SecureVault",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a", // Matches your bg-slate-900 branding
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents annoying auto-zoom on iOS when typing passwords
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <AuthProvider>
          {/* Main App Content */}
          {children}
          
          {/* Global Toast Notifications */}
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}