"""Build helper to fetch platform-appropriate static FFmpeg binaries.

Usage (run at build time):
    python scripts/fetch_ffmpeg.py

This script downloads and extracts FFmpeg into `resources/ffmpeg/{platform}/`.
It is intentionally conservative and prints URLs so you can audit them before running.
"""
import os
import sys
import shutil
import stat
from pathlib import Path
import requests
import zipfile
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT_BASE = ROOT / 'resources' / 'ffmpeg'


PLATFORM_URLS = {
    'win32': [
        # Gyan builds (essentials)
        'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
    ],
    'linux': [
        # BtbN static builds
        'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
    ],
    'darwin': [
        # macOS static builds (if available)
        'https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip'
    ],
}


def download_and_extract(url: str, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url} ...")
    r = requests.get(url, stream=True)
    r.raise_for_status()
    fname = dest / 'archive'
    with open(fname, 'wb') as f:
        for chunk in r.iter_content(8192):
            if chunk:
                f.write(chunk)

    # Try to extract
    try:
        if zipfile.is_zipfile(fname):
            with zipfile.ZipFile(fname) as z:
                z.extractall(dest)
        elif tarfile.is_tarfile(fname):
            with tarfile.open(fname) as t:
                t.extractall(dest)
        else:
            print('Unknown archive type; leaving raw file in place')
    finally:
        try:
            fname.unlink()
        except Exception:
            pass


def make_executable(path: Path):
    try:
        path.chmod(path.stat().st_mode | stat.S_IEXEC)
    except Exception:
        pass


def main():
    plat = sys.platform
    if plat.startswith('linux'):
        key = 'linux'
    elif plat == 'darwin':
        key = 'darwin'
    elif plat.startswith('win'):
        key = 'win32'
    else:
        print(f'Unsupported platform: {plat}')
        return 1

    urls = PLATFORM_URLS.get(key)
    if not urls:
        print('No URLs configured for platform')
        return 1

    out = OUT_BASE / key
    out.mkdir(parents=True, exist_ok=True)

    for url in urls:
        try:
            download_and_extract(url, out)
        except Exception as e:
            print('Failed to download or extract', url, e)

    # Attempt to mark likely ffmpeg binaries executable
    for p in out.rglob('*ffmpeg*'):
        if p.is_file():
            make_executable(p)

    print('Done. Inspect', out)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
