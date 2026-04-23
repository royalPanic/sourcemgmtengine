import sys
import json
import datetime
from PySide6.QtCore import Qt, QDateTime
from PySide6.QtWidgets import (QApplication, QDialog, QMessageBox, QFileDialog, QInputDialog)

from media_utils import copy_file_to_media, get_media_dir
import downloader
import ffmpeg_utils
from add_edit_source_dialog_ui import Ui_SourceDialog


class SourceDialog(QDialog, Ui_SourceDialog):
    def __init__(self, source_data=None, existing_tags=None, parent=None):
        super().__init__(parent)
        self.setupUi(self)

        # Connect tag buttons
        try:
            self.btnAddTag.clicked.connect(self.handle_add_tag)
            self.btnRemoveTag.clicked.connect(self.handle_remove_tag)
        except Exception:
            pass

        # Connect media buttons
        try:
            self.btnUploadFile.clicked.connect(self.handle_upload_file)
            self.btnAttachLink.clicked.connect(self.handle_attach_link)
            self.btnDownloadURL.clicked.connect(self.handle_download_url)
            self.btnCancelDownload.clicked.connect(self.handle_cancel_download)
        except Exception:
            pass

        self._media_path = ''
        self._download_info = None
        self._current_download_worker = None
        self._current_download_thread = None

    def handle_add_tag(self):
        try:
            tag = self.cboTagInput.currentText().strip()
            if not tag:
                return
            for i in range(self.listTags.count()):
                if self.listTags.item(i).text() == tag:
                    return
            self.listTags.addItem(tag)
            if self.cboTagInput.findText(tag) == -1:
                self.cboTagInput.addItem(tag)
            self.cboTagInput.setCurrentText("")
        except Exception:
            pass

    def handle_remove_tag(self):
        try:
            current_item = self.listTags.currentItem()
            if current_item:
                self.listTags.takeItem(self.listTags.row(current_item))
        except Exception:
            pass

    def handle_upload_file(self):
        try:
            file_path, _ = QFileDialog.getOpenFileName(self, "Select Media File", "", "All Files (*)")
            if file_path:
                relative_path = copy_file_to_media(file_path)
                if relative_path:
                    self._media_path = relative_path
                    self.txtMediaPath.setText(relative_path)
        except Exception as e:
            QMessageBox.warning(self, "Upload Error", str(e))

    def handle_attach_link(self):
        try:
            link, ok = QInputDialog.getText(self, "Attach Media Link", "Enter a URL or path to media:")
            if ok and link.strip():
                self._media_path = link.strip()
                self.txtMediaPath.setText(link.strip())
        except Exception:
            pass

    def get_data(self):
        uri = self.txtSourceURI.text().strip() if hasattr(self, 'txtSourceURI') else ''
        description = self.txtDescription.text().strip() if hasattr(self, 'txtDescription') else ''
        tags = []
        try:
            for i in range(self.listTags.count()):
                tags.append(self.listTags.item(i).text())
        except Exception:
            pass
        metadata = {"tags": tags}
        if getattr(self, '_download_info', None):
            metadata['download'] = self._download_info
        return uri, description, metadata, self._media_path

    def handle_download_url(self):
        url, ok = QInputDialog.getText(self, "Download Media", "Enter media URL to download:")
        if not ok or not url.strip():
            return
        url = url.strip()

        media_dir = get_media_dir()
        worker, thread = downloader.download_url_async(url, media_dir)
        self._current_download_worker = worker
        self._current_download_thread = thread

        try:
            self.progressBar.setValue(0)
            self.progressBar.setVisible(True)
            self.btnCancelDownload.setVisible(True)
        except Exception:
            pass

        def on_progress(pct):
            try:
                self.progressBar.setValue(pct)
            except Exception:
                pass

        def on_finished(rel_path, info):
            self._media_path = rel_path
            self._download_info = {'original_url': url, 'info': info}
            try:
                self.txtMediaPath.setText(rel_path)
                self.progressBar.setValue(100)
                self.progressBar.setVisible(False)
                self.btnCancelDownload.setVisible(False)
            except Exception:
                pass
            self._current_download_worker = None
            self._current_download_thread = None

        def on_error(msg):
            QMessageBox.warning(self, "Download Error", f"Download failed:\n{msg}")
            try:
                self.progressBar.setVisible(False)
                self.btnCancelDownload.setVisible(False)
            except Exception:
                pass
            self._current_download_worker = None
            self._current_download_thread = None

        worker.progress.connect(on_progress)
        worker.finished.connect(on_finished)
        worker.error.connect(on_error)

        thread.start()

    def handle_cancel_download(self):
        try:
            if self._current_download_worker:
                self._current_download_worker.stop()
        except Exception:
            pass
        try:
            self.btnCancelDownload.setVisible(False)
            self.progressBar.setVisible(False)
        except Exception:
            pass


if __name__ == '__main__':
    # Prefer bundled ffmpeg if present
    try:
        ffmpeg_utils.prepend_bundled_ffmpeg_to_path()
    except Exception:
        pass

    app = QApplication(sys.argv)
    dlg = SourceDialog()
    dlg.show()
    sys.exit(app.exec())
