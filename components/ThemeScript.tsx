/**
 * Runs synchronously in <head>, before hydration, so the correct theme is
 * applied on first paint (no flash of the wrong theme). Deliberately a
 * plain inline <script> rather than a React effect — an effect would only
 * run after the initial (light-styled) HTML has already painted.
 *
 * Pure client-side: reads localStorage, falls back to the OS
 * prefers-color-scheme media query, and toggles a class on <html>. No
 * cookies, no server round-trip — so it can never hit the auth middleware,
 * on the login page or anywhere else.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
