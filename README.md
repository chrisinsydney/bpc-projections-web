# BPC Projections — Web

Client-side tool that combines a still image + an audio file into an MP4, using [ffmpeg.wasm](https://ffmpegwasm.netlify.app/). All encoding happens in the browser; no upload, no server.

Live: https://bpc.gabbybeth.com

## Local development

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`ffmpeg.wasm` won't load from `file://`, so a local web server is required.

## Layout

- `index.html` / `app.js` / `style.css` — the app.
- `vendor/` — self-hosted `@ffmpeg/ffmpeg` 0.12.10, `@ffmpeg/util` 0.12.1, and `@ffmpeg/core` 0.12.6 (single-threaded). Self-hosted to avoid cross-origin Worker restrictions.
