import { Inter } from "next/font/google";
import "./globals.css";

// Menggunakan font Inter yang sudah dibersihkan dari typo
const interFont = Inter({ subsets: ["latin"] }); 

export const metadata = {
  title: "Form Pendaftaran Umroh",
  description: "Seamless Form - Kian Simpul Makna",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={interFont.className}>
        {children}
      </body>
    </html>
  );
}
