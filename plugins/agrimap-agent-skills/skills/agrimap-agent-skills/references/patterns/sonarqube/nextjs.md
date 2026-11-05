# SonarQube — Next.js and React

Next.js is not a Golden lane yet; AgriMap front ends are Angular. Rows are `catalog` React rules of Sonar's JS/TS analyzer, on top of [typescript.md](typescript.md), ready for the day a Next.js app is approved. Security: [security/nextjs.md](../security/nextjs.md).

| Golden | Key | Smell | New code |
| --- | --- | --- | --- |
| — | S6759 | Component props not read-only (`Readonly<Props>`) | must |
| — | S6479 | Array index used as `key` | must (stable id) |
| — | S6478 | Component defined inside another component | must |
| — | S6440 | Hook called conditionally or in a loop | must |
| — | S6754 | `useState` pair not named `[x, setX]` | must |
| — | S6767 | Unused prop type | must |
| — | S6747 | Unknown DOM property (`class` instead of `className`) | must |
| — | S6848 | Click handler on a non-interactive element | must (`<button>`) |
| — | S6853 | Form label not associated with a control | must |
| — | S6844 | `<a>` without a valid `href` | must (`<Link href>` or `<button>`) |
| ADV-20/23/24 | S1128, S125, S1854 | Unused import, commented code, dead store | must |
| QUALITY-01/03 | S3776, S3358 | Complexity; nested ternary in JSX | must (extract components, early returns) |
| — | team | `'use client'` on a component that needs no browser API | should not |
| — | team | Fetching in `useEffect` where a Server Component can fetch | should not |
