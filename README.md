# sourcemgmtengine

## Development

- Create a virtualenv and install requirements:

```bash
pip install -r requirements.txt
```

### Building a single executable (PyInstaller)

This project bundles FFmpeg for yt-dlp post-processing. Use the included helper to fetch FFmpeg and build a single-file executable.

1. Install build deps (in your build environment):

```bash
python -m pip install -r requirements.txt pyinstaller
```

2. Fetch platform FFmpeg builds (the helper will place them under `resources/ffmpeg/<platform>`):

```bash
python scripts/fetch_ffmpeg.py
```

3. Build the single-file executable (the helper runs PyInstaller and includes the ffmpeg resources):

```bash
python scripts/build_exe.py --name source-management-engine
```

4. The produced binary will be in the `dist/` directory.

Notes:
- The `--add-data` flag includes the entire `resources/ffmpeg` folder into the executable bundle; at runtime the app prepends the bundled ffmpeg directory to `PATH` so `yt-dlp` can find it.
- Verify the produced executable on each target platform to ensure FFmpeg post-processing works (run an example download that requires ffmpeg merging/extraction).
