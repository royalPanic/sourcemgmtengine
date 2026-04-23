import os
import traceback
from PySide6.QtCore import QObject, Signal, Slot, QThread
import yt_dlp
from yt_dlp.utils import DownloadError


class DownloadWorker(QObject):
    """Worker that downloads a single URL using yt-dlp.

    Signals:
        progress(int) -> percent complete (0-100)
        finished(str, dict) -> relative_path, info_dict
        error(str) -> error message / traceback
    """

    progress = Signal(int)
    finished = Signal(str, dict)
    error = Signal(str)

    def __init__(self, url: str, out_dir: str, ytdl_opts: dict | None = None):
        super().__init__()
        self.url = url
        self.out_dir = out_dir
        self.ytdl_opts = ytdl_opts or {}
        self._stop = False
        self._ydl = None

    @Slot()
    def run(self):
        try:
            os.makedirs(self.out_dir, exist_ok=True)

            # Build default options and allow overrides
            outtmpl = os.path.join(self.out_dir, '%(id)s_%(title)s.%(ext)s')
            opts = {
                'outtmpl': outtmpl,
                'format': 'best',
                'noplaylist': True,
                'quiet': True,
                'no_warnings': True,
            }
            opts.update(self.ytdl_opts)

            def progress_hook(d):
                status = d.get('status')
                # Allow cancellation
                if getattr(self, '_stop', False):
                    raise DownloadError('download cancelled')
                if status == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    downloaded = d.get('downloaded_bytes') or 0
                    percent = 0
                    if total:
                        try:
                            percent = int(downloaded * 100 / total)
                        except Exception:
                            percent = 0
                    self.progress.emit(percent)

            opts['progress_hooks'] = [progress_hook]

            with yt_dlp.YoutubeDL(opts) as ydl:
                # expose ydl for potential stop hooks
                self._ydl = ydl
                info = ydl.extract_info(self.url, download=True)

            # Attempt to find the downloaded filepath
            filepath = None
            if isinstance(info, dict):
                req = info.get('requested_downloads')
                if req and isinstance(req, list) and req[0].get('filepath'):
                    filepath = req[0]['filepath']

            if not filepath:
                # Fallback: pick newest file in out_dir
                files = [os.path.join(self.out_dir, f) for f in os.listdir(self.out_dir)]
                if files:
                    filepath = max(files, key=os.path.getmtime)

            if not filepath or not os.path.exists(filepath):
                raise RuntimeError('Could not determine downloaded file path')

            rel = os.path.relpath(filepath, os.getcwd()).replace('\\', '/')
            self.finished.emit(rel, info)
        except Exception as e:
            tb = traceback.format_exc()
            self.error.emit(f"{e}\n{tb}")

    @Slot()
    def stop(self):
        """Signal the worker to stop the download. This sets a flag checked in the progress hook.

        If possible, attempt to call internal downloader stop method on the active ydl instance.
        """
        self._stop = True
        try:
            if self._ydl and getattr(self._ydl, '_downloader', None):
                # Attempt to stop internal downloader if available
                downloader = getattr(self._ydl, '_downloader')
                stop_fn = getattr(downloader, 'stop', None)
                if callable(stop_fn):
                    stop_fn()
        except Exception:
            pass


def download_url_async(url: str, out_dir: str):
    """Start an async download. Returns (worker, thread).

    Caller should connect to worker.progress/finished/error before starting the thread.
    """
    thread = QThread()
    worker = DownloadWorker(url, out_dir)
    worker.moveToThread(thread)
    thread.started.connect(worker.run)

    # Ensure clean teardown when finished or error
    def _on_done(*_):
        thread.quit()

    worker.finished.connect(_on_done)
    worker.error.connect(_on_done)

    # When thread finishes, delete objects
    thread.finished.connect(worker.deleteLater)
    thread.finished.connect(thread.deleteLater)

    return worker, thread


def download_url_sync(url: str, out_dir: str, ytdl_opts: dict | None = None):
    """Synchronous download helper. Returns (relative_path, info_dict). Raises on error."""
    os.makedirs(out_dir, exist_ok=True)
    outtmpl = os.path.join(out_dir, '%(id)s_%(title)s.%(ext)s')
    opts = {
        'outtmpl': outtmpl,
        'format': 'best',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
    }
    if ytdl_opts:
        opts.update(ytdl_opts)

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    filepath = None
    if isinstance(info, dict):
        req = info.get('requested_downloads')
        if req and isinstance(req, list) and req[0].get('filepath'):
            filepath = req[0]['filepath']

    if not filepath:
        files = [os.path.join(out_dir, f) for f in os.listdir(out_dir)]
        if files:
            filepath = max(files, key=os.path.getmtime)

    if not filepath or not os.path.exists(filepath):
        raise RuntimeError('Could not determine downloaded file path')

    rel = os.path.relpath(filepath, os.getcwd()).replace('\\', '/')
    return rel, info
