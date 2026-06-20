import { Geist, Geist_Mono, Jersey_20 } from "next/font/google";
import "./globals.css";

//

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

const jersey20 = Jersey_20({
  variable: "--font-jersey20",
  subsets: ["latin"],
  weight: "400"
});

//

export default function RootLayout({children}: Readonly<{children: React.ReactNode;}>) {
  return (
      <html
        lang="en"
        className={`h-full antialiased`}
      >
        <body className={`${geist.variable} ${geistMono.variable} ${jersey20.variable} font-sans min-h-full flex flex-col`}>
          {children}
        </body>
      </html>
  );
}
