# Design

**Concept.** A service diary. The calendar (one square per day, weeks as columns, Monday at the top) is the signature chart, because weekends are visible in it and a weekend closure shows as a pair of squares. Every chart answers one question, stated as its title, and is followed by how to read it and what it shows.

**Type.** One family, Archivo Variable. Headlines use the condensed end of its width axis (about 66 to 86 percent) at heavy weights, like station signage. Body is normal width at 16px with a 1.6 line height. Numbers use tabular figures.

**Color.** Day is the default: cool paper (#F2F4F6), white surfaces, ink (#0F1B2A). Night is the alternate. Each line keeps its signage color. Episode kinds use colors that are never line colors: violet for planned closures, pink for disruptions, teal for schedule gaps. Normal days are the line's color, faded. One sequential ramp (cool to hot) is used for every "how bad" measure.

**Layout.** A top bar, then a wide left-aligned column. The story alternates text and figure in a 5/7 grid. Long documents use a sticky contents list. Containers are used only where they group something: a figure and its chart, or the one reading pane per screen.

**Motion.** One orchestrated moment: the hero calendars fill in once per visit. Everything a person triggers answers fast: presses scale to 0.97, the segmented highlight slides, tooltips follow the pointer and appear instantly after the first. Keyboard actions (search, arrows) never animate. Scroll-triggered entrances are deliberately absent. Reduced motion removes movement and keeps color changes.

**Words.** Plain, sentence case, active. Claims are computed from the data or from recorded pipeline numbers, never typed in by hand. Where evidence is thin the page says so.

**Accessibility floor.** Visible focus rings, keyboard access to every control, text equivalents for the charts (the day table, the episode table), color never the only signal for a kind of day, 44px touch targets on phones.

**Tokens.** All in `src/styles.css`, top of file.
