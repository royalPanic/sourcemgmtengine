import os
from pathlib import Path


def get_bundled_ffmpeg_dir():
    """Return the path to a bundled ffmpeg directory for the current platform, if present."""
    base = Path(__file__).resolve().parent
    resources = base / 'resources' / 'ffmpeg'
    plat = os.sys.platform
    if plat.startswith('linux'):
        key = 'linux'
    elif plat == 'darwin':
        key = 'darwin'
    elif plat.startswith('win'):
        key = 'win32'
    else:
        return None

    candidate = resources / key
    if candidate.exists():
        # Try to find a folder that contains ffmpeg binary
        return str(candidate)
    return None


def prepend_bundled_ffmpeg_to_path():
    """If a bundled ffmpeg directory exists, prepend it to PATH so yt-dlp will find it."""
    ffdir = get_bundled_ffmpeg_dir()
    if not ffdir:
        return False
    # Some zips extract into a subdirectory; search for executable directory
    p = Path(ffdir)
    # prefer directories containing an 'ffmpeg' file
    for sub in [p] + [d for d in p.iterdir() if d.is_dir()]:
        for name in ('ffmpeg', 'ffmpeg.exe'):
            if (sub / name).exists():
                os.environ['PATH'] = str(sub) + os.pathsep + os.environ.get('PATH', '')
                return True
    return False
