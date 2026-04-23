"""Build helper: fetch FFmpeg and run PyInstaller to produce a single executable.

Usage:
    python scripts/build_exe.py --name MyApp

This script will:
 - Run `scripts/fetch_ffmpeg.py` to populate `resources/ffmpeg/<platform>`
 - Invoke PyInstaller with `--onefile` and `--add-data` to include the ffmpeg resources

Notes:
 - Ensure you have `pyinstaller` installed in the build environment.
 - On Windows the PyInstaller add-data separator is `;`, on *nix it's `:`.
"""
import os
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESOURCES_FFMPEG = ROOT / 'resources' / 'ffmpeg'


def run_fetch_ffmpeg():
    script = ROOT / 'scripts' / 'fetch_ffmpeg.py'
    if not script.exists():
        print('fetch_ffmpeg.py not found; skipping ffmpeg fetch')
        return
    print('Fetching FFmpeg builds (may take a while)...')
    subprocess.check_call([sys.executable, str(script)])


def build_exe(app_name: str = 'sourcemgmtengine'):
    sep = ';' if os.name == 'nt' else ':'
    # Ensure ffmpeg resources are present
    if not RESOURCES_FFMPEG.exists():
        print('FFmpeg resources missing. Running fetch script...')
        run_fetch_ffmpeg()

    add_data_arg = f"{RESOURCES_FFMPEG}{sep}resources/ffmpeg"

    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--noconfirm',
        '--onefile',
        '--name', app_name,
        '--add-data', add_data_arg,
        'main.py'
    ]

    # Ensure yt-dlp is included if PyInstaller misses it
    cmd += ['--hidden-import', 'yt_dlp']

    print('Running PyInstaller:', ' '.join(cmd))
    subprocess.check_call(cmd)


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--name', default='sourcemgmtengine')
    args = p.parse_args()
    build_exe(args.name)


if __name__ == '__main__':
    main()
