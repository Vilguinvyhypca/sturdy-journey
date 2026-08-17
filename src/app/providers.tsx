"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";

function ThemeLoader() {
  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { theme?: string }) => { if (data.theme) document.documentElement.dataset.theme = data.theme; })
      .catch(() => undefined);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ThemeLoader />{children}</SessionProvider>;
}
