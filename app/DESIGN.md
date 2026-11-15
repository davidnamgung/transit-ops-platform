# Design

**Concept.** Transit wayfinding: route bullets, condensed signage type, and each line drawn as a strip like a route diagram. Night is the default, Day is the alternate.

**Type.** One family, Archivo Variable. Headings use the condensed end of its width axis (about 72 to 85 percent) at heavy weights, like station signage. Body is normal width. Numbers use tabular figures.

**Color.** Ground, surface, raised, and rule are cool slates (Night) or cool grays (Day). Each line keeps its own signage color. Episode kinds use colors that are not line colors: violet for planned closures, pink for disruptions, teal for schedule gaps. Normal days are the line color, faded.

**Shape.** Open layouts with hairline rules. Exactly one boxed reading pane per screen (the day or episode detail). Radii are small and vary by role.

**Motion.** The year chart's rows reveal once per visit. Everything the person triggers answers fast: presses scale to 0.97, the segmented highlight slides, tooltips follow the pointer and appear instantly after the first. Keyboard actions (search, arrow keys) never animate. Reduced motion removes movement and keeps color changes.

**Accessibility floor.** Visible focus rings, keyboard access to every control, text alternatives (day table, episode table) for both charts, color never the only signal for kinds of day (labels and legends accompany it).

**Tokens.** All in `src/styles.css`, top of file.
