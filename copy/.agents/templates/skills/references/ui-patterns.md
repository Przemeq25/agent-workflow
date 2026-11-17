# UI patterns

Written by `/prd design` from the project and the user's rules. Every rule is checkable by the reviewer.
Project-specific rules first; the general rules below stay unless the user removes them.

## Project rules

- Tone and texts: <fill> (user language from `business-rules`, form of address, tone).
- Layout and navigation: <fill> (page shell, widths, where actions live).
- Forms: <fill> (field component, validation timing, where errors show, saving).
- Lists and tables: <fill> (empty state, pagination or load more, row actions).
- Visual references: <fill> (Figma file and frames, screenshots) or "none".

## General rules

- **One system.** One button style per role (primary, secondary, destructive), one radius family, one card recipe,
  one link look, one heading scale. Tokens from `ui-tokens.md` only; no raw colours or sizes, no library defaults
  that ignore the theme.
- **Every view has its states:** loading, empty (says what is missing and offers the next action), error (what
  happened and what to do), success. A confirmation appears only after the server confirmed.
- **Errors next to their cause:** a field error under its field, a page error at the top with a way out.
- **Texts name things:** headings say what the section holds, buttons are a verb and an object ("Dodaj pokój", not
  "OK"); no filler, no invented data (reviews, numbers, names) in the UI.
- **One main action per screen or section**; a destructive action asks for confirmation and says what is lost.
- **Quiet motion:** feedback on hover, press and focus; no content that appears only on scroll, no parallax on text;
  respect reduced motion; anything moving longer than 5 s can be paused.
- **Accessible:** visible labels, a visible focus ring, everything reachable by keyboard, headings one level at a
  time, alt text on images, text contrast at least WCAG AA, touch targets at least 44 px on phones.
- **Responsive:** works at 390, 768, 1024 and 1440 px; no sideways scroll; one column on a phone.
- **Equal edges:** content aligns to the page's container or grid; nothing sticks out on one side.

Last changed by: <change ID or /prd design>.
