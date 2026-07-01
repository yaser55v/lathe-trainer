# XR UI Tokens

This project uses Meta Horizon-style dark spatial UI surfaces. Keep future
`ui/*.uikitml` files aligned with these values unless a component has a clear
functional reason to differ.

## Color

- `surface`: `rgba(26, 26, 26, 0.96)`
- `surfaceRaised`: `rgba(42, 43, 48, 0.96)`
- `surfaceHover`: `rgba(255, 255, 255, 0.10)`
- `border`: `rgba(255, 255, 255, 0.14)`
- `borderSubtle`: `rgba(255, 255, 255, 0.10)`
- `textPrimary`: `rgba(238, 238, 238, 0.94)`
- `textSecondary`: `rgba(218, 218, 218, 0.68)`
- `textMuted`: `rgba(218, 218, 218, 0.42)`
- `primaryAction`: `rgba(0, 122, 255, 1)`
- `primaryActionHover`: `rgba(10, 132, 255, 1)`
- `success`: `rgba(76, 255, 145, 0.85)`
- `warning`: `rgba(255, 204, 0, 0.90)`
- `error`: `rgba(255, 80, 80, 0.90)`

Avoid pure black and pure white in XR surfaces. Meta recommends softer grays
for immersive comfort and readability.

## Layout

- Large panel padding: `4`
- Medium panel padding: `3`
- Compact panel padding: `2.2`
- Section gap: `2.4`
- Compact gap: `1.2`
- Panel radius: `3`
- Control radius: `1.4`
- Pill/icon radius: `10`
- Border width: `0.08`

## Type

- Large title: `4.2`, weight `700`
- Panel title: `2.6-3.2`, weight `700`
- Body: `2.0-2.2`, line-height `1.4-1.5`
- Secondary/metadata: `1.6-1.9`
- Button: `1.8-2.2`, weight `600`

## Controls

- Primary buttons use `primaryAction`.
- Secondary buttons use `surfaceRaised` or subtle white overlay.
- Destructive controls use red only for stop/close/destructive actions.
- Color meaning must be paired with text/icon cues, not color alone.
