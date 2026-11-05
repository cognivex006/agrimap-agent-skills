# SonarQube — CSS and SCSS

`css` rules for `.css`/`.scss` component and global styles. No AgriMap scan has reported a CSS finding yet, so every row is `catalog`; the tiers still apply. Golden style rules (tokens, ui-kit classes) stay in [frontend.md](../frontend.md).

| Golden | Key | Smell | New code | Existing code |
| --- | --- | --- | --- | --- |
| ADV-43 | S4658 | Empty block `{}` | must | safe |
| ADV-43 | S4656 | Duplicate property in one block | must | safe (keep the last value: it is the one in effect) |
| ADV-43 | S4657 | Shorthand after a longhand overrides it (`padding-left` then `padding`) | must | recommend |
| ADV-43 | S4666 | Duplicate selector in one file | must | recommend (merge in cascade order) |
| ADV-43 | S4647 | Invalid hex color | must | safe |
| ADV-43 | S4649 | `font-family` without a generic fallback | must | safe |
| ADV-43 | S4654 | Unknown property | must | recommend (may be a vendor or newer property) |
| ADV-43 | S4659, S4660 | Unknown pseudo-class or pseudo-element (`::ng-deep` is Angular: review separately) | must | recommend |
| ADV-43 | S4662 | Unknown at-rule (`@use`, `@include` are valid in `.scss`) | must | recommend |
| ADV-43 | S4655 | `!important` inside `@keyframes` | must | safe |
| ADV-43 | S4667 | Empty stylesheet | must (delete it and its `styleUrl`) | safe |
| ADV-43 | S5362 | `calc()` operator without spaces | must | safe |
| ADV-23 | verify | Commented-out rule blocks | must | safe |
| — | team | New `::ng-deep` | should not (ui-kit tokens or `:host`) | recommend |
| — | team | Hard-coded color where a design token exists | should | recommend |
