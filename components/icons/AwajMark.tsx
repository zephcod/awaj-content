import * as React from "react";

/**
 * The Awaj ET gradient mark, loaded as a direct static-file `<img>` rather
 * than inlined SVG/JSX.
 *
 * Why not inline JSX: the previous version inlined the full <svg> (with
 * <linearGradient> defs) directly into the React tree. NavShell renders the
 * brand mark in more than one place at once (the mobile drawer header AND
 * the desktop sidebar are both mounted in the DOM simultaneously — only one
 * is hidden via CSS `display:none` per breakpoint, the other still exists).
 * That meant two copies of the same gradient `id`s (`awajmark-a` etc.) were
 * live in the document at once. Browsers resolve `url(#id)` / `xlink:href`
 * references to the *first* matching id in the whole document — and when
 * that first copy happened to sit inside the `display:none` instance for
 * the current breakpoint, the gradient failed to paint for the visible
 * instance too. That's exactly why the logo showed on mobile (where the
 * desktop sidebar, hidden and appearing later in the DOM, wasn't the first
 * match) but not on desktop (where the mobile header's hidden copy came
 * first in the DOM and broke the shared gradient chain).
 *
 * Loading the artwork as an `<img src="/awaj-mark.svg">` instead sidesteps
 * this entirely: each `<img>` parses the SVG in its own isolated document,
 * so gradient ids can never collide across instances, however many times
 * this component is rendered on the page.
 */
export function AwajMark({
  alt = "",
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/awaj-mark.svg" alt={alt} {...props} />;
}
