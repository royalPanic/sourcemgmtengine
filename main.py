import sys
import json
import datetime
from PySide6.QtCore import Qt, QDateTime
from PySide6.QtWidgets import (QApplication, QDialog, QMainWindow, QMessageBox, QFileDialog, QInputDialog)
from PySide6.QtWidgets import QTreeWidgetItem, QTableWidgetItem

from media_utils import copy_file_to_media, get_media_dir
import downloader
import ffmpeg_utils
from add_edit_source_dialog_ui import Ui_SourceDialog
from main_window_ui import Ui_MainWindow
from edit_topic_dialog_ui import Ui_EditTopicDialog
from engine_db import SourceManagerDB


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

        if source_data:
            # source_data expected as a tuple matching DB row
            sid, uri, stype, reliability, credibility, metadata, stance, description, media_path = source_data
            try:
                self.txtSourceURI.setText(uri or '')
                self.txtDescription.setText(description or '')
                self.cboSourceType.setCurrentText(stype or '')
                self.cboReliability.setCurrentText(str(reliability))
                self.cboCredibility.setCurrentText(str(credibility))
                self.cboStance.setCurrentText(stance or '')
                self._media_path = media_path or ''
                self.txtMediaPath.setText(self._media_path)
                if metadata:
                    meta = json.loads(metadata)
                    for t in meta.get('tags', []):
                        self.listTags.addItem(t)
            except Exception:
                pass

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


class EditTopicDialog(QDialog, Ui_EditTopicDialog):
    def __init__(self, title='', group='', event_date=None, groups=None, parent=None):
        super().__init__(parent)
        self.setupUi(self)
        # populate groups
        if groups:
            for g in groups:
                self.cboEditGroup.addItem(g)
        self.txtEditTitle.setText(title)
        self.cboEditGroup.setCurrentText(group or '')

        # initialize event date/time
        has_time = False
        if event_date:
            try:
                dt = QDateTime.fromString(event_date, Qt.ISODate)
                if dt.isValid():
                    self.dtEditEventDate.setDateTime(dt)
                    # detect if the provided ISO string included a time portion
                    if 'T' in event_date or len(event_date) > 10:
                        has_time = True
            except Exception:
                pass

        # connect checkbox to toggle whether time is shown/used
        try:
            self.chkEditEnableTime.toggled.connect(self._on_toggle_time)
        except Exception:
            pass

        # set initial checkbox state and display format
        try:
            self.chkEditEnableTime.setChecked(has_time)
            self._on_toggle_time(has_time)
        except Exception:
            pass

    def _on_toggle_time(self, enabled: bool):
        # When time is disabled, show only date; when enabled, show date+time
        try:
            if enabled:
                # show full ISO-like date/time
                self.dtEditEventDate.setDisplayFormat('yyyy-MM-dd HH:mm:ss')
            else:
                # show only date
                self.dtEditEventDate.setDisplayFormat('yyyy-MM-dd')
        except Exception:
            pass


class MainWindow(QMainWindow, Ui_MainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setupUi(self)
        self.db = SourceManagerDB()

        # Wire UI signals
        try:
            self.btnAddTopic.clicked.connect(self.add_topic)
            self.btnEditTopic.clicked.connect(self.edit_topic)
            self.btnDeleteTopic.clicked.connect(self.delete_topic)
            self.treeTopics.itemClicked.connect(self.on_topic_selected)
            self.btnAddSource.clicked.connect(self.add_source)
            self.btnEditSource.clicked.connect(self.edit_source)
            self.btnDeleteSource.clicked.connect(self.delete_source)
            self.cboFilterStance.currentTextChanged.connect(self.on_filter_changed)
        except Exception:
            pass

        self._current_topic_id = None
        self.load_topics()
        # populate filter items (UI already set in generated code)

    def load_topics(self):
        self.treeTopics.clear()
        topics = self.db.get_all_topics()
        groups = {}
        for tid, title, group_name, event_date in topics:
            if group_name not in groups:
                grp_item = QTreeWidgetItem(self.treeTopics)
                grp_item.setText(0, group_name)
                grp_item.setData(0, Qt.UserRole, None)
                groups[group_name] = grp_item
            # Create topic item with two columns: title and event date
            topic_item = QTreeWidgetItem()
            topic_item.setText(0, title)
            # Ensure a safe string for the event date column
            topic_text_date = event_date or ''
            topic_item.setText(1, topic_text_date)
            topic_item.setData(0, Qt.UserRole, tid)
            groups[group_name].addChild(topic_item)
        self.treeTopics.expandAll()

    def on_topic_selected(self, item, column):
        topic_id = item.data(0, Qt.UserRole)
        if topic_id is None:
            return
        self._current_topic_id = topic_id
        self.lblSourcesFor.setText(f"Sources for: {item.text(0)}")
        self.load_sources_for_topic(topic_id)

    def load_sources_for_topic(self, topic_id):
        stance_filter = self.cboFilterStance.currentText()
        rows = self.db.get_sources_for_topic(topic_id, stance_filter if stance_filter != 'All' else None)
        self.tableSources.setRowCount(0)
        for r in rows:
            sid, uri, stype, reliability, credibility, metadata, stance, description, media_path = r
            row = self.tableSources.rowCount()
            self.tableSources.insertRow(row)
            it0 = QTableWidgetItem(uri or '')
            it0.setData(Qt.UserRole, sid)
            self.tableSources.setItem(row, 0, it0)
            self.tableSources.setItem(row, 1, QTableWidgetItem(description or ''))
            self.tableSources.setItem(row, 2, QTableWidgetItem(stype or ''))
            self.tableSources.setItem(row, 3, QTableWidgetItem(str(reliability)))
            self.tableSources.setItem(row, 4, QTableWidgetItem(str(credibility)))
            self.tableSources.setItem(row, 5, QTableWidgetItem(stance or ''))
            tags_text = ''
            try:
                tags_text = ','.join(json.loads(metadata).get('tags', [])) if metadata else ''
            except Exception:
                tags_text = ''
            self.tableSources.setItem(row, 6, QTableWidgetItem(tags_text))
            self.tableSources.setItem(row, 7, QTableWidgetItem(media_path or ''))

    def add_topic(self):
        dlg = EditTopicDialog(groups=self.db.get_all_group_names(), parent=self)
        dlg.setWindowTitle('Add Topic')
        if dlg.exec() == QDialog.Accepted:
            title = dlg.txtEditTitle.text().strip()
            group = dlg.cboEditGroup.currentText().strip() or 'Uncategorized'
            # save date with or without time depending on checkbox
            if getattr(dlg, 'chkEditEnableTime', None) and dlg.chkEditEnableTime.isChecked():
                event_date = dlg.dtEditEventDate.dateTime().toString(Qt.ISODate)
            else:
                event_date = dlg.dtEditEventDate.date().toString(Qt.ISODate)
            if title:
                self.db.add_topic(title, group, event_date)
                self.load_topics()

    def edit_topic(self):
        item = self.treeTopics.currentItem()
        if not item:
            return
        topic_id = item.data(0, Qt.UserRole)
        if topic_id is None:
            return
        # find topic detail
        topics = self.db.get_all_topics()
        for tid, title, group_name, event_date in topics:
            if tid == topic_id:
                dlg = EditTopicDialog(title=title, group=group_name, event_date=event_date, groups=self.db.get_all_group_names(), parent=self)
                if dlg.exec() == QDialog.Accepted:
                    new_title = dlg.txtEditTitle.text().strip()
                    new_group = dlg.cboEditGroup.currentText().strip() or 'Uncategorized'
                    if getattr(dlg, 'chkEditEnableTime', None) and dlg.chkEditEnableTime.isChecked():
                        new_event = dlg.dtEditEventDate.dateTime().toString(Qt.ISODate)
                    else:
                        new_event = dlg.dtEditEventDate.date().toString(Qt.ISODate)
                    self.db.update_topic(topic_id, new_title, new_group, new_event)
                    self.load_topics()
                break

    def delete_topic(self):
        item = self.treeTopics.currentItem()
        if not item:
            return
        topic_id = item.data(0, Qt.UserRole)
        if topic_id is None:
            return
        if QMessageBox.question(self, 'Delete Topic', 'Delete this topic and all its sources?') == QMessageBox.StandardButton.Yes:
            self.db.delete_topic(topic_id)
            self.load_topics()
            self.tableSources.setRowCount(0)
            self.lblSourcesFor.setText('Sources for: (No topic selected)')

    def add_source(self):
        if not self._current_topic_id:
            QMessageBox.warning(self, 'No Topic', 'Please select a topic first.')
            return
        dlg = SourceDialog(parent=self)
        # populate tag suggestions
        try:
            tags = self.db.get_all_tags()
            for t in tags:
                dlg.cboTagInput.addItem(t)
        except Exception:
            pass
        if dlg.exec() == QDialog.Accepted:
            uri, description, metadata, media_path = dlg.get_data()
            stype = dlg.cboSourceType.currentText() if hasattr(dlg, 'cboSourceType') else 'Link'
            reliability = int(dlg.cboReliability.currentText()) if dlg.cboReliability.currentText().isdigit() else 0
            credibility = int(dlg.cboCredibility.currentText()) if dlg.cboCredibility.currentText().isdigit() else 0
            stance = dlg.cboStance.currentText() if hasattr(dlg, 'cboStance') else 'Supports'
            self.db.add_source(self._current_topic_id, uri, stype, reliability, credibility, json.dumps(metadata or {}), stance, description, media_path)
            self.load_sources_for_topic(self._current_topic_id)

    def edit_source(self):
        row = self.tableSources.currentRow()
        if row < 0:
            return
        item = self.tableSources.item(row, 0)
        if not item:
            return
        sid = item.data(Qt.UserRole)
        if not sid:
            return
        # fetch source row from DB
        rows = self.db.get_sources_for_topic(self._current_topic_id)
        src = None
        for r in rows:
            if r[0] == sid:
                src = r
                break
        if not src:
            return
        dlg = SourceDialog(source_data=src, parent=self)
        try:
            tags = self.db.get_all_tags()
            for t in tags:
                dlg.cboTagInput.addItem(t)
        except Exception:
            pass
        if dlg.exec() == QDialog.Accepted:
            uri, description, metadata, media_path = dlg.get_data()
            stype = dlg.cboSourceType.currentText() if hasattr(dlg, 'cboSourceType') else 'Link'
            reliability = int(dlg.cboReliability.currentText()) if dlg.cboReliability.currentText().isdigit() else 0
            credibility = int(dlg.cboCredibility.currentText()) if dlg.cboCredibility.currentText().isdigit() else 0
            stance = dlg.cboStance.currentText() if hasattr(dlg, 'cboStance') else 'Supports'
            self.db.update_source(sid, uri, stype, reliability, credibility, json.dumps(metadata or {}), stance, description, media_path)
            self.load_sources_for_topic(self._current_topic_id)

    def delete_source(self):
        row = self.tableSources.currentRow()
        if row < 0:
            return
        item = self.tableSources.item(row, 0)
        if not item:
            return
        sid = item.data(Qt.UserRole)
        if not sid:
            return
        if QMessageBox.question(self, 'Delete Source', 'Delete this source?') == QMessageBox.StandardButton.Yes:
            self.db.delete_source(sid)
            self.load_sources_for_topic(self._current_topic_id)

    def on_filter_changed(self, _):
        if self._current_topic_id:
            self.load_sources_for_topic(self._current_topic_id)


if __name__ == '__main__':
    # Prefer bundled ffmpeg if present
    try:
        ffmpeg_utils.prepend_bundled_ffmpeg_to_path()
    except Exception:
        pass

    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())
