import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import downloader
import yt_dlp


def main():
    url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    out_dir = str(ROOT / 'media')
    print('Testing yt-dlp info extraction (using yt_dlp directly, no download)')
    ydl_opts = {'skip_download': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    title = info.get('title') if isinstance(info, dict) else repr(info)
    print('Success. Title:', title)

if __name__ == '__main__':
    main()
