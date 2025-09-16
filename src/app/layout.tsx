"use client"

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

export const metadata = {
  title: 'MTG Scraper',
  description: 'A web scraper for MTG cards',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ChakraProvider value={defaultSystem}>
          {children}
        </ChakraProvider>
      </body>
    </html>
  );
}
