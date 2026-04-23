import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'resources' / 'ffmpeg'

def find_ffmpeg_dir():
    if not RES.exists():
        return None
    # find first directory containing an ffmpeg binary
    for p in RES.rglob('*'):
        if p.is_file() and p.name.lower().startswith('ffmpeg'):
            return p.parent
    return None


def main():
    ffdir = find_ffmpeg_dir()
    if not ffdir:
        print('No bundled ffmpeg found under resources/ffmpeg')
        return 2
    print('Using ffmpeg dir:', ffdir)

    env = os.environ.copy()
    env['PATH'] = str(ffdir) + os.pathsep + env.get('PATH', '')

    candidates = [
        'https://file-examples.com/wp-content/uploads/2017/04/file_example_MP4_640_3MG.mp4',
        'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4',
        'https://sample-videos.com/video123/mp4/240/big_buck_bunny_240p_1mb.mp4'
    ]

    for sample_url in candidates:
        out = ROOT / 'media' / 'verify_test.%(ext)s'
        out.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            'yt-dlp',
            '--extract-audio',
            '--audio-format', 'mp3',
            '-o', str(out),
            sample_url,
            '--no-playlist',
            '-f', 'best'
        ]

        print('Trying:', sample_url)
        print('Running:', ' '.join(cmd))
        try:
            subprocess.check_call(cmd, env=env)
            print('Post-processing test completed successfully with', sample_url)
            print('Check media/ for output.')
            return 0
        except subprocess.CalledProcessError as e:
            print('yt-dlp failed for', sample_url, 'exit', e.returncode)
            continue

    print('All candidates failed.')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
