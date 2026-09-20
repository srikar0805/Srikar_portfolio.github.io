# Sai Srikar Reddy Kolli: Portfolio

A futuristic 3D portfolio for ML systems, evaluation and agent tooling work. Hand-written WebGL, no frameworks, no build step.

**Live:** [srikar0805.github.io/Srikar_portfolio.github.io](https://srikar0805.github.io/Srikar_portfolio.github.io/)

## What's on the page

- **A live 3D scene behind everything.** A drifting starfield, a neon grid floor and slowly turning wireframe solids, all in WebGL. The camera follows your pointer and your scroll, so moving down the page moves you through the scene.
- **A hologram portrait.** 10,000 points sampled from a photo assemble into a point cloud with a scan line sweeping across it and particle rings orbiting it. Drag it, or focus it and use the arrow keys, to rotate.
- **Glass panels with HUD details.** Section numbering, corner brackets, a scroll progress bar, and project cards that tilt in 3D under the mouse.
- **Content:** about, experience, projects (including [HireLine](https://hireline-self.vercel.app) and [career-agent](https://github.com/srikar0805/career-agent)), skills, education and all four certifications with verification links.

## Built to degrade well

- **Reduced motion:** with `prefers-reduced-motion`, the scene renders a still frame, the hologram skips its fly-in, and scroll reveals and the ticker stop.
- **No WebGL:** the page falls back to a gradient background and hides the hologram. All content stays readable.
- **No JavaScript:** every section is still visible.
- **Performance:** render loops pause when the tab is hidden or the hologram is off screen. Pixel ratio is capped, and phones draw fewer stars and half the portrait points.
- **Accessibility:** a skip link, semantic sections, visible focus outlines, and a keyboard-rotatable hologram with a text label.

## Project structure

```
Srikar_portfolio.github.io/
├── index.html              page markup and content
├── assets/
│   ├── style.css           theme, layout, glass panels, HUD styling
│   ├── scene.js            WebGL: background scene and hologram portrait
│   ├── ui.js               scroll reveal, progress bar, active nav, card tilt
│   └── face-points.js      generated point-cloud data for the portrait
├── index-legacy.html       previous version of the site, kept for reference
├── css/, js/, images/, myself.jpeg   assets used only by index-legacy.html
└── README.md
```

## Run it locally

The page loads its scripts as separate files, so serve the folder rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

GitHub Pages serves the `main` branch from the repository root. Push to `main` and the site updates within a minute or two.

## Tech

HTML, CSS and JavaScript with raw WebGL 1 shaders. The only external resources are two Google Fonts (Space Grotesk and JetBrains Mono), with system font fallbacks.

## Contact

- **Email:** srikarreddy0805@gmail.com
- **GitHub:** [github.com/srikar0805](https://github.com/srikar0805)
- **LinkedIn:** [linkedin.com/in/sai-srikar-reddy-kolli](https://www.linkedin.com/in/sai-srikar-reddy-kolli/)
