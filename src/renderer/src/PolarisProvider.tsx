// Polaris context + theme injection. Replaces the setup that lived in the old
// Next.js app/layout.tsx + app/providers.tsx:
//   - Shopify Polaris AppProvider with English translations
//   - Polaris stylesheet
//   - the six --dl-* brand color CSS variables (fetched live from api:theme,
//     falling back to the defaults baked into globals.css)

import "@shopify/polaris/build/esm/styles.css";
import { useEffect, type ReactNode } from "react";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

interface ThemeColors {
  primaryColor: string;
  primaryHover: string;
  primarySoft: string;
  darkColor: string;
  lightColor: string;
  paperColor: string;
}

/** Accept only #rgb / #rrggbb so an injected color can't break out of the <style>. */
function sanitizeColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test((value || "").trim())
    ? value.trim()
    : fallback;
}

function applyTheme(theme: ThemeColors) {
  const css =
    `html:root{` +
    `--dl-primary:${sanitizeColor(theme.primaryColor, "#EC6B23")};` +
    `--dl-primary-hover:${sanitizeColor(theme.primaryHover, "#D45C1C")};` +
    `--dl-primary-soft:${sanitizeColor(theme.primarySoft, "#FCE5D3")};` +
    `--dl-dark:${sanitizeColor(theme.darkColor, "#2F2F2F")};` +
    `--dl-light:${sanitizeColor(theme.lightColor, "#E6E3E0")};` +
    `--dl-paper:${sanitizeColor(theme.paperColor, "#FAFAF8")};` +
    `}`;
  let el = document.getElementById("dl-theme-vars");
  if (!el) {
    el = document.createElement("style");
    el.id = "dl-theme-vars";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default function PolarisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/theme")
      .then((r) => (r.ok ? r.json() : null))
      .then((theme) => {
        if (!cancelled && theme) applyTheme(theme as ThemeColors);
      })
      .catch(() => {
        // Defaults in globals.css already apply — ignore.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AppProvider i18n={enTranslations}>{children}</AppProvider>;
}
