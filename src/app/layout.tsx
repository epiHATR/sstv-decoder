import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

export const metadata: Metadata = {
  metadataBase: new URL("https://sstv-decoder.vercel.app"),
  title: {
    default: "SSTV Tools",
    template: "%s | SSTV Tools",
  },
  description: "Web-based SSTV (Slow Scan Television) tools: decode signals from your microphone or audio files, and encode SSTV audio from images. Multiple modes, spectrum view, and export. Works on desktop and mobile for ham radio and ISS SSTV.",
  keywords: [
    "SSTV",
    "Slow Scan Television",
    "Robot36",
    "Amateur Radio",
    "Ham Radio",
    "ISS",
    "ISS SSTV",
    "Signal Decoder",
    "Web Audio",
    "Radio Decoder",
    "FM Demodulation",
    "Digital Signal Processing",
    "DSP",
    "Robot 36",
    "SSTV Software",
    "Online SSTV Decoder",
    "Free SSTV Decoder",
    "Browser SSTV",
    "Web SSTV",
    "SSTV Online",
    "Radio Imaging",
    "Satellite Images",
    "Space Station SSTV"
  ],
  authors: [{ name: "smolgroot", url: "https://github.com/smolgroot" }],
  creator: "smolgroot",
  publisher: "smolgroot",
  category: "Technology",
  classification: "Radio Communications Software",
  openGraph: {
    title: "SSTV Tools",
    description: "Encode and decode amateur radio SSTV signals in the browser: microphone or file decode, image-to-audio encode. Multiple SSTV modes.",
    url: "https://sstv-decoder.vercel.app",
    siteName: "SSTV Tools",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SSTV Tools — encoding and decoding Slow Scan Television",
      },
    ],
    locale: "en_US",
    type: "website",
    countryName: "United States",
  },
  alternates: {
    canonical: "https://sstv-decoder.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    site: "@smolgroot",
    creator: "@smolgroot",
    title: "SSTV Tools",
    description: "Browser SSTV encoder and decoder: multiple modes, microphone or file input, image export and WAV output.",
    images: {
      url: "/og-image.png",
      alt: "SSTV Tools interface",
    },
  },
  verification: {
    google: "google-site-verification-token", // Replace with actual token when you verify
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SSTV Tools",
    startupImage: "/icon-512.png",
  },
  applicationName: "SSTV Tools",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "msapplication-TileColor": "#238636",
    "msapplication-config": "/browserconfig.xml",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#238636",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sstv-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <PWAInstallPrompt />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
                    function(registration) {
                      console.log('SW registered:', registration);
                    },
                    function(err) {
                      console.log('SW registration failed:', err);
                    }
                  );
                });
              }
            `.replace('process.env.NODE_ENV', JSON.stringify(process.env.NODE_ENV || 'production'))
          }}
        />
      </body>
    </html>
  );
}
