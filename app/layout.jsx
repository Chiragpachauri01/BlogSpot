import "./styles/globals.css";

export const metadata = {
  title:       "Blog Master — CMS",
  description: "Centralized blog CMS for all brands",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
